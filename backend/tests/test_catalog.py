from __future__ import annotations

import io
import json
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from apps.catalog.models import compute_fine_troy_oz


def _make_png_bytes(color=(200, 200, 200)) -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", (64, 64), color=color)
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_weight_normalization():
    # 1kg .999 Copper -> 1000 / 31.1034768 * 0.999 = 32.118596 troy oz
    fine_kg = compute_fine_troy_oz(Decimal("1"), "KG", Decimal("0.999"), "COPPER")
    assert fine_kg == Decimal("32.118596")

    # 1 troy oz .999 Silver
    fine_ozt = compute_fine_troy_oz(Decimal("1"), "OZ_T", Decimal("0.999"), "SILVER")
    assert fine_ozt == Decimal("0.999000")

    # Non-bullion paper note -> 0
    assert compute_fine_troy_oz(Decimal("10"), "G", Decimal("1"), "NONE") == Decimal("0.000000")


@pytest.mark.django_db
def test_tenant_isolation_containers_photos_and_sorting(api_client, user_a, user_b):
    _, _, token_a = user_a
    _, _, token_b = user_b
    headers_a = {"HTTP_AUTHORIZATION": f"Bearer {token_a}"}
    headers_b = {"HTTP_AUTHORIZATION": f"Bearer {token_b}"}

    # Create nested containers for User A
    safe_resp = api_client.post(
        "/api/v1/catalog/containers",
        data=json.dumps({"name": "Home Safe", "container_type": "SAFE"}),
        content_type="application/json",
        **headers_a,
    )
    assert safe_resp.status_code == 201
    safe_id = safe_resp.json()["id"]

    tube_resp = api_client.post(
        "/api/v1/catalog/containers",
        data=json.dumps({"name": "ASE Tube", "container_type": "TUBE", "parent_id": safe_id}),
        content_type="application/json",
        **headers_a,
    )
    assert tube_resp.status_code == 201
    tube_id = tube_resp.json()["id"]

    # Create 2 items for User A
    item1_resp = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps({
            "container_id": tube_id,
            "category": "COIN",
            "title": "Tube of 20 Silver Eagles",
            "quantity": 20,
            "metal_type": "SILVER",
            "weight_value": "1.0",
            "weight_unit": "OZ_T",
            "purity": "0.999",
            "market_value_unit": "35.00",
            "purchase_price": "600.00",
        }),
        content_type="application/json",
        **headers_a,
    )
    assert item1_resp.status_code == 201
    item1_id = item1_resp.json()["id"]

    item2_resp = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps({
            "category": "PAPER",
            "title": "1928 $100 Gold Certificate",
            "serial_number": "A12345678B",
            "market_value_unit": "1200.00",
        }),
        content_type="application/json",
        **headers_a,
    )
    assert item2_resp.status_code == 201

    # User B cannot access User A's item
    assert api_client.get(f"/api/v1/catalog/items/{item1_id}", **headers_b).status_code == 404
    assert api_client.delete(f"/api/v1/catalog/items/{item1_id}", **headers_b).status_code == 404

    # Container rollup
    tree = api_client.get("/api/v1/catalog/containers", **headers_a).json()
    assert len(tree) == 1
    assert tree[0]["total_item_count"] == 20
    assert Decimal(tree[0]["total_market_value"]) == Decimal("700.00")

    # Sort by market_value_total desc -> $1200 paper bill first, then $700 tube
    sorted_items = api_client.get(
        "/api/v1/catalog/items?sort=-market_value_total", **headers_a
    ).json()
    assert [i["title"] for i in sorted_items] == [
        "1928 $100 Gold Certificate",
        "Tube of 20 Silver Eagles",
    ]

    # Multi-photo upload
    obverse = SimpleUploadedFile("obverse.png", _make_png_bytes((255, 0, 0)), content_type="image/png")
    reverse = SimpleUploadedFile("reverse.png", _make_png_bytes((0, 255, 0)), content_type="image/png")
    p1 = api_client.post(
        f"/api/v1/catalog/items/{item1_id}/photos",
        data={"file": obverse, "label": "OBVERSE", "is_primary": "true"},
        **headers_a,
    )
    assert p1.status_code == 201
    p2 = api_client.post(
        f"/api/v1/catalog/items/{item1_id}/photos",
        data={"file": reverse, "label": "REVERSE", "is_primary": "false"},
        **headers_a,
    )
    assert p2.status_code == 201
    detail = api_client.get(f"/api/v1/catalog/items/{item1_id}", **headers_a).json()
    assert len(detail["photos"]) == 2
    assert detail["photos"][0]["width"] == 64


@pytest.mark.django_db
def test_csv_import_and_export(api_client, user_a):
    _, _, token_a = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token_a}"}

    csv_content = (
        b"title,category,quantity,metal_type,weight_value,weight_unit,purity,market_value_unit\n"
        b"Geiger 1oz Silver Square,BAR,2,SILVER,1,OZ_T,0.999,42.00\n"
        b",COIN,1,SILVER,1,OZ_T,0.999,30.00\n"
    )
    upload = SimpleUploadedFile("holdings.csv", csv_content, content_type="text/csv")

    imp = api_client.post("/api/v1/catalog/items/import/csv", data={"file": upload}, **headers)
    assert imp.status_code == 200
    assert imp.json()["created_count"] == 1
    assert len(imp.json()["errors"]) == 1

    exp = api_client.get("/api/v1/catalog/items/export/csv", **headers)
    assert exp.status_code == 200
    assert "Geiger 1oz Silver Square" in exp.content.decode("utf-8")


@pytest.mark.django_db
def test_bulk_update_and_bulk_delete_with_tenant_isolation(api_client, user_a, user_b):
    _, ws_a, token_a = user_a
    _, ws_b, token_b = user_b
    headers_a = {"HTTP_AUTHORIZATION": f"Bearer {token_a}"}
    headers_b = {"HTTP_AUTHORIZATION": f"Bearer {token_b}"}

    box_a = api_client.post(
        "/api/v1/catalog/containers",
        data=json.dumps({"name": "Slab Box A", "container_type": "BOX"}),
        content_type="application/json",
        **headers_a,
    ).json()

    ids_a: list[str] = []
    for title in ("Morgan 1881-S", "Peace 1922", "ASE 2024"):
        resp = api_client.post(
            "/api/v1/catalog/items",
            data=json.dumps({"title": title, "category": "COIN", "metal_type": "SILVER"}),
            content_type="application/json",
            **headers_a,
        )
        assert resp.status_code == 201
        ids_a.append(resp.json()["id"])

    item_b = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps({"title": "User B Coin", "category": "COIN"}),
        content_type="application/json",
        **headers_b,
    ).json()

    # Bulk update: categorize as SLAB, set status FOR_SALE, move to box_a, add tags
    upd_resp = api_client.post(
        "/api/v1/catalog/items/bulk-update",
        data=json.dumps({
            "item_ids": [ids_a[0], ids_a[1], item_b["id"]],
            "category": "SLAB",
            "status": "FOR_SALE",
            "container_id": box_a["id"],
            "add_tags": ["graded", "silver"],
        }),
        content_type="application/json",
        **headers_a,
    )
    assert upd_resp.status_code == 200
    # Only User A's 2 items should be updated, never User B's item
    assert upd_resp.json()["updated_count"] == 2

    d0 = api_client.get(f"/api/v1/catalog/items/{ids_a[0]}", **headers_a).json()
    assert d0["category"] == "SLAB"
    assert d0["status"] == "FOR_SALE"
    assert d0["container_id"] == box_a["id"]
    assert d0["tags"] == ["graded", "silver"]

    db = api_client.get(f"/api/v1/catalog/items/{item_b['id']}", **headers_b).json()
    assert db["category"] == "COIN"

    # Bulk delete: only User A's items are deleted
    del_resp = api_client.post(
        "/api/v1/catalog/items/bulk-delete",
        data=json.dumps({"item_ids": [ids_a[0], ids_a[1], item_b["id"]]}),
        content_type="application/json",
        **headers_a,
    )
    assert del_resp.status_code == 200
    assert del_resp.json()["deleted_count"] == 2
    assert api_client.get("/api/v1/catalog/items", **headers_a).json() == [
        api_client.get(f"/api/v1/catalog/items/{ids_a[2]}", **headers_a).json()
    ]
    assert api_client.get(f"/api/v1/catalog/items/{item_b['id']}", **headers_b).status_code == 200


@pytest.mark.django_db
def test_image_background_removal_and_tight_crop(api_client, user_a):
    from PIL import ImageDraw

    from apps.catalog.image_processing import process_item_image

    # Build a 200x200 image with a white studio background and a gold circular coin in the center
    img = Image.new("RGB", (200, 200), color=(248, 248, 248))
    draw = ImageDraw.Draw(img)
    draw.ellipse((50, 50, 150, 150), fill=(212, 175, 55))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)

    processed_bytes, width, height, ext = process_item_image(
        buf.getvalue(), remove_background=True, enhance=True
    )
    assert ext == "png"
    # Tightly cropped around the 100x100 coin + ~4% padding (should be much smaller than 200x200)
    assert width < 140
    assert height < 140

    out_img = Image.open(io.BytesIO(processed_bytes))
    assert out_img.mode == "RGBA"
    # Corners must be transparent, center coin must be opaque
    assert out_img.getpixel((0, 0))[3] == 0
    assert out_img.getpixel((width // 2, height // 2))[3] > 200

    # Also verify upload + remove-background endpoint
    _, _, token_a = user_a
    headers_a = {"HTTP_AUTHORIZATION": f"Bearer {token_a}"}
    item = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps({"title": "Gold Coin", "category": "COIN"}),
        content_type="application/json",
        **headers_a,
    ).json()

    upload = SimpleUploadedFile("coin.jpg", buf.getvalue(), content_type="image/jpeg")
    p_resp = api_client.post(
        f"/api/v1/catalog/items/{item['id']}/photos",
        data={"file": upload, "label": "OBVERSE", "is_primary": "true", "remove_background": "true"},
        **headers_a,
    )
    assert p_resp.status_code == 201
    photo_data = p_resp.json()
    assert photo_data["width"] < 140
    assert photo_data["url"].endswith(".png")

    bg_resp = api_client.post(
        f"/api/v1/catalog/items/{item['id']}/photos/{photo_data['id']}/remove-background",
        **headers_a,
    )
    assert bg_resp.status_code == 200


@pytest.mark.django_db
def test_media_files_served_when_debug_false(api_client, user_a, settings):
    settings.DEBUG = False

    img = Image.new("RGB", (50, 50), color=(212, 175, 55))
    buf = io.BytesIO()
    img.save(buf, format="PNG")

    _, _, token_a = user_a
    headers_a = {"HTTP_AUTHORIZATION": f"Bearer {token_a}"}
    item = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps({"title": "Silver Bar", "category": "BAR"}),
        content_type="application/json",
        **headers_a,
    ).json()

    upload = SimpleUploadedFile("bar.png", buf.getvalue(), content_type="image/png")
    p_resp = api_client.post(
        f"/api/v1/catalog/items/{item['id']}/photos",
        data={"file": upload, "label": "OBVERSE", "is_primary": "true", "remove_background": "false"},
        **headers_a,
    )
    assert p_resp.status_code == 201
    photo_url = p_resp.json()["url"]
    assert photo_url.startswith("/media/")

    media_resp = api_client.get(photo_url)
    assert media_resp.status_code == 200
    assert media_resp["Content-Type"] == "image/png"


@pytest.mark.django_db
def test_patterned_background_removal_and_slab_coin_extraction(api_client, user_a):
    from PIL import ImageDraw

    from apps.catalog.image_processing import process_item_image

    # Build a 400x560 synthetic NGC-like slab on a textured/speckled background
    img = Image.new("RGB", (400, 560), color=(245, 245, 245))
    draw = ImageDraw.Draw(img)
    # Add disconnected dark background speckles in bottom-right (simulating patterned desk/mat)
    for y in range(420, 555, 8):
        for x in range(280, 395, 8):
            draw.rectangle((x, y, x + 4, y + 4), fill=(45, 45, 45))

    # Draw slab body (white insert with dark outer rim)
    draw.rounded_rectangle((60, 40, 340, 500), radius=18, fill=(238, 238, 238), outline=(70, 70, 70), width=6)
    # Top label area
    draw.rectangle((80, 60, 320, 175), fill=(250, 250, 250), outline=(140, 140, 140), width=2)
    draw.rectangle((95, 80, 240, 110), fill=(40, 40, 40))
    # Circular silver coin in lower half of slab (cx=200, cy=335, r=95)
    draw.ellipse((105, 240, 295, 430), fill=(175, 178, 182), outline=(60, 60, 60), width=4)
    draw.ellipse((135, 270, 265, 400), fill=(205, 208, 212))

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)

    # 1. process_item_image removes all disconnected speckles and preserves the full slab
    cleaned_bytes, cw, ch, cext = process_item_image(buf.getvalue(), remove_background=True, enhance=True)
    assert cext == "png"
    cleaned_img = Image.open(io.BytesIO(cleaned_bytes))
    assert cleaned_img.mode == "RGBA"
    # Full slab should be roughly 280x460 (+padding), not bloated by bottom-right speckles
    assert cw < 320
    assert ch < 515
    assert cleaned_img.getpixel((0, 0))[3] == 0
    assert cleaned_img.getpixel((cw - 1, ch - 1))[3] == 0

    # 2. Uploading OBVERSE & REVERSE on a SLAB item extracts coin-only front/back + auto-saves SLAB_LABEL
    _, _, token_a = user_a
    headers_a = {"HTTP_AUTHORIZATION": f"Bearer {token_a}"}
    item = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps({
            "title": "2025 W Eagle S$1",
            "category": "SLAB",
            "grading_service": "NGC",
            "grade": "PF 70 ULTRA CAMEO",
        }),
        content_type="application/json",
        **headers_a,
    ).json()

    obv_upload = SimpleUploadedFile("slab_front.jpg", buf.getvalue(), content_type="image/jpeg")
    obv_resp = api_client.post(
        f"/api/v1/catalog/items/{item['id']}/photos",
        data={"file": obv_upload, "label": "OBVERSE", "is_primary": "true", "remove_background": "true"},
        **headers_a,
    )
    assert obv_resp.status_code == 201
    obv_data = obv_resp.json()
    # Coin-only cutout should be roughly square (~190x190 + padding), much shorter than the full slab
    assert abs(obv_data["width"] - obv_data["height"]) < 25
    assert obv_data["height"] < 260

    rev_upload = SimpleUploadedFile("slab_back.jpg", buf.getvalue(), content_type="image/jpeg")
    rev_resp = api_client.post(
        f"/api/v1/catalog/items/{item['id']}/photos",
        data={"file": rev_upload, "label": "REVERSE", "is_primary": "false", "remove_background": "true"},
        **headers_a,
    )
    assert rev_resp.status_code == 201
    rev_data = rev_resp.json()
    assert abs(rev_data["width"] - rev_data["height"]) < 25
    assert rev_data["height"] < 260

    # Item should now have 3 photos: OBVERSE (coin), REVERSE (coin), and SLAB_LABEL (full slab view)
    detail = api_client.get(f"/api/v1/catalog/items/{item['id']}", **headers_a).json()
    labels = [p["label"] for p in detail["photos"]]
    assert "OBVERSE" in labels
    assert "REVERSE" in labels
    assert "SLAB_LABEL" in labels
    slab_photo = next(p for p in detail["photos"] if p["label"] == "SLAB_LABEL")
    assert slab_photo["height"] > slab_photo["width"] * 1.2
    assert slab_photo["is_primary"] is False


@pytest.mark.django_db
def test_bar_and_note_cropping_on_textured_dark_mat(api_client, user_a):
    from PIL import ImageDraw

    from apps.catalog.image_processing import process_item_image

    # Build a dark woven mat background (simulating carbon-fiber mat)
    mat = Image.new("RGB", (500, 650), color=(24, 24, 26))
    mat_draw = ImageDraw.Draw(mat)
    for y in range(0, 650, 8):
        for x in range(0, 500, 8):
            if ((x // 8) + (y // 8)) % 2 == 0:
                mat_draw.rectangle((x, y, x + 5, y + 5), fill=(46, 46, 50))

    # 1. Off-center horizontal silver bar with dark mirror reflection inside
    bar_img = mat.copy()
    bar_draw = ImageDraw.Draw(bar_img)
    bar_draw.rounded_rectangle((35, 90, 465, 320), radius=20, fill=(190, 192, 196), outline=(228, 230, 234), width=5)
    bar_draw.rectangle((90, 200, 410, 295), fill=(32, 34, 38))
    bar_buf = io.BytesIO()
    bar_img.save(bar_buf, format="JPEG", quality=95)

    bar_bytes, bw, bh, bext = process_item_image(
        bar_buf.getvalue(), remove_background=True, enhance=True, shape_hint="bar"
    )
    assert bext == "png"
    assert 390 <= bw <= 455
    assert 205 <= bh <= 255
    bar_out = Image.open(io.BytesIO(bar_bytes))
    assert bar_out.getpixel((0, 0))[3] == 0
    assert bar_out.getpixel((bw - 1, bh - 1))[3] == 0
    # Interior dark reflection must remain opaque
    assert bar_out.getpixel((bw // 2, int(bh * 0.72)))[3] > 200

    # 2. Banknote (PAPER) on dark woven mat via API upload + remove-background
    note_img = mat.copy()
    note_draw = ImageDraw.Draw(note_img)
    note_draw.rectangle((40, 130, 460, 310), fill=(210, 215, 195), outline=(85, 115, 80), width=6)
    note_draw.ellipse((190, 175, 310, 265), fill=(65, 80, 65))
    note_buf = io.BytesIO()
    note_img.save(note_buf, format="JPEG", quality=95)

    _, _, token_a = user_a
    headers_a = {"HTTP_AUTHORIZATION": f"Bearer {token_a}"}
    item = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps({"title": "1934 $10 Silver Certificate", "category": "PAPER"}),
        content_type="application/json",
        **headers_a,
    ).json()

    upload = SimpleUploadedFile("note.jpg", note_buf.getvalue(), content_type="image/jpeg")
    p_resp = api_client.post(
        f"/api/v1/catalog/items/{item['id']}/photos",
        data={"file": upload, "label": "OBVERSE", "is_primary": "true", "remove_background": "true"},
        **headers_a,
    )
    assert p_resp.status_code == 201
    p_data = p_resp.json()
    assert 390 <= p_data["width"] <= 445
    assert 165 <= p_data["height"] <= 205




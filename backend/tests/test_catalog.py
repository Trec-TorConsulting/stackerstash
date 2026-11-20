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
    assert ext == "webp"
    assert (width, height) == (200, 200)

    out_img = Image.open(io.BytesIO(processed_bytes))
    assert out_img.size == (200, 200)

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
        data={"file": upload, "label": "OBVERSE", "is_primary": "true"},
        **headers_a,
    )
    assert p_resp.status_code == 201
    photo_data = p_resp.json()
    # Server auto-crop (default on) frames the 100px coin as a padded square.
    assert photo_data["width"] == photo_data["height"]
    assert 100 <= photo_data["width"] <= 125
    assert photo_data["url"].endswith(".webp")

    # Clients that already cropped (or users who kept the original) opt out.
    upload_raw = SimpleUploadedFile("coin.jpg", buf.getvalue(), content_type="image/jpeg")
    raw_resp = api_client.post(
        f"/api/v1/catalog/items/{item['id']}/photos",
        data={"file": upload_raw, "label": "REVERSE", "auto_crop": "false"},
        **headers_a,
    )
    assert raw_resp.status_code == 201
    assert (raw_resp.json()["width"], raw_resp.json()["height"]) == (200, 200)


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
    assert media_resp["Content-Type"] == "image/webp"


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

    # 1. process_item_image preserves the full image without background removal
    cleaned_bytes, cw, ch, cext = process_item_image(buf.getvalue(), remove_background=True, enhance=True)
    assert cext == "webp"
    cleaned_img = Image.open(io.BytesIO(cleaned_bytes))
    assert (cw, ch) == img.size
    assert cleaned_img.size == img.size

    # 2. Uploading OBVERSE & REVERSE on a SLAB item preserves the full slab photos without coin-only cropping
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
    # Auto-crop keeps the WHOLE slab (280x460 body + padding), never just the coin.
    assert 280 <= obv_data["width"] < img.size[0]
    assert 460 <= obv_data["height"] < img.size[1]

    rev_upload = SimpleUploadedFile("slab_back.jpg", buf.getvalue(), content_type="image/jpeg")
    rev_resp = api_client.post(
        f"/api/v1/catalog/items/{item['id']}/photos",
        data={"file": rev_upload, "label": "REVERSE", "is_primary": "false", "remove_background": "true"},
        **headers_a,
    )
    assert rev_resp.status_code == 201
    rev_data = rev_resp.json()
    assert (rev_data["width"], rev_data["height"]) == (obv_data["width"], obv_data["height"])

    # Item should have the 2 uploaded photos (OBVERSE & REVERSE) without auto-extracted SLAB_LABEL
    detail = api_client.get(f"/api/v1/catalog/items/{item['id']}", **headers_a).json()
    labels = [p["label"] for p in detail["photos"]]
    assert labels == ["OBVERSE", "REVERSE"]


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
    assert bext == "webp"
    assert (bw, bh) == bar_img.size

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
    # Note (420x180) is cropped out of the 500x650 mat as a wide rectangle.
    assert 420 <= p_data["width"] <= 500
    assert 180 <= p_data["height"] < 300
    assert p_data["width"] / p_data["height"] > 1.6


def test_offcenter_goldback_on_woven_mat_with_glare():
    from PIL import ImageDraw

    from apps.catalog.image_processing import detect_subject_crop_box

    # Off-center Goldback near top-left on a woven carbon-fiber mat with
    # bright specular glare in the bottom-right corner.
    img = Image.new("RGB", (500, 560), color=(58, 62, 62))
    draw = ImageDraw.Draw(img)
    for y in range(0, 560, 6):
        for x in range(0, 500, 6):
            base = 76 if ((x // 6) + (y // 6)) % 2 == 0 else 52
            if x > 280 and y > 280:
                glare = min(145, int(((x - 280) + (y - 280)) * 0.45))
                base = min(245, base + glare)
            draw.rectangle((x, y, x + 5, y + 5), fill=(base, base, base))

    draw.rectangle((22, 20, 240, 380), fill=(205, 165, 95), outline=(140, 105, 45), width=4)
    draw.rectangle((45, 55, 215, 340), fill=(195, 152, 82))

    box = detect_subject_crop_box(img, shape_hint="rect")
    assert box is not None
    left, top, right, bottom = box
    assert left <= 22
    assert top <= 20
    assert 240 <= right <= 285
    assert 380 <= bottom <= 425


@pytest.mark.django_db
def test_proof_coin_and_sleeved_note_background_removal():
    from PIL import ImageDraw

    from apps.catalog.image_processing import extract_coin_and_slab_images, process_item_image

    # Build a dark woven mat background (simulating carbon-fiber mat)
    mat = Image.new("RGB", (480, 480), color=(22, 22, 24))
    mat_draw = ImageDraw.Draw(mat)
    for y in range(0, 480, 8):
        for x in range(0, 480, 8):
            if ((x // 8) + (y // 8)) % 2 == 0:
                mat_draw.rectangle((x, y, x + 5, y + 5), fill=(42, 42, 46))

    # 1. Proof silver round with dark mirror fields and bright rim/devices on dark mat
    coin_img = mat.copy()
    coin_draw = ImageDraw.Draw(coin_img)
    # Bright silver rim, dark mirror interior, bright frosted center device
    coin_draw.ellipse((110, 110, 370, 370), fill=(26, 28, 32), outline=(215, 218, 222), width=10)
    coin_draw.ellipse((195, 195, 285, 285), fill=(205, 208, 214))
    coin_buf = io.BytesIO()
    coin_img.save(coin_buf, format="JPEG", quality=95)

    (coin_bytes, cw, ch, cext), slab_res = extract_coin_and_slab_images(coin_buf.getvalue(), enhance=True)
    assert slab_res is None
    assert cext == "png"
    assert 240 <= cw <= 290
    assert 240 <= ch <= 290
    coin_out = Image.open(io.BytesIO(coin_bytes))
    assert coin_out.getpixel((0, 0))[3] == 0
    # Dark mirror field inside coin must remain opaque (not eaten as background)
    assert coin_out.getpixel((cw // 2, int(ch * 0.25)))[3] > 200
    assert coin_out.getpixel((cw // 2, ch // 2))[3] > 200

    # 2. Goldback/banknote inside a rectangular clear sleeve on a dark mat
    note_img = mat.copy()
    note_draw = ImageDraw.Draw(note_img)
    # Clear sleeve outline (slightly lighter border over dark mat)
    note_draw.rectangle((45, 95, 435, 345), fill=(36, 36, 40), outline=(145, 145, 150), width=3)
    # Goldback note inside the sleeve
    note_draw.rectangle((85, 135, 395, 305), fill=(195, 160, 75), outline=(225, 195, 110), width=4)
    note_buf = io.BytesIO()
    note_img.save(note_buf, format="JPEG", quality=95)

    note_bytes, nw, nh, next_ = process_item_image(
        note_buf.getvalue(), remove_background=True, enhance=True, shape_hint="note"
    )
    assert next_ == "webp"
    assert (nw, nh) == note_img.size


@pytest.mark.django_db
def test_small_slab_coin_extraction_rotate_and_gross_weight_fallback(api_client, user_a):
    from decimal import Decimal

    from PIL import ImageDraw

    from apps.catalog.image_processing import extract_coin_and_slab_images
    from apps.catalog.models import CollectionItem

    # 1. Small-denomination coin (dime, r=42 in 260px-wide slab => ~0.16 * slab_w)
    img = Image.new("RGB", (400, 560), color=(245, 245, 245))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((70, 40, 330, 500), radius=18, fill=(238, 238, 238), outline=(70, 70, 70), width=6)
    draw.rectangle((90, 60, 310, 170), fill=(250, 250, 250), outline=(140, 140, 140), width=2)
    draw.ellipse((158, 290, 242, 374), fill=(180, 184, 190), outline=(55, 55, 55), width=4)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)

    (coin_bytes, cw, ch, cext), slab_res = extract_coin_and_slab_images(buf.getvalue(), enhance=True)
    assert slab_res is not None
    assert cext == "png"
    assert abs(cw - ch) < 20
    assert cw < 120

    # 2. Photo rotation endpoint swaps dimensions on 90-degree rotation
    _, workspace_a, token_a = user_a
    headers_a = {"HTTP_AUTHORIZATION": f"Bearer {token_a}"}
    item_resp = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps({
            "title": "Test Silver Round",
            "category": "ROUND",
            "metal_type": "SILVER",
            "weight_value": "0",
            "weight_unit": "OZ_T",
            "purity": "0.999",
            "gross_weight_grams": "31.10",
        }),
        content_type="application/json",
        **headers_a,
    ).json()

    db_item = CollectionItem.objects.get(id=item_resp["id"], workspace=workspace_a)
    assert db_item.fine_troy_oz > Decimal("0.99")

    rect_img = Image.new("RGBA", (120, 80), color=(200, 170, 60, 255))
    rect_buf = io.BytesIO()
    rect_img.save(rect_buf, format="PNG")
    upload = SimpleUploadedFile("bar.png", rect_buf.getvalue(), content_type="image/png")
    p_resp = api_client.post(
        f"/api/v1/catalog/items/{item_resp['id']}/photos",
        data={"file": upload, "label": "OBVERSE", "is_primary": "true", "remove_background": "false"},
        **headers_a,
    ).json()

    rot_resp = api_client.post(
        f"/api/v1/catalog/items/{item_resp['id']}/photos/{p_resp['id']}/rotate",
        data=json.dumps({"degrees": 90}),
        content_type="application/json",
        **headers_a,
    )
    assert rot_resp.status_code == 200
    rot_data = rot_resp.json()
    assert rot_data["width"] == 80
    assert rot_data["height"] == 120


def test_concentric_inner_coin_and_already_cutout_guard():
    from PIL import ImageDraw

    from apps.catalog.image_processing import detect_circular_coin

    # 1. Small coin (r=56) centered in a 480x480 dark assay card with off-center white text blocks
    card = Image.new("RGB", (480, 480), color=(15, 22, 48))
    draw = ImageDraw.Draw(card)
    # Distractor text-like bars on the right side
    for y in range(180, 310, 14):
        draw.rectangle((300, y, 440, y + 6), fill=(210, 218, 235))
    # Centered small coin with high-contrast rim and interior relief
    cx, cy, r = 240, 240, 56
    draw.ellipse((cx - r - 4, cy - r - 4, cx + r + 4, cy + r + 4), fill=(8, 10, 20), outline=(215, 220, 230), width=3)
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(185, 190, 198), outline=(245, 245, 250), width=3)
    for k in range(-32, 36, 8):
        draw.line((cx - 28, cy + k, cx + 28, cy - k), fill=(65, 70, 80), width=2)

    detected = detect_circular_coin(card)
    assert detected is not None
    dcx, dcy, dr = detected
    assert abs(dcx - cx) <= 16
    assert abs(dcy - cy) <= 16
    assert abs(dr - r) <= 16

    # 2. Already-cutout RGBA circular coin must not be sub-cropped to an inner detail circle
    cutout = Image.new("RGBA", (400, 400), color=(0, 0, 0, 0))
    cdraw = ImageDraw.Draw(cutout)
    cdraw.ellipse((4, 4, 396, 396), fill=(190, 195, 200, 255), outline=(90, 95, 100, 255), width=4)
    assert detect_circular_coin(cutout) is None


def test_goldback_on_shadowed_white_paper_sheet_background_removal():
    from PIL import ImageDraw

    from apps.catalog.image_processing import process_item_image

    # Simulate an 894x771 white paper sheet with a directional shadow gradient (155 on left -> 230 on right)
    # and a thin transparent top border sliver (as produced when the paper edge touches the top of the frame).
    w, h = 440, 380
    sheet = Image.new("RGBA", (w, h), color=(0, 0, 0, 0))
    px = sheet.load()
    for y in range(10, h):
        for x in range(w):
            v = int(155 + (230 - 155) * (x / w))
            px[x, y] = (v, v, max(0, v - 3), 255)

    draw = ImageDraw.Draw(sheet)
    # Goldback note in center (~55% width, ~38% height -> ~21% area) with dark & bright foil reflections
    gx0, gy0, gx1, gy1 = 98, 118, 342, 262
    draw.rectangle((gx0, gy0, gx1, gy1), fill=(155, 122, 68, 255), outline=(182, 148, 86, 255), width=3)
    draw.rectangle((gx0 + 30, gy0 + 40, gx1 - 40, gy1 - 10), fill=(52, 40, 28, 255))
    draw.ellipse((gx0 + 45, gy0 + 2, gx0 + 95, gy0 + 18), fill=(235, 215, 165, 255))

    buf = io.BytesIO()
    sheet.save(buf, format="PNG")

    out_bytes, out_w, out_h, out_ext = process_item_image(
        buf.getvalue(), remove_background=True, enhance=True, shape_hint="note"
    )
    assert out_ext == "png"
    assert (out_w, out_h) == sheet.size

    # Verify studio shadow-lift brightened the dark shadow region inside the Goldback
    out_img = Image.open(io.BytesIO(out_bytes)).convert("RGBA")
    center_r, center_g, center_b, center_a = out_img.getpixel((out_w // 2, out_h // 2))
    assert center_a > 200
    assert center_r > 35 and center_g > 28


def test_assay_card_with_mixed_border_and_small_coin_preserves_full_card():
    from PIL import ImageDraw

    from apps.catalog.image_processing import process_item_image

    # White desk with dark top/bottom desk edges + dark-artwork assay card containing an off-center bright coin
    img = Image.new("RGB", (600, 800), (225, 225, 225))
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, 599, 75), fill=(18, 18, 22))
    draw.rectangle((0, 725, 599, 799), fill=(18, 18, 22))

    # Assay card: dark left half, colorful right half, small coin in top-right
    draw.rectangle((60, 230, 540, 560), fill=(25, 28, 35))
    draw.rectangle((260, 235, 535, 555), fill=(110, 85, 145))
    draw.ellipse((395, 275, 485, 365), fill=(210, 212, 218), outline=(140, 145, 152), width=3)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)

    out_bytes, out_w, out_h, out_ext = process_item_image(
        buf.getvalue(), remove_background=True, enhance=True, shape_hint="coin"
    )
    assert out_ext == "webp"
    assert (out_w, out_h) == (600, 800)











def test_detect_subject_crop_box_is_conservative():
    from PIL import ImageDraw

    from apps.catalog.image_processing import detect_subject_crop_box, process_item_image

    # Blank surface: nothing to crop.
    blank = Image.new("RGB", (400, 300), color=(128, 128, 128))
    assert detect_subject_crop_box(blank) is None

    # Subject already fills the frame (e.g. client-side crop): crop would gain nothing.
    full = Image.new("RGB", (400, 300), color=(20, 20, 20))
    ImageDraw.Draw(full).rectangle((6, 6, 394, 294), fill=(220, 210, 190))
    assert detect_subject_crop_box(full) is None

    # Off-centre loose coin on a dark desk: square crop containing the full rim.
    coin = Image.new("RGB", (640, 480), color=(35, 33, 30))
    ImageDraw.Draw(coin).ellipse((360, 140, 560, 340), fill=(200, 200, 206), outline=(90, 90, 95), width=5)
    box = detect_subject_crop_box(coin, shape_hint="coin")
    assert box is not None
    left, top, right, bottom = box
    assert right - left == bottom - top
    assert left <= 360 and top <= 140 and right >= 560 and bottom >= 340
    assert (right - left) <= 240

    # auto_crop=False (default) never changes framing.
    buf = io.BytesIO()
    coin.save(buf, format="JPEG", quality=95)
    _, w, h, _ = process_item_image(buf.getvalue(), enhance=False)
    assert (w, h) == (640, 480)
    _, cw, ch, _ = process_item_image(buf.getvalue(), enhance=False, auto_crop=True, shape_hint="coin")
    assert cw == ch and cw < 480


def test_receipt_upload_crops_to_sheet_not_printed_coin(api_client, user_a):
    from PIL import ImageDraw

    _, _, token_a = user_a
    headers_a = {"HTTP_AUTHORIZATION": f"Bearer {token_a}"}
    item = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps({"title": "Silver Eagle", "category": "COIN"}),
        content_type="application/json",
        **headers_a,
    ).json()

    img = Image.new("RGB", (600, 800), color=(40, 38, 36))
    draw = ImageDraw.Draw(img)
    draw.rectangle((100, 80, 500, 720), fill=(245, 245, 240))
    draw.ellipse((250, 150, 350, 250), fill=(150, 150, 155))  # printed coin logo
    for y in range(300, 680, 30):
        draw.rectangle((140, y, 460, y + 10), fill=(60, 60, 60))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)

    resp = api_client.post(
        f"/api/v1/catalog/items/{item['id']}/photos",
        data={"file": SimpleUploadedFile("r.jpg", buf.getvalue(), content_type="image/jpeg"), "label": "RECEIPT"},
        **headers_a,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["width"] >= 400 and data["height"] >= 640
    assert data["width"] < 600 and data["height"] < 800


@pytest.mark.django_db
def test_clear_slab_bulk_update_and_quantity_patch(api_client, user_a):
    _, _, token_a = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token_a}"}

    item = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps({
            "title": "2024 Silver Eagle",
            "category": "SLAB",
            "grading_service": "PCGS",
            "grade": "MS70",
            "cert_number": "12345678",
            "attributes": {"slab_designation": "First Strike"},
            "quantity": 1,
        }),
        content_type="application/json",
        **headers,
    ).json()

    # Quantity update works and rejects < 1
    bad_qty = api_client.patch(
        f"/api/v1/catalog/items/{item['id']}",
        data=json.dumps({"quantity": 0}),
        content_type="application/json",
        **headers,
    )
    assert bad_qty.status_code == 400

    ok_qty = api_client.patch(
        f"/api/v1/catalog/items/{item['id']}",
        data=json.dumps({"quantity": 4}),
        content_type="application/json",
        **headers,
    )
    assert ok_qty.status_code == 200
    assert ok_qty.json()["quantity"] == 4

    # Bulk clear_slab removes all slabbed/graded info and resets SLAB category to COIN
    bulk = api_client.post(
        "/api/v1/catalog/items/bulk-update",
        data=json.dumps({"item_ids": [item["id"]], "clear_slab": True}),
        content_type="application/json",
        **headers,
    )
    assert bulk.status_code == 200
    assert bulk.json()["updated_count"] == 1

    refreshed = api_client.get(f"/api/v1/catalog/items/{item['id']}", **headers).json()
    assert refreshed["category"] == "COIN"
    assert refreshed["grading_service"] == "NONE"
    assert refreshed["grade"] == ""
    assert refreshed["cert_number"] == ""
    assert "slab_designation" not in (refreshed["attributes"] or {})


def test_detect_subject_crop_box_goldback_on_textured_weave_with_glare():
    from PIL import ImageDraw

    from apps.catalog.image_processing import detect_subject_crop_box

    # Simulate a Goldback on a carbon-fiber weave mat with diagonal glare
    w, h = 480, 640
    img = Image.new("RGB", (w, h), color=(48, 52, 56))
    draw = ImageDraw.Draw(img)
    for y in range(0, h, 8):
        for x in range(0, w, 8):
            glare = 90 if (x + y) > (w + h) * 0.6 else 0
            if ((x // 8) + (y // 8)) % 2 == 0:
                draw.rectangle((x, y, x + 5, y + 5), fill=(72 + glare, 76 + glare, 80 + glare))

    # Goldback rectangle (120..360, 140..500)
    draw.rectangle((120, 140, 360, 500), fill=(225, 190, 95), outline=(180, 140, 60), width=4)
    draw.rectangle((150, 180, 330, 460), fill=(205, 165, 80))

    box = detect_subject_crop_box(img, shape_hint="note")
    assert box is not None
    left, top, right, bottom = box
    assert left <= 120 and top <= 140 and right >= 360 and bottom >= 500
    assert (right - left) < 300 and (bottom - top) < 420


@pytest.mark.django_db
def test_symmetrical_obverse_and_reverse_cropping(api_client, user_a):
    from PIL import ImageDraw

    _, _, token_a = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token_a}"}
    item = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps({"title": "2023 Utah Goldback", "category": "PAPER"}),
        content_type="application/json",
        **headers,
    ).json()

    # Front: 240x360 note on 600x800 dark mat
    front = Image.new("RGB", (600, 800), color=(40, 40, 42))
    ImageDraw.Draw(front).rectangle((180, 220, 420, 580), fill=(225, 190, 95))
    f_buf = io.BytesIO()
    front.save(f_buf, format="JPEG", quality=95)

    # Back: slightly differently framed 260x350 note on 600x800 dark mat
    back = Image.new("RGB", (600, 800), color=(40, 40, 42))
    ImageDraw.Draw(back).rectangle((170, 225, 430, 575), fill=(215, 180, 90))
    b_buf = io.BytesIO()
    back.save(b_buf, format="JPEG", quality=95)

    r1 = api_client.post(
        f"/api/v1/catalog/items/{item['id']}/photos",
        data={"file": SimpleUploadedFile("f.jpg", f_buf.getvalue(), content_type="image/jpeg"), "label": "OBVERSE"},
        **headers,
    )
    assert r1.status_code == 201
    d1 = r1.json()

    r2 = api_client.post(
        f"/api/v1/catalog/items/{item['id']}/photos",
        data={"file": SimpleUploadedFile("b.jpg", b_buf.getvalue(), content_type="image/jpeg"), "label": "REVERSE"},
        **headers,
    )
    assert r2.status_code == 201
    d2 = r2.json()

    assert (d2["width"], d2["height"]) == (d1["width"], d1["height"])
    assert d1["width"] < 600 and d1["height"] < 800


@pytest.mark.django_db
def test_thumbnail_generation_rotation_and_legacy_fallback(api_client, user_a):
    from apps.catalog.models import ItemPhoto

    _, _, token_a = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token_a}"}
    item = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps({"title": "Thumbnail Test Coin", "category": "COIN"}),
        content_type="application/json",
        **headers,
    ).json()

    img = Image.new("RGB", (900, 700), color=(180, 140, 60))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=92)

    up_resp = api_client.post(
        f"/api/v1/catalog/items/{item['id']}/photos",
        data={"file": SimpleUploadedFile("coin.jpg", buf.getvalue(), content_type="image/jpeg"), "label": "OBVERSE"},
        **headers,
    )
    assert up_resp.status_code == 201
    up_data = up_resp.json()
    assert up_data["thumbnail_url"] is not None
    assert up_data["thumbnail_url"].endswith(".webp")
    assert up_data["thumbnail_url"] != up_data["url"]

    list_resp = api_client.get("/api/v1/catalog/items", **headers)
    assert list_resp.status_code == 200
    assert list_resp.json()[0]["primary_thumbnail_url"] == up_data["thumbnail_url"]

    photo_obj = ItemPhoto.objects.get(id=up_data["id"])
    old_thumb_name = photo_obj.thumbnail.name

    rot_resp = api_client.post(
        f"/api/v1/catalog/items/{item['id']}/photos/{up_data['id']}/rotate",
        data=json.dumps({"degrees": 90}),
        content_type="application/json",
        **headers,
    )
    assert rot_resp.status_code == 200
    rot_data = rot_resp.json()
    assert rot_data["thumbnail_url"] != up_data["thumbnail_url"]
    assert not photo_obj.thumbnail.storage.exists(old_thumb_name)

    # Legacy fallback when thumbnail is null
    photo_obj.refresh_from_db()
    photo_obj.thumbnail = None
    photo_obj.save(update_fields=["thumbnail"])
    detail_resp = api_client.get(f"/api/v1/catalog/items/{item['id']}", **headers)
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["primary_thumbnail_url"] == detail["primary_photo_url"]
    assert detail["photos"][0]["thumbnail_url"] == detail["photos"][0]["url"]


@pytest.mark.django_db
def test_assay_upload_on_coin_crops_to_rect_card(api_client, user_a):
    from PIL import ImageDraw

    _, _, token_a = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token_a}"}
    item = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps({"title": "1 oz Silver Coin", "category": "COIN"}),
        content_type="application/json",
        **headers,
    ).json()

    # Rectangular assay card (360x560) with an embedded coin circle on a dark mat (600x800)
    img = Image.new("RGB", (600, 800), color=(35, 35, 38))
    draw = ImageDraw.Draw(img)
    draw.rectangle((120, 120, 480, 680), fill=(240, 238, 232), outline=(180, 175, 165), width=3)
    draw.ellipse((220, 320, 380, 480), fill=(205, 208, 214), outline=(130, 132, 138), width=3)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)

    resp = api_client.post(
        f"/api/v1/catalog/items/{item['id']}/photos",
        data={
            "file": SimpleUploadedFile("assay.jpg", buf.getvalue(), content_type="image/jpeg"),
            "label": "ASSAY",
        },
        **headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    # Must frame the rectangular assay card (height > width), not collapse onto the square coin
    assert data["height"] > data["width"]
    assert data["width"] >= 350 and data["height"] >= 550
    assert data["width"] < 600 and data["height"] < 800


@pytest.mark.django_db
def test_duplicate_slab_cert_number_prevented(api_client, user_a, user_b):
    _user_a, _ws_a, token_a = user_a
    _user_b, _ws_b, token_b = user_b
    headers_a = {"HTTP_AUTHORIZATION": f"Bearer {token_a}"}
    headers_b = {"HTTP_AUTHORIZATION": f"Bearer {token_b}"}

    # 1. Create first slab with cert_number
    r1 = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps({
            "title": "1921 Morgan Dollar PCGS MS64",
            "category": "SLAB",
            "grading_service": "PCGS",
            "cert_number": "45678901",
        }),
        content_type="application/json",
        **headers_a,
    )
    assert r1.status_code == 201
    item1_id = r1.json()["id"]

    # 2. Duplicate cert_number in same workspace is rejected with 409
    r_dup = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps({
            "title": "Duplicate Morgan",
            "category": "SLAB",
            "grading_service": "PCGS",
            "cert_number": " 45678901 ",
        }),
        content_type="application/json",
        **headers_a,
    )
    assert r_dup.status_code == 409

    # 3. Same cert_number in a different workspace is allowed
    r_other_ws = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps({
            "title": "1921 Morgan Dollar PCGS MS64",
            "category": "SLAB",
            "grading_service": "PCGS",
            "cert_number": "45678901",
        }),
        content_type="application/json",
        **headers_b,
    )
    assert r_other_ws.status_code == 201

    # 4. Multiple items with empty cert_number in same workspace are allowed
    r_empty1 = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps({"title": "Raw Coin 1", "category": "COIN", "cert_number": ""}),
        content_type="application/json",
        **headers_a,
    )
    r_empty2 = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps({"title": "Raw Coin 2", "category": "COIN", "cert_number": ""}),
        content_type="application/json",
        **headers_a,
    )
    assert r_empty1.status_code == 201
    assert r_empty2.status_code == 201
    item2_id = r_empty2.json()["id"]

    # 5. Updating another item to a duplicate cert_number is rejected with 409
    r_patch_dup = api_client.patch(
        f"/api/v1/catalog/items/{item2_id}",
        data=json.dumps({"cert_number": "45678901"}),
        content_type="application/json",
        **headers_a,
    )
    assert r_patch_dup.status_code == 409

    # 6. Updating the original item with its own cert_number succeeds
    r_patch_self = api_client.patch(
        f"/api/v1/catalog/items/{item1_id}",
        data=json.dumps({"cert_number": "45678901", "grade": "MS65"}),
        content_type="application/json",
        **headers_a,
    )
    assert r_patch_self.status_code == 200
    assert r_patch_self.json()["grade"] == "MS65"


@pytest.mark.django_db
def test_signed_media_blocks_unsigned_tampered_expired_and_traversal(api_client, user_a, settings):
    from config.media_signing import build_signed_media_url

    settings.DEBUG = False
    _, _, token_a = user_a
    headers_a = {"HTTP_AUTHORIZATION": f"Bearer {token_a}"}

    item = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps({"title": "Signed Bar", "category": "BAR"}),
        content_type="application/json",
        **headers_a,
    ).json()

    img = Image.new("RGB", (60, 60), color=(212, 175, 55))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    upload = SimpleUploadedFile("bar.png", buf.getvalue(), content_type="image/png")

    p_resp = api_client.post(
        f"/api/v1/catalog/items/{item['id']}/photos",
        data={"file": upload, "label": "OBVERSE", "is_primary": "true"},
        **headers_a,
    )
    assert p_resp.status_code == 201
    signed_url = p_resp.json()["url"]
    assert signed_url.startswith("/media/s/")
    assert signed_url.endswith(".webp")

    # 1. Valid signed URL returns 200
    assert api_client.get(signed_url).status_code == 200

    # Extract relative path from /media/s/<exp>/<sig>/<rel_path>
    parts = signed_url.split("/", 5)
    exp_str, sig, rel_path = parts[3], parts[4], parts[5]

    # 2. Unsigned direct path -> 403
    assert api_client.get(f"/media/{rel_path}").status_code == 403

    # 3. Tampered signature -> 403
    bad_sig = ("0" if sig[0] != "0" else "1") + sig[1:]
    assert api_client.get(f"/media/s/{exp_str}/{bad_sig}/{rel_path}").status_code == 403

    # 4. Expired signed URL -> 403
    expired_url = build_signed_media_url(rel_path, now=0)
    assert api_client.get(expired_url).status_code == 403

    # 5. Path traversal -> 404
    assert api_client.get("/media/..%2F..%2Fetc%2Fpasswd").status_code == 404
    assert api_client.get(f"/media/s/{exp_str}/{sig}/../secret.webp").status_code == 404

    # 6. Missing signed file -> 404
    missing_url = build_signed_media_url("workspaces/missing/none.webp")
    assert api_client.get(missing_url).status_code == 404


@pytest.mark.django_db
def test_container_cycle_guard_rollup_duplicate_item_and_thumbnail_cleanup(api_client, user_a):
    from apps.catalog.models import ItemPhoto

    _, ws, token_a = user_a
    headers_a = {"HTTP_AUTHORIZATION": f"Bearer {token_a}"}

    # Build A -> B -> C container hierarchy
    c_a = api_client.post(
        "/api/v1/catalog/containers",
        data=json.dumps({"name": "Safe A", "container_type": "SAFE"}),
        content_type="application/json",
        **headers_a,
    ).json()
    c_b = api_client.post(
        "/api/v1/catalog/containers",
        data=json.dumps({"name": "Box B", "container_type": "BOX", "parent_id": c_a["id"]}),
        content_type="application/json",
        **headers_a,
    ).json()
    c_c = api_client.post(
        "/api/v1/catalog/containers",
        data=json.dumps({"name": "Tube C", "container_type": "TUBE", "parent_id": c_b["id"]}),
        content_type="application/json",
        **headers_a,
    ).json()

    # Multi-hop cycle A -> C -> A rejected with 400
    cycle_resp = api_client.patch(
        f"/api/v1/catalog/containers/{c_a['id']}",
        data=json.dumps({
            "name": "Safe A",
            "container_type": "SAFE",
            "parent_id": c_c["id"],
            "location_notes": "Corner",
        }),
        content_type="application/json",
        **headers_a,
    )
    assert cycle_resp.status_code == 400

    # Create item in C and patch B -> returns real rolled-up total_item_count & children
    item = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps({
            "title": "1921 Morgan Dollar",
            "category": "SLAB",
            "container_id": c_c["id"],
            "quantity": 2,
            "grading_service": "PCGS",
            "cert_number": "99887766",
            "grade": "MS64",
            "market_value_unit": "90.00",
        }),
        content_type="application/json",
        **headers_a,
    ).json()

    patch_b = api_client.patch(
        f"/api/v1/catalog/containers/{c_b['id']}",
        data=json.dumps({
            "name": "Box B Updated",
            "container_type": "BOX",
            "parent_id": c_a["id"],
            "location_notes": "Top Shelf",
        }),
        content_type="application/json",
        **headers_a,
    )
    assert patch_b.status_code == 200
    b_data = patch_b.json()
    assert b_data["name"] == "Box B Updated"
    assert b_data["total_item_count"] == 2
    assert len(b_data["children"]) == 1
    assert b_data["children"][0]["id"] == c_c["id"]

    # Mark item SOLD, then duplicate -> resets status, clears cert_number & sold fields
    api_client.patch(
        f"/api/v1/catalog/items/{item['id']}",
        data=json.dumps({"status": "SOLD", "sold_price": "190.00", "sold_date": "2026-01-15"}),
        content_type="application/json",
        **headers_a,
    )
    dup_resp = api_client.post(
        f"/api/v1/catalog/items/{item['id']}/duplicate",
        **headers_a,
    )
    assert dup_resp.status_code == 201
    dup = dup_resp.json()
    assert dup["title"] == "1921 Morgan Dollar (Copy)"
    assert dup["status"] == "IN_COLLECTION"
    assert dup["cert_number"] == ""
    assert dup["sold_price"] is None
    assert dup["sold_date"] is None

    # Upload 2 photos with thumbnails, delete one photo -> image & thumbnail removed from disk
    def _upload_one():
        im = Image.new("RGB", (60, 60), color=(180, 180, 180))
        b = io.BytesIO()
        im.save(b, format="PNG")
        return api_client.post(
            f"/api/v1/catalog/items/{dup['id']}/photos",
            data={"file": SimpleUploadedFile("c.png", b.getvalue(), content_type="image/png"), "label": "OBVERSE"},
            **headers_a,
        ).json()

    p1 = _upload_one()
    p2 = _upload_one()
    photo1 = ItemPhoto.objects.get(id=p1["id"])
    photo2 = ItemPhoto.objects.get(id=p2["id"])
    st = photo1.image.storage
    p1_img, p1_thumb = photo1.image.name, photo1.thumbnail.name
    p2_img, p2_thumb = photo2.image.name, photo2.thumbnail.name
    assert st.exists(p1_img) and st.exists(p1_thumb)

    del_p1 = api_client.delete(
        f"/api/v1/catalog/items/{dup['id']}/photos/{p1['id']}",
        **headers_a,
    )
    assert del_p1.status_code == 204
    assert not st.exists(p1_img)
    assert not st.exists(p1_thumb)

    # Bulk delete remaining duplicated item -> photo2 image & thumbnail also removed from disk
    bulk_del = api_client.post(
        "/api/v1/catalog/items/bulk-delete",
        data=json.dumps({"item_ids": [dup["id"]]}),
        content_type="application/json",
        **headers_a,
    )
    assert bulk_del.status_code == 200
    assert bulk_del.json()["deleted_count"] == 1
    assert not st.exists(p2_img)
    assert not st.exists(p2_thumb)


@pytest.mark.django_db
def test_catalog_models_goldback_filters_cards_photos_and_import_edges(api_client, user_a, monkeypatch):
    from decimal import Decimal
    from unittest.mock import patch

    from apps.accounts.models import AccountSubscription, PlanTier
    from apps.catalog.api import (
        _apply_card_fields,
        _csv_safe_cell,
        _find_container_node,
        _item_shape_hint,
        _should_extract_coin_from_slab,
    )
    from apps.catalog.goldback import get_goldback_weight_ozt, parse_goldback_denomination
    from apps.catalog.models import CollectionItem, Container, ItemPhoto, compute_fine_troy_oz

    owner, ws, token = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    # Enable PLUS tier so we can create multiple items cleanly for filter/bulk tests
    AccountSubscription.objects.update_or_create(
        user=owner,
        defaults={
            "tier": PlanTier.PLUS,
            "source": AccountSubscription.Source.ADMIN_OVERRIDE,
            "status": AccountSubscription.Status.ACTIVE,
        },
    )

    # Model helper lines 32, 41, 82, 396, 441
    assert compute_fine_troy_oz(1, "OZ_AVDP", None, "GOLD") == Decimal("0.911458")
    assert get_goldback_weight_ozt(None) is None
    assert parse_goldback_denomination("", "Utah 5 Goldback Note", "") == "5"
    assert parse_goldback_denomination("", "", "Contains 1/100 oz 24K Gold") == "10"
    assert parse_goldback_denomination("", "Silver Round", "") is None
    assert _csv_safe_cell(None) == ""
    assert _find_container_node([], "00000000-0000-0000-0000-000000000001") is None

    safe = Container.objects.create(workspace=ws, name="Home Safe", container_type=Container.ContainerType.SAFE)
    assert "Home Safe" in str(safe)

    # Presets endpoint + container 404 + container delete
    assert api_client.get("/api/v1/catalog/items/presets", **headers).status_code == 200
    assert (
        api_client.post(
            "/api/v1/catalog/items",
            data=json.dumps({
                "title": "Bad Container",
                "category": "COIN",
                "container_id": "00000000-0000-0000-0000-000000000099",
            }),
            content_type="application/json",
            **headers,
        ).status_code
        == 404
    )
    temp_box = Container.objects.create(workspace=ws, name="Temp Box")
    with patch("apps.catalog.api._build_container_tree", return_value=[]):
        fallback_upd = api_client.patch(
            f"/api/v1/catalog/containers/{temp_box.id}",
            data=json.dumps({"name": "Temp Box Renamed"}),
            content_type="application/json",
            **headers,
        )
        assert fallback_upd.status_code == 200
        assert fallback_upd.json()["name"] == "Temp Box Renamed"
    assert api_client.delete(f"/api/v1/catalog/containers/{temp_box.id}", **headers).status_code == 204

    # Card field sync & provenance (lines 406, 410-412, 416, 418, 420, 1065, 1071-1076, 1082)
    card_resp = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps({
            "title": "Charizard Base Set",
            "category": "CARD",
            "card_game": "Pokemon",
            "set_name": "Base Set",
            "card_number": "4/102",
        }),
        content_type="application/json",
        **headers,
    )
    assert card_resp.status_code == 201
    card_id = card_resp.json()["id"]
    card_obj = CollectionItem.objects.get(id=card_id)
    assert card_obj.series == "Base Set"
    assert "Charizard Base Set" in str(card_obj)

    patch_card = api_client.patch(
        f"/api/v1/catalog/items/{card_id}",
        data=json.dumps({
            "container_id": str(safe.id),
            "mint_mark": "W",
            "card_edition": "Shadowless",
            "card_number": "",
            "market_value_unit": "350.00",
        }),
        content_type="application/json",
        **headers,
    )
    assert patch_card.status_code == 200
    assert patch_card.json()["mint_mark"] == "W"
    patch_clear_mint = api_client.patch(
        f"/api/v1/catalog/items/{card_id}",
        data=json.dumps({"mint_mark": ""}),
        content_type="application/json",
        **headers,
    )
    assert patch_clear_mint.status_code == 200
    # Exercise line 420: item.series set, set_name absent, is_card_item=True
    card_obj.refresh_from_db()
    card_obj.attributes.pop("set_name", None)
    _apply_card_fields(card_obj, {"rarity": "Holo"})
    assert card_obj.attributes["set_name"] == "Base Set"

    # List filters: category, graded=False, metal_type, container_id, grading_service, status, is_estimate, tag, q
    coin = CollectionItem.objects.create(
        workspace=ws,
        container=safe,
        title="2024 Gold Buffalo",
        category="COIN",
        metal_type="GOLD",
        grading_service="NGC",
        status="IN_COLLECTION",
        is_estimate=True,
        tags=["bullion", "old"],
    )
    raw_coin = CollectionItem.objects.create(
        workspace=ws,
        title="1964 Kennedy Half",
        category="COIN",
        metal_type="SILVER",
        grading_service="NONE",
        status="IN_COLLECTION",
        tags=["junk"],
    )
    f_resp = api_client.get(
        f"/api/v1/catalog/items?category=COIN&metal_type=GOLD&container_id={safe.id}"
        "&grading_service=NGC&status=IN_COLLECTION&is_estimate=true&tag=bullion&q=Buffalo",
        **headers,
    )
    assert f_resp.status_code == 200
    assert [i["id"] for i in f_resp.json()] == [str(coin.id)]
    raw_resp = api_client.get("/api/v1/catalog/items?graded=false", **headers)
    assert any(i["id"] == str(raw_coin.id) for i in raw_resp.json())

    # Bulk delete & bulk update validation + updates
    assert (
        api_client.post(
            "/api/v1/catalog/items/bulk-delete",
            data=json.dumps({"item_ids": []}),
            content_type="application/json",
            **headers,
        ).json()["deleted_count"]
        == 0
    )
    assert (
        api_client.post(
            "/api/v1/catalog/items/bulk-update",
            data=json.dumps({"item_ids": []}),
            content_type="application/json",
            **headers,
        ).json()["updated_count"]
        == 0
    )
    for bad_payload in (
        {"item_ids": [str(coin.id)], "category": "BAD"},
        {"item_ids": [str(coin.id)], "status": "BAD"},
        {"item_ids": [str(coin.id)], "metal_type": "BAD"},
        {"item_ids": [str(coin.id)], "grading_service": "BAD"},
    ):
        assert (
            api_client.post(
                "/api/v1/catalog/items/bulk-update",
                data=json.dumps(bad_payload),
                content_type="application/json",
                **headers,
            ).status_code
            == 400
        )
    assert (
        api_client.post(
            "/api/v1/catalog/items/bulk-update",
            data=json.dumps({"item_ids": ["00000000-0000-0000-0000-000000000099"]}),
            content_type="application/json",
            **headers,
        ).json()["updated_count"]
        == 0
    )
    bu_resp = api_client.post(
        "/api/v1/catalog/items/bulk-update",
        data=json.dumps({
            "item_ids": [str(coin.id)],
            "clear_container": True,
            "metal_type": "SILVER",
            "grading_service": "PCGS",
            "remove_tags": ["old"],
            "add_tags": ["updated"],
        }),
        content_type="application/json",
        **headers,
    )
    assert bu_resp.status_code == 200 and bu_resp.json()["updated_count"] == 1
    coin.refresh_from_db()
    assert coin.container is None and coin.metal_type == "SILVER" and coin.tags == ["bullion", "updated"]

    # Shape hint & slab extraction helpers (lines 1182-1193, 1208, 1217, 1233)
    pmg_note = CollectionItem.objects.create(
        workspace=ws, title="$5 Silver Certificate", category="PAPER", grading_service="PMG"
    )
    assay_item = CollectionItem.objects.create(
        workspace=ws, title="PAMP Assay Certificate of Authenticity", category="OTHER"
    )
    other_item = CollectionItem.objects.create(workspace=ws, title="Display Case", category="OTHER")
    assert _should_extract_coin_from_slab(coin, ItemPhoto.Label.RECEIPT) is False
    assert _should_extract_coin_from_slab(card_obj, ItemPhoto.Label.OBVERSE) is False
    assert _should_extract_coin_from_slab(pmg_note, ItemPhoto.Label.OBVERSE) is False
    slab_pmg = CollectionItem.objects.create(workspace=ws, title="Note Slab", category="SLAB", grading_service="PMG")
    assert _should_extract_coin_from_slab(slab_pmg, ItemPhoto.Label.OBVERSE) is False
    assert _should_extract_coin_from_slab(coin, ItemPhoto.Label.OBVERSE) is True
    assert _item_shape_hint(card_obj, ItemPhoto.Label.OBVERSE) == "rect"
    assert _item_shape_hint(pmg_note, ItemPhoto.Label.OBVERSE) == "note"
    assert _item_shape_hint(assay_item, ItemPhoto.Label.OBVERSE) == "rect"
    assert _item_shape_hint(other_item, ItemPhoto.Label.OBVERSE) is None

    # Photo upload errors, thumbnail failure fallbacks, rotate, set primary, delete item with photos
    buf = io.BytesIO()
    Image.new("RGB", (40, 40), (190, 190, 190)).save(buf, format="PNG")
    png_bytes = buf.getvalue()

    assert (
        api_client.post(
            f"/api/v1/catalog/items/{coin.id}/photos",
            data={"file": SimpleUploadedFile("bad.png", png_bytes, content_type="image/png"), "label": "INVALID"},
            **headers,
        ).status_code
        == 400
    )

    from types import SimpleNamespace

    from ninja.errors import HttpError

    from apps.catalog.api import upload_item_photo

    with monkeypatch.context() as mp:
        mp.setattr("apps.catalog.api.MAX_UPLOAD_BYTES", 5)
        fake_req = SimpleNamespace(workspace=ws, user=owner, workspace_role="OWNER")
        fake_file = SimpleNamespace(
            size=4,
            seek=lambda *_a: None,
            read=lambda *_a: b"1234567890",
        )
        with pytest.raises(HttpError) as exc_info:
            upload_item_photo(fake_req, coin.id, file=fake_file, label="OBVERSE")
        assert exc_info.value.status_code == 400

    with patch("apps.catalog.api.generate_image_thumbnail", side_effect=RuntimeError("thumb err")):
        p1 = api_client.post(
            f"/api/v1/catalog/items/{coin.id}/photos",
            data={"file": SimpleUploadedFile("p1.png", png_bytes, content_type="image/png"), "label": "OBVERSE"},
            **headers,
        ).json()
        p2 = api_client.post(
            f"/api/v1/catalog/items/{coin.id}/photos",
            data={"file": SimpleUploadedFile("p2.png", png_bytes, content_type="image/png"), "label": "REVERSE"},
            **headers,
        ).json()
        assert f"[{ItemPhoto.Label.OBVERSE}]" in str(ItemPhoto.objects.get(id=p1["id"]))
        assert (
            api_client.post(
                f"/api/v1/catalog/items/{coin.id}/photos/{p1['id']}/rotate",
                data=json.dumps({"degrees": 45}),
                content_type="application/json",
                **headers,
            ).status_code
            == 400
        )
        assert (
            api_client.post(
                f"/api/v1/catalog/items/{coin.id}/photos/{p1['id']}/rotate",
                data=json.dumps({"degrees": 90}),
                content_type="application/json",
                **headers,
            ).status_code
            == 200
        )

    prim = api_client.patch(f"/api/v1/catalog/items/{coin.id}/photos/{p2['id']}/primary", **headers)
    assert prim.status_code == 200 and prim.json()["is_primary"] is True
    assert api_client.delete(f"/api/v1/catalog/items/{coin.id}", **headers).status_code == 204

    # CSV mapped invalid JSON + bad Decimal row error + Free-tier CSV import limit (lines 1506-1513, 1565-1566, 1599-1602)
    assert (
        api_client.post(
            "/api/v1/catalog/items/import/mapped",
            data={
                "file": SimpleUploadedFile("a.csv", b"Title\nTest\n", content_type="text/csv"),
                "mapping": "[1, 2]",
            },
            **headers,
        ).status_code
        == 400
    )
    assert (
        api_client.post(
            "/api/v1/catalog/items/import/mapped",
            data={
                "file": SimpleUploadedFile("a.csv", b"Title\nTest\n", content_type="text/csv"),
                "mapping": "{bad",
            },
            **headers,
        ).status_code
        == 400
    )
    bad_row_resp = api_client.post(
        "/api/v1/catalog/items/import/csv",
        data={
            "file": SimpleUploadedFile(
                "badrow.csv",
                b"title,market_value_unit\nGood Coin,not_a_decimal\n",
                content_type="text/csv",
            )
        },
        **headers,
    )
    assert bad_row_resp.status_code == 200 and len(bad_row_resp.json()["errors"]) == 1

    # Lower to FREE and exhaust 100 active slots -> POST /items/import/csv returns 402 for active row
    AccountSubscription.objects.update_or_create(
        user=owner,
        defaults={
            "tier": PlanTier.FREE,
            "source": AccountSubscription.Source.ADMIN_OVERRIDE,
            "status": AccountSubscription.Status.ACTIVE,
        },
    )
    existing = CollectionItem.objects.filter(workspace=ws).count()
    CollectionItem.objects.bulk_create([
        CollectionItem(workspace=ws, title=f"Fill {i}", category="COIN")
        for i in range(100 - existing)
    ])
    assert (
        api_client.post(
            "/api/v1/catalog/items/import/csv",
            data={
                "file": SimpleUploadedFile(
                    "over.csv",
                    b"title,status\nOverQuota,IN_COLLECTION\n",
                    content_type="text/csv",
                )
            },
            **headers,
        ).status_code
        == 402
    )


@pytest.mark.django_db
def test_migration_0012_deduplicate_workspace_cert_numbers() -> None:
    import importlib
    from types import SimpleNamespace

    from django.apps import apps as django_apps
    from django.db import connection

    from apps.accounts.models import User, create_default_workspace_for_user
    from apps.catalog.models import CollectionItem

    mig = importlib.import_module(
        "apps.catalog.migrations.0012_collectionitem_uniq_workspace_cert_number"
    )
    user = User.objects.create_user(email="mig0012@example.com", password="Password123!")
    ws = create_default_workspace_for_user(user)

    older = CollectionItem.objects.create(
        workspace=ws,
        title="2007-S Utah Quarter Older",
        category="COIN",
        grading_service="NGC",
        cert_number="",
        notes="Existing note",
    )
    newer = CollectionItem.objects.create(
        workspace=ws,
        title="2007-S Utah Quarter PF67 Ultra Cameo",
        category="COIN",
        grading_service="NGC",
        cert_number="8866470-119",
    )

    class _FakeQuerySet(list):
        def order_by(self, *_args: str):
            return [newer, older]

    class _FakeManager:
        def using(self, _alias: str):
            return self

        def exclude(self, **_kwargs):
            return self

        def values(self, *_args: str):
            return self

        def annotate(self, **_kwargs):
            return self

        def filter(self, **kwargs):
            if "item_count__gt" in kwargs:
                return [{"workspace_id": ws.id, "cert_number": "8866470-119", "item_count": 2}]
            older.cert_number = "8866470-119"
            return _FakeQuerySet([newer, older])

    class _FakeModel:
        objects = _FakeManager()

    class _FakeApps:
        def get_model(self, app_label: str, model_name: str):
            assert (app_label, model_name) == ("catalog", "CollectionItem")
            return _FakeModel

    editor = SimpleNamespace(connection=connection)
    mig.deduplicate_workspace_cert_numbers(_FakeApps(), editor)
    # Also verify no-op when there are no duplicates in real DB
    mig.deduplicate_workspace_cert_numbers(django_apps, editor)

    older.refresh_from_db()
    newer.refresh_from_db()
    assert newer.cert_number == "8866470-119"
    assert older.cert_number == ""
    assert "Auto-cleared duplicate cert #8866470-119" in older.notes


@pytest.mark.django_db
def test_vision_and_csv_import_bounds_and_duplicate_cert_row_error(api_client, user_a):
    from unittest.mock import patch

    _, ws, token = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}", "HTTP_X_WORKSPACE_ID": str(ws.id)}

    # 1. Vision /identify file count (> 4) and empty/oversized file rejected with 400
    five_files = [
        SimpleUploadedFile(f"f{i}.jpg", b"img", content_type="image/jpeg")
        for i in range(5)
    ]
    assert api_client.post("/api/v1/vision/identify", data={"files": five_files}, **headers).status_code == 400
    empty_file = [SimpleUploadedFile("empty.jpg", b"", content_type="image/jpeg")]
    assert api_client.post("/api/v1/vision/identify", data={"files": empty_file}, **headers).status_code == 400
    with patch("apps.vision.api.MAX_VISION_FILE_BYTES", 4):
        big_file = [SimpleUploadedFile("big.jpg", b"12345678", content_type="image/jpeg")]
        assert api_client.post("/api/v1/vision/identify", data={"files": big_file}, **headers).status_code == 400

    # 2. CSV import empty / oversized file rejected with 400
    assert (
        api_client.post(
            "/api/v1/catalog/items/import/csv",
            data={"file": SimpleUploadedFile("empty.csv", b"", content_type="text/csv")},
            **headers,
        ).status_code
        == 400
    )
    with patch("apps.catalog.api.MAX_UPLOAD_BYTES", 8):
        assert (
            api_client.post(
                "/api/v1/catalog/items/import/preview",
                data={"file": SimpleUploadedFile("big.csv", b"title\nLongTitleRow\n", content_type="text/csv")},
                **headers,
            ).status_code
            == 400
        )

    # 3. Duplicate cert_number in CSV import recorded as row error instead of 500
    dup_csv = b"title,cert_number\nFirst Slab,CERT-999\nSecond Slab,CERT-999\n"
    dup_resp = api_client.post(
        "/api/v1/catalog/items/import/csv",
        data={"file": SimpleUploadedFile("dup.csv", dup_csv, content_type="text/csv")},
        **headers,
    )
    assert dup_resp.status_code == 200
    assert dup_resp.json()["created_count"] == 1
    assert len(dup_resp.json()["errors"]) == 1
    assert "duplicate cert_number" in dup_resp.json()["errors"][0]["error"].lower()


@pytest.mark.django_db
def test_upload_photo_heic_and_multi_format_support(api_client, user_a):
    from django.apps import apps

    from apps.catalog.models import CollectionItem

    # Test apps ready() methods
    apps.get_app_config("catalog").ready()
    apps.get_app_config("vision").ready()

    _, ws, token = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"}
    item = CollectionItem.objects.create(workspace=ws, title="Multi-Format Proof Target", category="COIN")

    # 1. HEIC / HEIF upload
    heif_buf = io.BytesIO()
    Image.new("RGB", (120, 120), (255, 215, 0)).save(heif_buf, format="HEIF")
    heif_upload = SimpleUploadedFile("coin.heic", heif_buf.getvalue(), content_type="image/heic")
    resp_heif = api_client.post(
        f"/api/v1/catalog/items/{item.id}/photos",
        data={"file": heif_upload, "label": "OBVERSE", "is_primary": "true"},
        **headers,
    )
    assert resp_heif.status_code == 201
    heif_data = resp_heif.json()
    assert heif_data["url"].endswith(".webp")
    assert heif_data["width"] > 0
    assert heif_data["height"] > 0

    # 2. TIFF upload
    tiff_buf = io.BytesIO()
    Image.new("RGB", (100, 100), (200, 200, 200)).save(tiff_buf, format="TIFF")
    tiff_upload = SimpleUploadedFile("coin.tiff", tiff_buf.getvalue(), content_type="image/tiff")
    resp_tiff = api_client.post(
        f"/api/v1/catalog/items/{item.id}/photos",
        data={"file": tiff_upload, "label": "REVERSE"},
        **headers,
    )
    assert resp_tiff.status_code == 201
    assert resp_tiff.json()["url"].endswith(".webp")

    # 3. BMP upload
    bmp_buf = io.BytesIO()
    Image.new("RGB", (80, 80), (100, 150, 200)).save(bmp_buf, format="BMP")
    bmp_upload = SimpleUploadedFile("coin.bmp", bmp_buf.getvalue(), content_type="image/bmp")
    resp_bmp = api_client.post(
        f"/api/v1/catalog/items/{item.id}/photos",
        data={"file": bmp_upload, "label": "OTHER"},
        **headers,
    )
    assert resp_bmp.status_code == 201
    assert resp_bmp.json()["url"].endswith(".webp")



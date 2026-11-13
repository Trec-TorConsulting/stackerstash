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

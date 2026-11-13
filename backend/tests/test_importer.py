from __future__ import annotations

import io
import json
from decimal import Decimal

import httpx
import pytest
import respx
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from apps.catalog.importer import (
    detect_preset_and_mapping,
    normalize_metal_type,
    parse_decimal_currency,
)
from apps.catalog.models import CollectionItem, ItemPhoto


def _fake_image_bytes(fmt: str = "JPEG") -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (32, 32), color=(212, 175, 55)).save(buf, format=fmt)
    return buf.getvalue()


def test_preset_detection_and_normalization_helpers():
    preset, mapping = detect_preset_and_mapping(
        ["Country", "Year", "Denomination", "Composition", "Grade", "Estimated Value", "Obverse Image"]
    )
    assert preset == "coinsnap"
    assert mapping["Country"] == "country"
    assert mapping["Estimated Value"] == "market_value_unit"
    assert mapping["Obverse Image"] == "obverse_image_url"

    preset_numista, _ = detect_preset_and_mapping(["N#", "Issuer", "Name", "Year", "Reference"])
    assert preset_numista == "numista"

    preset_pcgs, _ = detect_preset_and_mapping(["Cert #", "Coin", "Grade", "Price Guide"])
    assert preset_pcgs == "pcgs_ngc"

    assert parse_decimal_currency("$1,250.50") == Decimal("1250.50")
    assert parse_decimal_currency("N/A", Decimal("0")) == Decimal("0")
    assert normalize_metal_type("90% Silver (.900)") == "SILVER"
    assert normalize_metal_type("Copper-Nickel Clad") == "NONE"
    assert normalize_metal_type("Pure Copper .999") == "COPPER"


@pytest.mark.django_db
def test_preview_and_mapped_import_coinsnap_and_custom(api_client, user_a):
    _, ws, token = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    coinsnap_csv = (
        b"Country,Year,Denomination,Composition,Grade,Estimated Value,Comments\n"
        b'United States,1921,Morgan Dollar,"90% Silver",MS63,"$65.00",Nice toning\n'
        b'United States,1964,Kennedy Half Dollar,"90% Silver",AU58,"$12.50",\n'
    )

    preview_upload = SimpleUploadedFile("coinsnap.csv", coinsnap_csv, content_type="text/csv")
    prev_resp = api_client.post(
        "/api/v1/catalog/items/import/preview",
        data={"file": preview_upload},
        **headers,
    )
    assert prev_resp.status_code == 200
    prev_data = prev_resp.json()
    assert prev_data["detected_preset"] == "coinsnap"
    assert prev_data["total_rows"] == 2
    assert prev_data["normalized_preview"][0]["title"] == "1921 United States Morgan Dollar MS63"
    assert prev_data["normalized_preview"][0]["metal_type"] == "SILVER"
    assert prev_data["normalized_preview"][0]["market_value_unit"] == "65.00"

    # Custom CSV with explicit column mapping override
    custom_csv = (
        b"My Coin,Paid,Qty\n"
        b'1oz Gold Buffalo,"$2,750.00",2\n'
    )
    mapped_upload = SimpleUploadedFile("custom.csv", custom_csv, content_type="text/csv")
    imp_resp = api_client.post(
        "/api/v1/catalog/items/import/mapped",
        data={
            "file": mapped_upload,
            "mapping": json.dumps({"My Coin": "title", "Paid": "purchase_price", "Qty": "quantity"}),
            "import_photos": "false",
        },
        **headers,
    )
    assert imp_resp.status_code == 200
    assert imp_resp.json()["created_count"] == 1
    item = CollectionItem.objects.get(workspace=ws, title="1oz Gold Buffalo")
    assert item.quantity == 2
    assert item.purchase_price == Decimal("2750.00")


@pytest.mark.django_db
@respx.mock
def test_mapped_import_with_remote_photos_and_nonfatal_failures(api_client, user_a):
    _, ws, token = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    respx.get("https://cdn.example.com/obv.jpg").mock(
        return_value=httpx.Response(200, content=_fake_image_bytes("JPEG"))
    )
    respx.get("https://cdn.example.com/missing.jpg").mock(
        return_value=httpx.Response(404)
    )

    csv_bytes = (
        b"Country,Year,Denomination,Composition,Estimated Value,Obverse Image,Reverse Image\n"
        b"Canada,2024,Maple Leaf,Silver,$35.00,https://cdn.example.com/obv.jpg,https://cdn.example.com/missing.jpg\n"
    )

    upload = SimpleUploadedFile("coinsnap-photos.csv", csv_bytes, content_type="text/csv")
    resp = api_client.post(
        "/api/v1/catalog/items/import/mapped",
        data={"file": upload, "import_photos": "true"},
        **headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["created_count"] == 1
    assert len(body["errors"]) == 0
    assert len(body["warnings"]) == 1
    assert "missing.jpg" in body["warnings"][0]

    item = CollectionItem.objects.get(workspace=ws, country="Canada")
    photos = ItemPhoto.objects.filter(item=item)
    assert photos.count() == 1
    assert photos.first().label == ItemPhoto.Label.OBVERSE


@pytest.mark.django_db
@respx.mock
def test_coinsnap_real_export_headers_and_webp_photos(api_client, user_a):
    _, ws, token = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    respx.get("https://static.coinidentifierai.com/obv.webp").mock(
        return_value=httpx.Response(200, content=_fake_image_bytes("WEBP"))
    )
    respx.get("https://static.coinidentifierai.com/rev.webp").mock(
        return_value=httpx.Response(200, content=_fake_image_bytes("WEBP"))
    )

    csv_bytes = (
        b'Country,Issuer,Denomination,Subject,Krause Number,Year,Mintmark,Grade,"Value, USD (CoinSnap) ",Composition,Precious metal weight,"Melt value, USD",Obverse photo,Reverse photo,Value (MY),Note,Custom set\n'
        b'United States of America,USA,1 dime,Barber Dime,KM# 113,1909,No mintmark,AG,$ 4.0,Silver 0.900,2.25,$ 3.62,https://static.coinidentifierai.com/obv.webp,https://static.coinidentifierai.com/rev.webp,,Nice coin,\n'
    )

    preview_upload = SimpleUploadedFile("coinsnap-real.csv", csv_bytes, content_type="text/csv")
    prev_resp = api_client.post(
        "/api/v1/catalog/items/import/preview",
        data={"file": preview_upload},
        **headers,
    )
    assert prev_resp.status_code == 200
    prev_data = prev_resp.json()
    assert prev_data["detected_preset"] == "coinsnap"
    assert prev_data["suggested_mapping"]["Obverse photo"] == "obverse_image_url"
    assert prev_data["suggested_mapping"]["Reverse photo"] == "reverse_image_url"
    assert prev_data["suggested_mapping"]["Value, USD (CoinSnap) "] == "market_value_unit"
    assert prev_data["suggested_mapping"]["Subject"] == "series"
    assert prev_data["suggested_mapping"]["Precious metal weight"] == "weight_value"
    assert prev_data["suggested_mapping"]["Note"] == "notes"

    imp_upload = SimpleUploadedFile("coinsnap-real.csv", csv_bytes, content_type="text/csv")
    imp_resp = api_client.post(
        "/api/v1/catalog/items/import/mapped",
        data={"file": imp_upload, "import_photos": "true"},
        **headers,
    )
    assert imp_resp.status_code == 200
    body = imp_resp.json()
    assert body["created_count"] == 1
    assert body["errors"] == []
    assert body["warnings"] == []

    item = CollectionItem.objects.get(workspace=ws, series="Barber Dime")
    assert item.market_value_unit == Decimal("4.00")
    assert item.weight_value == Decimal("2.25")
    assert item.weight_unit == CollectionItem.WeightUnit.G
    assert item.notes == "Nice coin"

    photos = list(ItemPhoto.objects.filter(item=item).order_by("sort_order"))
    assert len(photos) == 2
    assert photos[0].label == ItemPhoto.Label.OBVERSE
    assert photos[0].is_primary is True
    assert photos[1].label == ItemPhoto.Label.REVERSE
    assert photos[1].is_primary is False


@pytest.mark.django_db
def test_slabbed_and_graded_csv_import_fields(api_client, user_a):
    _, ws, token = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    csv_bytes = (
        b"Coin,Grader,Cert #,Designation,Serial #,Custom set,Tags,Price Guide\n"
        b'1928 $20 Gold Certificate,PMG,80123456,EPQ,A99887766B,Safe Drawer 1,"slabbed,gold-cert","$1,450.00"\n'
        b'1921 Morgan Dollar,PCGS MS65,44556677,First Strike,,Safe Drawer 1,morgan,"$220.00"\n'
    )

    upload = SimpleUploadedFile("slabs.csv", csv_bytes, content_type="text/csv")
    resp = api_client.post(
        "/api/v1/catalog/items/import/mapped",
        data={"file": upload, "import_photos": "false"},
        **headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["created_count"] == 2
    assert body["errors"] == []

    note = CollectionItem.objects.get(workspace=ws, title="1928 $20 Gold Certificate")
    assert note.category == CollectionItem.Category.SLAB
    assert note.grading_service == CollectionItem.GradingService.PMG
    assert note.cert_number == "80123456"
    assert note.serial_number == "A99887766B"
    assert note.attributes.get("slab_designation") == "EPQ"
    assert note.container is not None
    assert note.container.name == "Safe Drawer 1"
    assert note.tags == ["slabbed", "gold-cert"]

    morgan = CollectionItem.objects.get(workspace=ws, title="1921 Morgan Dollar")
    assert morgan.category == CollectionItem.Category.SLAB
    assert morgan.grading_service == CollectionItem.GradingService.PCGS
    assert morgan.grade == "MS65"
    assert morgan.cert_number == "44556677"
    assert morgan.attributes.get("slab_designation") == "First Strike"
    assert morgan.container_id == note.container_id


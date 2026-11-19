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
def test_mapped_import_with_remote_photos_and_nonfatal_failures(
    api_client, user_a, monkeypatch
):
    import socket

    monkeypatch.setattr(
        "apps.catalog.importer.socket.getaddrinfo",
        lambda host, port, *a, **kw: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.215.14", port))
        ],
    )
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
def test_coinsnap_real_export_headers_and_webp_photos(api_client, user_a, monkeypatch):
    import socket

    monkeypatch.setattr(
        "apps.catalog.importer.socket.getaddrinfo",
        lambda host, port, *a, **kw: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.215.14", port))
        ],
    )
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


@pytest.mark.django_db
def test_importer_helpers_photo_limits_redirects_and_appraisals(user_a, monkeypatch):
    import socket
    from unittest.mock import patch

    import httpx
    import respx

    from apps.accounts.models import AccountSubscription, PlanTier
    from apps.catalog.importer import (
        _enqueue_csv_batch_appraisals,
        _resolve_container_by_name,
        _validate_public_http_url,
        import_mapped_csv,
        normalize_category,
        normalize_grading_service,
        normalize_metal_type,
        normalize_status,
        normalize_weight_unit,
        parse_decimal_currency,
        synthesize_title,
    )
    from apps.catalog.models import CollectionItem, Container, ItemPhoto

    owner, ws, _ = user_a

    # Preset detection & field parsing helpers
    from apps.catalog.importer import detect_preset_and_mapping

    p1, _ = detect_preset_and_mapping(["Title", "Metal_Type", "Weight_Unit"])
    assert p1 == "stackerstash"
    assert parse_decimal_currency(".") is None
    assert normalize_metal_type("   ") == CollectionItem.MetalType.NONE
    assert normalize_metal_type("Au gold") == CollectionItem.MetalType.GOLD
    assert normalize_metal_type("Sterling silver") == CollectionItem.MetalType.SILVER
    assert normalize_metal_type("Pt") == CollectionItem.MetalType.PLATINUM
    assert normalize_metal_type("Pd") == CollectionItem.MetalType.PALLADIUM
    assert normalize_metal_type("Cu") == CollectionItem.MetalType.COPPER
    assert normalize_metal_type("Aluminium") == CollectionItem.MetalType.NONE
    assert normalize_weight_unit("grams") == CollectionItem.WeightUnit.G
    assert normalize_weight_unit("kg") == CollectionItem.WeightUnit.KG
    assert normalize_weight_unit("oz_avdp") == CollectionItem.WeightUnit.OZ_AVDP
    assert normalize_weight_unit("ozt") == CollectionItem.WeightUnit.OZ_T
    for raw_cat, expected_cat in [
        ("Banknote", "PAPER"),
        ("Ingot Bar", "BAR"),
        ("Silver Round", "ROUND"),
        ("Pokemon Card", "CARD"),
        ("NGC Slab", "SLAB"),
        ("2x2 Flip", "FLIPPER"),
        ("Token Coin", "COIN"),
        ("Medallion", "OTHER"),
    ]:
        assert normalize_category(raw_cat) == expected_cat
    for raw_gr, expected_gr in [
        ("PCGS-Banknote", "PCGS_BANKNOTE"),
        ("PCGS MS65", "PCGS"),
        ("NGC MS70", "NGC"),
        ("PMG 66", "PMG"),
        ("CAC Approved", "CACG"),
        ("ANACS Soapbox", "ANACS"),
        ("ICG Holder", "ICG"),
        ("PSA 10", "PSA"),
        ("Beckett", "BGS"),
        ("CGC 9.8", "CGC"),
        ("SGC 9", "SGC"),
        ("TAG Slab", "TAG"),
        ("ungraded", "NONE"),
        ("SelfSlab", "OTHER"),
    ]:
        assert normalize_grading_service(raw_gr) == expected_gr
    for raw_st, expected_st in [
        ("SOLD", "SOLD"),
        ("For Sale Pending", "FOR_SALE"),
        ("Item Sold", "SOLD"),
        ("On Wishlist", "WISHLIST"),
        ("Vaulted", "IN_COLLECTION"),
    ]:
        assert normalize_status(raw_st) == expected_st

    assert synthesize_title({"cert_number": "123456"}) == "123456"
    assert synthesize_title({}) == "Imported Item"

    # Cover pcgs_ngc auto-PCGS default (427) and card category inference without category column (461)
    from apps.catalog.importer import _normalize_item_kwargs

    pcgs_kw = _normalize_item_kwargs({"cert_number": "998877", "title": "Slab"}, preset="pcgs_ngc")
    assert pcgs_kw["grading_service"] == CollectionItem.GradingService.PCGS
    card_kw = _normalize_item_kwargs({"title": "Mew", "card_game": "Pokemon"}, preset="custom")
    assert card_kw["category"] == CollectionItem.Category.CARD

    # Container cache hit
    c_cache: dict[str, Container] = {}
    existing_box = Container.objects.create(workspace=ws, name="Existing Box")
    assert _resolve_container_by_name(ws, "existing box", c_cache) == existing_box

    # DNS failure / empty addrinfo in _validate_public_http_url
    with patch("apps.catalog.importer.socket.getaddrinfo", side_effect=OSError("dns error")):
        with pytest.raises(ValueError, match="Could not resolve"):
            _validate_public_http_url("https://unresolvable.example.com/a.jpg")
    with patch("apps.catalog.importer.socket.getaddrinfo", return_value=[]):
        with pytest.raises(ValueError, match="No IP addresses resolved"):
            _validate_public_http_url("https://empty-dns.example.com/a.jpg")

    monkeypatch.setattr(
        "apps.catalog.importer.socket.getaddrinfo",
        lambda host, port, **kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.215.14", port or 443))
        ],
    )

    # Mapped CSV covering: blank row, bad decimal row error, invalid/redirect/oversized/empty photos, slab URL, card fields, millesimal purity, bar shape, thumb failure
    img = Image.new("RGB", (60, 60), color=(200, 170, 80))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    valid_png = buf.getvalue()

    csv_bytes = (
        b"Cert #,Denomination,Purity,Quantity,Market Value,Metal Type,Category,Obverse URL,Reverse URL,Slab Label URL,Card Game,Set Name,Unknown\n"
        b",,,,,,,,,,,,Ignored\n"
        b"111,1 Dollar,900,badqty,$12.00,Gold,Bar,https://img.example.com/bar.png,https://img.example.com/redir_missing.png,https://img.example.com/too_many.png,Pokemon,Base Set,\n"
        b"222,Quarter,0.999,1,$50.00,Silver,Coin,https://img.example.com/coin.png,https://img.example.com/badlen.png,https://img.example.com/empty.png,,,\n"
        b"333,Half,0.900,1,1.2.3,Silver,Coin,,,,,,,,\n"
    )

    with respx.mock(assert_all_called=False) as router:
        router.get("https://img.example.com/bar.png").mock(return_value=httpx.Response(200, content=valid_png))
        router.get("https://img.example.com/coin.png").mock(
            return_value=httpx.Response(200, content=valid_png, headers={"Content-Length": "abc"})
        )
        router.get("https://img.example.com/redir_missing.png").mock(return_value=httpx.Response(302))
        router.get("https://img.example.com/too_many.png").mock(
            return_value=httpx.Response(302, headers={"Location": "https://img.example.com/too_many.png"})
        )
        router.get("https://img.example.com/badlen.png").mock(
            return_value=httpx.Response(200, content=b"123456", headers={"Content-Length": "abc"})
        )
        router.get("https://img.example.com/empty.png").mock(return_value=httpx.Response(200, content=b""))

        with patch("apps.catalog.importer.MAX_PHOTO_BYTES", len(valid_png) + 100), patch(
            "apps.catalog.importer.generate_image_thumbnail", side_effect=RuntimeError("thumb skipped")
        ):
            # Also trigger chunked limit via separate call with tiny limit
            res = import_mapped_csv(
                csv_bytes,
                workspace=ws,
                mapping={
                    "Cert #": "cert_number",
                    "Denomination": "denomination",
                    "Purity": "purity",
                    "Quantity": "quantity",
                    "Market Value": "market_value_unit",
                    "Metal Type": "metal_type",
                    "Category": "category",
                    "Obverse URL": "obverse_image_url",
                    "Reverse URL": "reverse_image_url",
                    "Slab Label URL": "slab_label_image_url",
                    "Card Game": "card_game",
                    "Set Name": "set_name",
                    "Unknown": "nonexistent_target",
                },
                import_photos=True,
                auto_appraise=False,
            )
            assert res.created_count == 2
            assert len(res.errors) == 2
            assert len(res.warnings) >= 2
            assert ItemPhoto.objects.filter(workspace=ws).count() == 2

    # Hit chunked > MAX_PHOTO_BYTES (headers omit Content-Length / use non-numeric length so iter_bytes cap triggers at 624)
    with respx.mock(assert_all_called=False) as router2:
        router2.get("https://img.example.com/bigchunk.png").mock(
            return_value=httpx.Response(200, content=valid_png, headers={"Content-Length": "unknown"})
        )
        with patch("apps.catalog.importer.MAX_PHOTO_BYTES", 8):
            chunk_res = import_mapped_csv(
                b"Title,Obverse URL\nChunked Bar,https://img.example.com/bigchunk.png\n",
                workspace=ws,
                mapping={"Title": "title", "Obverse URL": "obverse_image_url"},
                import_photos=True,
                auto_appraise=False,
            )
            assert "oversized" in chunk_res.warnings[0].lower()

    # Run _enqueue_csv_batch_appraisals inline via sync thread execution
    class _SyncThread:
        def __init__(self, target, daemon=True):
            self._target = target

        def start(self):
            self._target()

    created_coin = CollectionItem.objects.filter(workspace=ws).first()
    with patch("apps.valuation.services.start_appraisal_job") as mock_job, patch(
        "threading.Thread", _SyncThread
    ), patch("django.db.transaction.on_commit", side_effect=lambda cb: cb()):
        _enqueue_csv_batch_appraisals([created_coin.id, "00000000-0000-0000-0000-000000000099"], ws.id)
        assert mock_job.call_count == 1

    # Non-sqlite branch (ThreadPoolExecutor) & outer exception branch (missing workspace)
    with patch("django.db.connection.vendor", "postgresql"), patch(
        "apps.valuation.services.start_appraisal_job"
    ), patch("threading.Thread", _SyncThread), patch(
        "django.db.transaction.on_commit", side_effect=lambda cb: cb()
    ):
        _enqueue_csv_batch_appraisals([created_coin.id], "00000000-0000-0000-0000-000000000099")
        _enqueue_csv_batch_appraisals([created_coin.id], ws.id)

    # Free tier quota skipping in import_mapped_csv (0 slots raises PlanLimitExceeded on first row)
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
        CollectionItem(workspace=ws, title=f"Quota Fill {i}", category="COIN")
        for i in range(99 - existing)
    ])
    partial = import_mapped_csv(
        b"Title\nRow One Fits\nRow Two Skipped\n",
        workspace=ws,
        mapping={"Title": "title"},
        import_photos=False,
        auto_appraise=False,
    )
    assert partial.created_count == 1
    assert "quota reached" in partial.errors[0]["error"].lower()

    # Subsequent import when initial_remaining == 0 raises PlanLimitExceeded (line 745)
    from apps.accounts.models import PlanLimitExceeded

    with pytest.raises(PlanLimitExceeded):
        import_mapped_csv(
            b"Title\nOver Quota Item\n",
            workspace=ws,
            mapping={"Title": "title"},
            import_photos=False,
            auto_appraise=False,
        )



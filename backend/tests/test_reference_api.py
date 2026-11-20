from __future__ import annotations

import json
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.catalog.models import ReferenceSyncLog, StaticMarketBaseline


@pytest.mark.django_db
def test_reference_api_unauthorized(api_client):
    res = api_client.get("/api/v1/catalog/reference/lookup?q=test")
    assert res.status_code == 401


@pytest.mark.django_db
def test_reference_lookup_endpoint(api_client, user_a):
    _, _, token_a = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token_a}"}

    # Match Goldback with category and year
    res = api_client.get(
        "/api/v1/catalog/reference/lookup?q=UTAH+1/4+GOLDBACK+2023&category=PAPER&year=2023",
        **headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["matched"] is True
    assert "Utah" in data["candidate"]["title"]
    assert data["specs"]["storage_fit"] is not None

    # No match
    res_none = api_client.get("/api/v1/catalog/reference/lookup?q=NONEXISTENT_TEXT", **headers)
    assert res_none.status_code == 200
    assert res_none.json()["matched"] is False


@pytest.mark.django_db
def test_reference_analyze_serial_endpoint(api_client, user_a):
    _, _, token_a = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token_a}"}

    payload = {"serial_number": "B 12344321 *"}
    res = api_client.post(
        "/api/v1/catalog/reference/analyze-serial",
        data=json.dumps(payload),
        content_type="application/json",
        **headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["is_star_note"] is True
    assert "RADAR" in data["patterns"]
    assert data["frb_bank"] == "New York"


@pytest.mark.django_db
def test_reference_storage_fit_endpoint(api_client, user_a):
    _, _, token_a = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token_a}"}

    # Coin storage fit (40.6mm ASE)
    res_coin = api_client.get(
        "/api/v1/catalog/reference/storage-fit?item_type=COIN&diameter_mm=40.6&thickness_mm=2.98",
        **headers,
    )
    assert res_coin.status_code == 200
    coin_data = res_coin.json()
    assert coin_data["air_tite_capsule"]["model"] == "H40.6"

    # Card storage fit (130pt patch)
    res_card = api_client.get(
        "/api/v1/catalog/reference/storage-fit?item_type=CARD&point_thickness=130",
        **headers,
    )
    assert res_card.status_code == 200
    card_data = res_card.json()
    assert card_data["protection"]["toploader_size"] == "130pt"


@pytest.mark.django_db
def test_reference_grading_roi_endpoint(api_client, user_a):
    _, _, token_a = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token_a}"}

    res = api_client.get(
        "/api/v1/catalog/reference/grading-roi?raw_value=50.0&graded_value=200.0&service=PCGS&tier=ECONOMY",
        **headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["service"] == "PCGS"
    assert Decimal(data["grading_upside_usd"]) > 0


@pytest.mark.django_db
def test_reference_glossary_endpoint(api_client, user_a):
    _, _, token_a = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token_a}"}

    res = api_client.get("/api/v1/catalog/reference/glossary?term=DMPL", **headers)
    assert res.status_code == 200
    data = res.json()
    assert "Deep Mirror Prooflike" in data["definition"]

    res_none = api_client.get("/api/v1/catalog/reference/glossary?term=NONEXISTENT_SLANG_TERM", **headers)
    assert res_none.status_code == 200
    assert res_none.json()["definition"] is None


@pytest.mark.django_db
def test_reference_market_baselines_endpoint(api_client, user_a):
    _, _, token_a = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token_a}"}

    StaticMarketBaseline.objects.create(
        ref_key="spot_gsr_hourly",
        metric_kind="HOURLY_BENCHMARK",
        symbol="GSR",
        value=Decimal("85.50"),
        source_name="TEST_FEED",
    )

    res = api_client.get(
        "/api/v1/catalog/reference/market-baselines?kind=HOURLY_BENCHMARK&symbol=GSR",
        **headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 1
    assert data[0]["symbol"] == "GSR"
    assert Decimal(data[0]["value"]) == Decimal("85.50")


@pytest.mark.django_db
def test_reference_sync_status_endpoint(api_client, user_a):
    _, _, token_a = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token_a}"}

    ReferenceSyncLog.objects.create(
        sync_tier="WEEKLY",
        source_name="TEST_SYNC",
        status="SUCCESS",
        records_upserted=42,
        started_at=timezone.now(),
        completed_at=timezone.now(),
    )

    res = api_client.get("/api/v1/catalog/reference/sync-status", **headers)
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 1
    assert data[0]["sync_tier"] == "WEEKLY"
    assert data[0]["records_upserted"] == 42

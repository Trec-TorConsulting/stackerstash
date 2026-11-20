from __future__ import annotations

import io
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from django.conf import settings
from django.core.management import call_command

from apps.catalog.models import (
    ReferenceSyncLog,
    StaticBanknoteSpec,
    StaticCardSpec,
    StaticGradingReference,
    StaticMarketBaseline,
    StaticNumismaticSpec,
)
from apps.catalog.reference_sync import (
    run_daily_reference_sync,
    run_hourly_market_sync,
    run_weekly_static_sync,
    seed_static_reference_catalog,
)
from apps.catalog.tasks import (
    sync_daily_reference_baselines_task,
    sync_hourly_market_baselines_task,
    sync_weekly_static_catalog_task,
)
from apps.valuation.models import SpotPriceSnapshot
from apps.vision.models import CertLookupCache


@pytest.mark.django_db
def test_seed_static_reference_catalog():
    counts = seed_static_reference_catalog()
    assert counts["numismatics"] >= 4
    assert counts["banknotes"] >= 3
    assert counts["cards"] >= 4
    assert counts["grading"] >= 5

    assert StaticNumismaticSpec.objects.filter(ref_key="us_ase_1oz").exists()
    assert StaticBanknoteSpec.objects.filter(ref_key="us_fr_237_1899_silver_cert").exists()
    assert StaticCardSpec.objects.filter(ref_key="pokemon_base_4_102").exists()
    assert StaticGradingReference.objects.filter(ref_key="fee_pcgs_economy").exists()

    # Re-running seed is idempotent
    re_counts = seed_static_reference_catalog()
    assert re_counts == counts


@pytest.mark.django_db
def test_run_weekly_static_sync_offline():
    res = run_weekly_static_sync(offline=True)
    assert res["status"] == "SUCCESS"
    assert res["records_upserted"] > 0
    assert ReferenceSyncLog.objects.filter(sync_tier="WEEKLY").exists()


@pytest.mark.django_db
def test_run_weekly_static_sync_mocked_http():
    mock_client = MagicMock()

    # Mock Scryfall
    mock_resp_scryfall = MagicMock()
    mock_resp_scryfall.status_code = 200
    mock_resp_scryfall.json.return_value = {
        "data": [{"code": "dmu", "name": "Dominaria United", "released_at": "2022-09-09", "id": "uuid-123"}]
    }

    # Mock Pokemon
    mock_resp_pokemon = MagicMock()
    mock_resp_pokemon.status_code = 200
    mock_resp_pokemon.json.return_value = {
        "data": [{"id": "sv1", "name": "Scarlet & Violet", "ptcgoCode": "SVI", "releaseDate": "2023/03/31"}]
    }

    # Mock Yugioh
    mock_resp_yugioh = MagicMock()
    mock_resp_yugioh.status_code = 200
    mock_resp_yugioh.json.return_value = [{"set_code": "RA01", "set_name": "25th Anniversary Rarity Collection"}]

    def get_router(url):
        if "scryfall" in url:
            return mock_resp_scryfall
        if "pokemontcg" in url:
            return mock_resp_pokemon
        if "ygoprodeck" in url:
            return mock_resp_yugioh
        raise ValueError(f"Unexpected url: {url}")

    mock_client.get.side_effect = get_router

    res = run_weekly_static_sync(offline=False, client=mock_client)
    assert res["status"] == "SUCCESS"
    assert StaticCardSpec.objects.filter(ref_key="mtg_set_dmu").exists()
    assert StaticCardSpec.objects.filter(ref_key="pokemon_set_sv1").exists()
    assert StaticCardSpec.objects.filter(ref_key="yugioh_set_ra01").exists()


@pytest.mark.django_db
def test_run_weekly_static_sync_upstream_error_resilience():
    mock_client = MagicMock()
    mock_client.get.side_effect = RuntimeError("Upstream API down")

    res = run_weekly_static_sync(offline=False, client=mock_client)
    # Even if HTTP failed, seeded fixtures succeeded, so status is PARTIAL
    assert res["status"] == "PARTIAL"
    assert len(res["errors"]) >= 3
    # Existing rows preserved
    assert StaticNumismaticSpec.objects.filter(ref_key="us_ase_1oz").exists()


@pytest.mark.django_db
def test_run_daily_reference_sync_mocked_http():
    # Setup Spot snapshots and CertLookupCache for rollups
    SpotPriceSnapshot.objects.create(metal_type="GOLD", price_usd_per_troy_oz=Decimal("2600.00"))
    SpotPriceSnapshot.objects.create(metal_type="SILVER", price_usd_per_troy_oz=Decimal("31.00"))
    CertLookupCache.objects.create(
        grading_service="PSA",
        cert_number="12345678",
        payload={"TotalPopulation": 42},
    )

    mock_client = MagicMock()
    mock_resp_fx = MagicMock()
    mock_resp_fx.status_code = 200
    mock_resp_fx.json.return_value = {"rates": {"EUR": 0.95, "GBP": 0.79, "CAD": 1.40}}
    mock_client.get.return_value = mock_resp_fx

    res = run_daily_reference_sync(offline=False, client=mock_client)
    assert res["status"] == "SUCCESS"
    assert StaticMarketBaseline.objects.filter(symbol="EUR").exists()
    assert StaticMarketBaseline.objects.filter(symbol="GSR").exists()
    assert StaticGradingReference.objects.filter(catalog_ref_key="12345678").exists()


@pytest.mark.django_db
def test_run_daily_reference_sync_offline_and_error():
    res = run_daily_reference_sync(offline=True)
    assert res["status"] in ("SUCCESS", "PARTIAL")

    # Error path
    mock_client = MagicMock()
    mock_client.get.side_effect = RuntimeError("FX service unavailable")
    res_err = run_daily_reference_sync(offline=False, client=mock_client)
    assert "FX" in res_err["errors"][0]


@pytest.mark.django_db
def test_run_hourly_market_sync():
    SpotPriceSnapshot.objects.create(metal_type="GOLD", price_usd_per_troy_oz=Decimal("2700.00"))
    SpotPriceSnapshot.objects.create(metal_type="SILVER", price_usd_per_troy_oz=Decimal("30.00"))
    SpotPriceSnapshot.objects.create(metal_type="COPPER", price_usd_per_troy_oz=Decimal("4.20"))

    res = run_hourly_market_sync()
    assert res["status"] == "SUCCESS"
    assert res["benchmarks"]["GSR"] == "90.00"
    assert StaticMarketBaseline.objects.filter(metric_kind="HOURLY_BENCHMARK").exists()


@pytest.mark.django_db
def test_catalog_celery_tasks():
    with patch("apps.catalog.tasks.run_weekly_static_sync") as mock_w:
        mock_w.return_value = {"status": "SUCCESS"}
        res = sync_weekly_static_catalog_task(offline=True)
        assert res["status"] == "SUCCESS"
        mock_w.assert_called_once_with(offline=True)

    with patch("apps.catalog.tasks.run_daily_reference_sync") as mock_d:
        mock_d.return_value = {"status": "SUCCESS"}
        res = sync_daily_reference_baselines_task(offline=True)
        assert res["status"] == "SUCCESS"
        mock_d.assert_called_once_with(offline=True)

    with patch("apps.catalog.tasks.run_hourly_market_sync") as mock_h:
        mock_h.return_value = {"status": "SUCCESS"}
        res = sync_hourly_market_baselines_task()
        assert res["status"] == "SUCCESS"
        mock_h.assert_called_once()


@pytest.mark.django_db
def test_management_command_seed_static_reference():
    out = io.StringIO()
    call_command("seed_static_reference", "--tier=seed", stdout=out)
    assert "Successfully seeded fixtures" in out.getvalue()

    out_w = io.StringIO()
    call_command("seed_static_reference", "--tier=weekly", "--offline", stdout=out_w)
    assert "Weekly sync complete" in out_w.getvalue()

    out_d = io.StringIO()
    call_command("seed_static_reference", "--tier=daily", "--offline", stdout=out_d)
    assert "Daily baselines sync complete" in out_d.getvalue()

    out_h = io.StringIO()
    call_command("seed_static_reference", "--tier=hourly", stdout=out_h)
    assert "Hourly benchmark complete" in out_h.getvalue()


def test_celery_beat_schedule_registered():
    sched = settings.CELERY_BEAT_SCHEDULE
    assert "sync-weekly-static-catalog" in sched
    assert "sync-daily-reference-baselines" in sched
    assert "sync-hourly-market-baselines" in sched
    assert sched["sync-weekly-static-catalog"]["task"] == "apps.catalog.tasks.sync_weekly_static_catalog_task"


@pytest.mark.django_db
def test_run_weekly_static_sync_client_none_and_cache_exception():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"data": []}

    with patch("httpx.Client") as mock_client_cls, patch("django.core.cache.cache.delete_many", side_effect=Exception("Redis fail")):
        instance = MagicMock()
        instance.get.return_value = mock_resp
        mock_client_cls.return_value = instance

        res = run_weekly_static_sync(offline=False, client=None)
        assert res["status"] == "SUCCESS"
        instance.close.assert_called_once()


@pytest.mark.django_db
def test_run_weekly_static_sync_fixture_exception():
    with patch("apps.catalog.reference_sync.seed_static_reference_catalog", side_effect=RuntimeError("Corrupt JSON")):
        res = run_weekly_static_sync(offline=True)
        assert res["status"] == "FAILED"
        assert "Fixture seed: Corrupt JSON" in res["errors"]


@pytest.mark.django_db
def test_run_daily_reference_sync_client_none_and_exceptions():
    # Test client=None close_client branch and pop invalid int + outer pop exception + spot exception
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"rates": {"EUR": 0.95}}

    with patch("httpx.Client") as mock_client_cls:
        instance = MagicMock()
        instance.get.return_value = mock_resp
        mock_client_cls.return_value = instance

        res = run_daily_reference_sync(offline=False, client=None)
        assert res["status"] in ("SUCCESS", "PARTIAL")
        instance.close.assert_called_once()

    # Test pop ValueError and outer pop exception
    CertLookupCache.objects.create(
        grading_service="NGC",
        cert_number="8888888",
        payload={"TotalPopulation": "invalid_integer"},
    )
    res_val = run_daily_reference_sync(offline=True)
    assert res_val["status"] in ("SUCCESS", "PARTIAL")

    # Outer pop exception
    with patch("apps.vision.models.CertLookupCache.objects.exclude", side_effect=RuntimeError("DB query failed")):
        res_pop_err = run_daily_reference_sync(offline=True)
        assert any("Pop Rollup" in e for e in res_pop_err["errors"])

    # Outer spot exception
    with patch("apps.valuation.models.SpotPriceSnapshot.objects.filter", side_effect=RuntimeError("DB down")):
        res_spot_err = run_daily_reference_sync(offline=True)
        assert any("EOD Spot" in e for e in res_spot_err["errors"])


@pytest.mark.django_db
def test_run_hourly_market_sync_exception():
    with patch("apps.valuation.models.SpotPriceSnapshot.objects.filter", side_effect=RuntimeError("Snapshot fail")):
        res = run_hourly_market_sync()
        assert res["status"] == "FAILED"
        assert "Snapshot fail" in res["error"]

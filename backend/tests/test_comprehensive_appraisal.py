from decimal import Decimal
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.test import Client

from apps.accounts.models import Workspace
from apps.catalog.models import CollectionItem
from apps.valuation.models import AppraisalJob, SpotPriceSnapshot, ValuationHistory
from apps.valuation.services import appraise_item, start_appraisal_job


def _setup_workspace(slug: str) -> tuple[Workspace, object]:
    user = get_user_model().objects.create_user(email=f"{slug}@example.com", password="pw")
    ws = Workspace.objects.create(name=f"Vault {slug}", slug=slug, owner=user)
    SpotPriceSnapshot.objects.create(
        metal_type=CollectionItem.MetalType.SILVER,
        price_usd_per_troy_oz=Decimal("30.0000"),
    )
    return ws, user


@pytest.mark.django_db
@patch("apps.vision.services.estimate_item_value_with_ai")
def test_bullion_coin_without_byok_runs_ai_and_records_drivers(mock_ai):
    ws, _ = _setup_workspace("bullion-ai")
    item = CollectionItem.objects.create(
        workspace=ws,
        category=CollectionItem.Category.COIN,
        title="1893-S Morgan Dollar",
        year="1893",
        metal_type=CollectionItem.MetalType.SILVER,
        weight_value=Decimal("0.7734"),
        purity=Decimal("1.000000"),
    )
    mock_ai.return_value = (
        Decimal("3200.00"),
        {
            "low_usd": "2800.00",
            "mid_usd": "3200.00",
            "high_usd": "3800.00",
            "valuation_drivers": ["Key date 1893-S Morgan Dollar"],
            "collectibility_tier": "KEY_DATE_COLLECTIBLE",
            "hold_outlook": "Strong long-term collector hold.",
            "inferred_specs": {"mintage": 100000, "diameter_mm": "38.10"},
            "photo_inspected": False,
        },
    )

    updated = appraise_item(item, ws)
    assert updated.melt_value_unit == Decimal("23.20")
    assert updated.market_value_unit == Decimal("3200.00")
    assert updated.valuation_source == CollectionItem.ValuationSource.AI_ESTIMATE
    assert updated.collectibility_tier == CollectionItem.CollectibilityTier.KEY_DATE_COLLECTIBLE
    assert updated.mintage == 100000
    assert updated.specs_provenance["mintage"] == "AI"
    assert any("Key date 1893-S" in d for d in updated.valuation_drivers)
    hist = ValuationHistory.objects.filter(item=updated).first()
    assert hist is not None
    assert "SPOT_MELT" in hist.raw_payload["sources"]
    assert "AI_ESTIMATE" in hist.raw_payload["sources"]


@pytest.mark.django_db
@patch("apps.vision.services.estimate_item_value_with_ai")
def test_melt_floor_invariant_when_spot_exceeds_numismatic_quote(mock_ai):
    ws, _ = _setup_workspace("melt-floor")
    SpotPriceSnapshot.objects.create(
        metal_type=CollectionItem.MetalType.SILVER,
        price_usd_per_troy_oz=Decimal("50.0000"),
    )
    item = CollectionItem.objects.create(
        workspace=ws,
        category=CollectionItem.Category.COIN,
        title="Common Cull Silver Dollar",
        metal_type=CollectionItem.MetalType.SILVER,
        weight_value=Decimal("1.0"),
        purity=Decimal("1.000000"),
    )
    mock_ai.return_value = (
        Decimal("35.00"),
        {
            "low_usd": "30.00",
            "mid_usd": "35.00",
            "high_usd": "40.00",
            "valuation_drivers": ["Cull condition"],
            "collectibility_tier": "BULLION",
            "hold_outlook": "Melt-driven.",
            "photo_inspected": False,
        },
    )

    updated = appraise_item(item, ws)
    assert updated.melt_value_unit == Decimal("50.00")
    assert updated.market_value_unit == Decimal("50.00")
    assert updated.valuation_source == CollectionItem.ValuationSource.SPOT_MELT
    assert updated.market_value_low >= Decimal("50.00")


@pytest.mark.django_db
@patch("apps.valuation.services.lookup_numista_specs", side_effect=RuntimeError("Numista 504 timeout"))
@patch("apps.vision.services.estimate_item_value_with_ai")
def test_provider_timeout_isolation_and_user_spec_preservation(mock_ai, _mock_numista):
    ws, _ = _setup_workspace("isolation-user-spec")
    from apps.accounts.models import ProviderCredential

    numista_cred = ProviderCredential(workspace=ws, provider=ProviderCredential.Provider.NUMISTA_KEY)
    numista_cred.set_secret("numista-tok")
    numista_cred.save()

    item = CollectionItem.objects.create(
        workspace=ws,
        category=CollectionItem.Category.COIN,
        title="1921 Morgan Dollar",
        year="1921",
        variety="VAM-1A User Verified",
        specs_provenance={"variety": "USER"},
        metal_type=CollectionItem.MetalType.SILVER,
        weight_value=Decimal("0.7734"),
    )
    mock_ai.return_value = (
        Decimal("38.00"),
        {
            "low_usd": "32.00",
            "mid_usd": "38.00",
            "high_usd": "45.00",
            "valuation_drivers": ["Common 1921 Morgan"],
            "collectibility_tier": "SEMI_NUMISMATIC",
            "hold_outlook": "Liquid silver dollar.",
            "inferred_specs": {"variety": "Generic AI Guess", "edge_type": "Reeded"},
            "photo_inspected": False,
        },
    )

    updated = appraise_item(item, ws)
    assert updated.market_value_unit == Decimal("38.00")
    assert updated.variety == "VAM-1A User Verified"
    assert updated.specs_provenance["variety"] == "USER"
    assert updated.edge_type == "Reeded"
    assert updated.specs_provenance["edge_type"] == "AI"
    hist = ValuationHistory.objects.filter(item=updated).first()
    assert "numista" in hist.raw_payload["errors"]


@pytest.mark.django_db
def test_double_click_deduplication_returns_active_job():
    ws, _ = _setup_workspace("dedup-job")
    item = CollectionItem.objects.create(
        workspace=ws,
        category=CollectionItem.Category.COIN,
        title="2024 Silver Eagle",
        metal_type=CollectionItem.MetalType.SILVER,
        weight_value=Decimal("1.0"),
    )
    active = AppraisalJob.objects.create(
        workspace=ws,
        item=item,
        status=AppraisalJob.Status.RUNNING,
        steps={"melt": "DONE", "ai": "PENDING"},
    )
    returned = start_appraisal_job(item, ws, sync=False)
    assert returned.id == active.id
    assert AppraisalJob.objects.filter(item=item).count() == 1


@pytest.mark.django_db
@patch("apps.vision.services.estimate_item_value_with_ai")
def test_appraisal_api_sync_and_history_endpoints(mock_ai, api_client, user_a):
    _, ws, token = user_a
    SpotPriceSnapshot.objects.create(
        metal_type=CollectionItem.MetalType.SILVER,
        price_usd_per_troy_oz=Decimal("30.0000"),
    )
    item = CollectionItem.objects.create(
        workspace=ws,
        category=CollectionItem.Category.COIN,
        title="1922 Peace Dollar",
        year="1922",
        metal_type=CollectionItem.MetalType.SILVER,
        weight_value=Decimal("0.7734"),
    )
    mock_ai.return_value = (
        Decimal("34.00"),
        {
            "low_usd": "30.00",
            "mid_usd": "34.00",
            "high_usd": "40.00",
            "valuation_drivers": ["1922 Peace Dollar"],
            "collectibility_tier": "SEMI_NUMISMATIC",
            "hold_outlook": "Hold for silver & type appeal.",
            "photo_inspected": False,
        },
    )

    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    resp = api_client.post(f"/api/v1/valuation/items/{item.id}/appraise?sync=true", **headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "COMPLETED"
    assert body["item"]["market_value_unit"] == "34.00"

    job_resp = api_client.get(f"/api/v1/valuation/jobs/{body['id']}", **headers)
    assert job_resp.status_code == 200
    assert job_resp.json()["status"] == "COMPLETED"

    hist_resp = api_client.get(f"/api/v1/valuation/items/{item.id}/valuations", **headers)
    assert hist_resp.status_code == 200
    assert len(hist_resp.json()) == 1
    assert hist_resp.json()[0]["source"] == "AI_ESTIMATE"


@pytest.mark.django_db
@patch("apps.vision.services.estimate_item_value_with_ai")
def test_raw_grade_estimation_and_user_override_preservation(mock_ai):
    ws, _ = _setup_workspace("raw-grade")
    item = CollectionItem.objects.create(
        workspace=ws,
        category=CollectionItem.Category.COIN,
        title="2024 American Silver Eagle",
        year="2024",
        metal_type=CollectionItem.MetalType.SILVER,
        weight_value=Decimal("1.0"),
        purity=Decimal("0.999000"),
    )
    mock_ai.return_value = (
        Decimal("36.00"),
        {
            "low_usd": "33.00",
            "mid_usd": "36.00",
            "high_usd": "40.00",
            "valuation_drivers": ["BU Silver Eagle"],
            "collectibility_tier": "BULLION",
            "hold_outlook": "Keep raw; grading fees exceed premium.",
            "estimated_grade": "MS69",
            "estimated_grade_range": "MS68-MS70",
            "estimated_grade_rationale": "Full mint luster with minimal contact marks.",
            "grading_upside_usd": "-25.00",
            "photo_inspected": True,
        },
    )

    updated = appraise_item(item, ws)
    assert updated.estimated_grade == "MS69"
    assert updated.estimated_grade_range == "MS68-MS70"
    assert updated.grading_upside_usd == Decimal("-25.00")
    assert any("American Silver Eagle dealer premium" in d for d in updated.valuation_drivers)

    # Now user overrides estimated_grade and re-appraises; USER grade must be preserved
    updated.estimated_grade = "MS70"
    updated.specs_provenance["estimated_grade"] = "USER"
    updated.save()
    updated2 = appraise_item(updated, ws)
    assert updated2.estimated_grade == "MS70"
    assert updated2.specs_provenance["estimated_grade"] == "USER"


@pytest.mark.django_db
@patch("apps.vision.services.estimate_item_value_with_ai")
def test_title_cleanup_during_appraisal_and_user_lock(mock_ai):
    ws, _ = _setup_workspace("title-cleanup")
    item = CollectionItem.objects.create(
        workspace=ws,
        category=CollectionItem.Category.COIN,
        title="1893-s morgan silver dollar RARE!! LOOK!! pcgs ms63",
        metal_type=CollectionItem.MetalType.SILVER,
        weight_value=Decimal("0.7734"),
    )
    mock_ai.return_value = (
        Decimal("4500.00"),
        {
            "low_usd": "4000.00",
            "mid_usd": "4500.00",
            "high_usd": "5200.00",
            "normalized_title": "1893-S Morgan Silver Dollar",
            "valuation_drivers": ["Key date 1893-S"],
            "collectibility_tier": "KEY_DATE_COLLECTIBLE",
            "hold_outlook": "Hold.",
            "photo_inspected": True,
        },
    )

    updated = appraise_item(item, ws)
    assert updated.title == "1893-S Morgan Silver Dollar"
    assert updated.specs_provenance["title"] == "AI"
    hist = ValuationHistory.objects.filter(item=updated).first()
    assert hist.raw_payload["title_updated"] == {
        "from": "1893-s morgan silver dollar RARE!! LOOK!! pcgs ms63",
        "to": "1893-S Morgan Silver Dollar",
    }

    # User manually renames title -> locked as USER and preserved on next appraisal
    updated.title = "My Custom 1893-S Morgan"
    updated.specs_provenance["title"] = "USER"
    updated.save()
    updated2 = appraise_item(updated, ws)
    assert updated2.title == "My Custom 1893-S Morgan"

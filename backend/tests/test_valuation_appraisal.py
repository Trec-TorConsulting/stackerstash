from decimal import Decimal
from unittest.mock import MagicMock, patch

from apps.catalog.models import CollectionItem
from apps.valuation.services import reconcile_item_valuation


def _make_dummy_item(
    *,
    category="COIN",
    metal_type="SILVER",
    fine_troy_oz=Decimal("0.7734"),
    melt_val=Decimal("23.20"),
    cert_number="",
    grading_service="NONE",
) -> CollectionItem:
    item = MagicMock(spec=CollectionItem)
    item.category = category
    item.metal_type = metal_type
    item.fine_troy_oz = fine_troy_oz
    item.melt_value_unit = melt_val
    item.cert_number = cert_number
    item.grading_service = grading_service
    item.is_card_item = category == "CARD"
    item.is_card = category == "CARD"
    item.title = "1889 Morgan Dollar"
    item.series = ""
    item.denomination = ""
    item.year = 1889
    item.mint_mark = ""
    item.grade = ""
    item.attributes = {}
    item.catalog_numbers = {}
    item.specs_provenance = {}
    return item


def test_reconcile_item_valuation_blended_comps_uplift_over_guides_and_ai():
    item = _make_dummy_item(melt_val=Decimal("20.00"))

    comps_res = {
        "source": "COMPS",
        "is_blended": True,
        "is_ask": False,
        "value": Decimal("115.00"),
        "median": Decimal("115.00"),
        "low": Decimal("100.00"),
        "high": Decimal("130.00"),
        "count": 7,
        "sold": {"count": 3, "median": Decimal("105.00"), "low": Decimal("100.00"), "high": Decimal("110.00")},
        "active_ask": {"count": 4, "mean": Decimal("125.00"), "low": Decimal("120.00"), "high": Decimal("130.00")},
    }
    gs_res = {"source": "GREYSHEET", "market_value": Decimal("95.00")}
    nm_res = {"source": "NUMISMEDIA", "market_value": Decimal("90.00")}
    ai_val = Decimal("85.00")
    ai_raw = {
        "low_usd": "80.00",
        "high_usd": "90.00",
        "collectibility_tier": "NUMISMATIC",
        "hold_outlook": "Hold long-term.",
    }

    reconciled = reconcile_item_valuation(
        item,
        comps_res=comps_res,
        gs_res=gs_res,
        nm_res=nm_res,
        ai_val=ai_val,
        ai_raw=ai_raw,
    )

    # Blended comps ($115.00) MUST supersede Greysheet ($95.00) and AI ($85.00)
    assert reconciled["market_value_unit"] == Decimal("115.00")
    assert reconciled["valuation_source"] == CollectionItem.ValuationSource.COMPS
    assert reconciled["is_estimate"] is True
    assert reconciled["market_value_low"] == Decimal("100.00")
    assert reconciled["market_value_high"] == Decimal("130.00")

    # High confidence because verified comps (count >= 3) combined with price guide (Greysheet)
    assert reconciled["valuation_confidence"] == CollectionItem.ValuationConfidence.HIGH

    # Verify driver contains the blended breakdown text
    drivers = reconciled["valuation_drivers"]
    blended_driver = next(d for d in drivers if "Real-world market comps" in d)
    assert "Real-world market comps: $115.00" in blended_driver
    assert "blended average of 3 sold sales [median $105.00]" in blended_driver
    assert "4 active asking listings [mean $125.00]" in blended_driver


def test_reconcile_item_valuation_cert_supersedes_blended_comps():
    item = _make_dummy_item(cert_number="12345678", grading_service="PCGS")

    cert_res = {"source": "PCGS", "market_value": Decimal("300.00")}
    comps_res = {
        "source": "COMPS",
        "is_blended": True,
        "is_ask": False,
        "value": Decimal("250.00"),
        "median": Decimal("250.00"),
        "low": Decimal("220.00"),
        "high": Decimal("280.00"),
        "count": 6,
        "sold": {"count": 3, "median": Decimal("240.00")},
        "active_ask": {"count": 3, "mean": Decimal("260.00")},
    }

    reconciled = reconcile_item_valuation(item, cert_res=cert_res, comps_res=comps_res)
    assert reconciled["market_value_unit"] == Decimal("300.00")
    assert reconciled["valuation_source"] == CollectionItem.ValuationSource.PCGS
    assert reconciled["is_estimate"] is False


def test_reconcile_item_valuation_ai_supersedes_unblended_active_ask():
    item = _make_dummy_item()

    comps_res = {
        "source": "EBAY_ACTIVE_ASK",
        "is_blended": False,
        "is_ask": True,
        "value": Decimal("40.00"),
        "median": Decimal("40.00"),
        "low": Decimal("35.00"),
        "high": Decimal("45.00"),
        "count": 5,
    }
    ai_val = Decimal("65.00")
    ai_raw = {"photo_inspected": True}

    reconciled = reconcile_item_valuation(item, comps_res=comps_res, ai_val=ai_val, ai_raw=ai_raw)
    assert reconciled["market_value_unit"] == Decimal("65.00")
    assert reconciled["valuation_source"] == CollectionItem.ValuationSource.AI_ESTIMATE
    assert reconciled["is_estimate"] is True

    # Unblended active ask driver
    drivers = reconciled["valuation_drivers"]
    assert any("Active eBay asking prices (5 listings)" in d for d in drivers)


def test_reconcile_item_valuation_unblended_sold_driver_and_active_ask_only():
    item = _make_dummy_item(melt_val=Decimal("10.00"))

    # Unblended sold
    sold_comps = {
        "source": "COMPS",
        "is_blended": False,
        "is_ask": False,
        "value": Decimal("75.00"),
        "median": Decimal("75.00"),
        "low": Decimal("70.00"),
        "high": Decimal("80.00"),
        "count": 4,
    }
    rec1 = reconcile_item_valuation(item, comps_res=sold_comps)
    assert rec1["market_value_unit"] == Decimal("75.00")
    assert any("Realized sold comps (4 listings)" in d for d in rec1["valuation_drivers"])

    # Active ask only (no AI or guides)
    ask_comps = {
        "source": "EBAY_ACTIVE_ASK",
        "is_blended": False,
        "is_ask": True,
        "value": Decimal("50.00"),
        "median": Decimal("50.00"),
        "low": Decimal("45.00"),
        "high": Decimal("55.00"),
        "count": 2,
    }
    rec2 = reconcile_item_valuation(item, comps_res=ask_comps)
    assert rec2["market_value_unit"] == Decimal("50.00")
    assert rec2["valuation_source"] == CollectionItem.ValuationSource.COMPS
    assert rec2["valuation_confidence"] == CollectionItem.ValuationConfidence.LOW


def test_reconcile_item_valuation_melt_floor_enforcement():
    # Melt is $100.00, but comps return $60.00
    item = _make_dummy_item(melt_val=Decimal("100.00"))
    comps_res = {
        "source": "COMPS",
        "is_blended": True,
        "value": Decimal("60.00"),
        "median": Decimal("60.00"),
        "low": Decimal("50.00"),
        "high": Decimal("70.00"),
        "count": 4,
        "sold": {"count": 2, "median": Decimal("55.00")},
        "active_ask": {"count": 2, "mean": Decimal("65.00")},
    }

    reconciled = reconcile_item_valuation(item, comps_res=comps_res)
    assert reconciled["market_value_unit"] == Decimal("100.00")
    assert reconciled["valuation_source"] == CollectionItem.ValuationSource.SPOT_MELT
    assert reconciled["is_estimate"] is False
    assert reconciled["market_value_low"] == Decimal("100.00")
    assert reconciled["market_value_high"] == Decimal("100.00")

    drivers = reconciled["valuation_drivers"]
    assert any("melt_floor_applied" in d for d in drivers)


def test_reconcile_item_valuation_via_results_dict():
    item = _make_dummy_item(metal_type="NONE", melt_val=Decimal("0.00"))
    results = {
        "comps": {
            "source": "COMPS",
            "is_blended": True,
            "value": Decimal("200.00"),
            "median": Decimal("200.00"),
            "low": Decimal("180.00"),
            "high": Decimal("220.00"),
            "count": 5,
            "sold": {"count": 2, "median": Decimal("190.00")},
            "active_ask": {"count": 3, "mean": Decimal("210.00")},
        },
        "ai": (Decimal("150.00"), {"collectibility_tier": "NUMISMATIC"}),
    }

    reconciled = reconcile_item_valuation(item, results)
    assert reconciled["market_value_unit"] == Decimal("200.00")
    assert reconciled["valuation_confidence"] == CollectionItem.ValuationConfidence.MEDIUM
    assert reconciled["collectibility_tier"] == CollectionItem.CollectibilityTier.NUMISMATIC


def test_reconcile_item_valuation_two_guides_high_confidence():
    item = _make_dummy_item(metal_type="NONE", melt_val=Decimal("0.00"))
    gs_res = {"source": "GREYSHEET", "market_value": Decimal("100.00")}
    nm_res = {"source": "NUMISMEDIA", "market_value": Decimal("105.00")}

    reconciled = reconcile_item_valuation(item, gs_res=gs_res, nm_res=nm_res)
    assert reconciled["market_value_unit"] == Decimal("100.00")
    assert reconciled["valuation_confidence"] == CollectionItem.ValuationConfidence.HIGH


def test_reconcile_item_valuation_search_grounding_and_multi_source_consensus():
    item = _make_dummy_item(melt_val=Decimal("25.00"))
    comps_res = {
        "source": "SEARCH_GROUNDING",
        "is_blended": True,
        "is_ask": False,
        "value": Decimal("150.00"),
        "median": Decimal("150.00"),
        "low": Decimal("130.00"),
        "high": Decimal("170.00"),
        "count": 4,
        "sold": {"count": 2, "median": Decimal("145.00"), "low": Decimal("130.00"), "high": Decimal("150.00")},
        "active_ask": {"count": 2, "mean": Decimal("155.00"), "low": Decimal("150.00"), "high": Decimal("170.00")},
    }
    gs_res = {"source": "GREYSHEET", "market_value": Decimal("140.00")}
    reconciled = reconcile_item_valuation(item, comps_res=comps_res, gs_res=gs_res)

    assert reconciled["market_value_unit"] == Decimal("150.00")
    assert reconciled["valuation_source"] == CollectionItem.ValuationSource.COMPS
    assert reconciled["valuation_confidence"] == CollectionItem.ValuationConfidence.HIGH
    assert reconciled["sources_payload"]["SEARCH_GROUNDING"]["status"] == "SEARCH_GROUNDING"

    drivers = reconciled["valuation_drivers"]
    assert any("Multi-source consensus: Synthesized 3 independent sources" in d for d in drivers)
    assert any("Search-grounded comps" in d for d in drivers)


def test_reconcile_item_valuation_zero_key_comps():
    item = _make_dummy_item(melt_val=Decimal("0.00"), metal_type="NONE")
    comps_res = {
        "source": "ZERO_KEY_COMPS",
        "is_blended": False,
        "is_ask": False,
        "value": Decimal("85.00"),
        "median": Decimal("85.00"),
        "low": Decimal("75.00"),
        "high": Decimal("95.00"),
        "count": 5,
        "sold": {"count": 5, "median": Decimal("85.00"), "low": Decimal("75.00"), "high": Decimal("95.00")},
        "active_ask": None,
    }
    ai_val = Decimal("80.00")
    ai_raw = {"photo_inspected": True}

    reconciled = reconcile_item_valuation(item, comps_res=comps_res, ai_val=ai_val, ai_raw=ai_raw)
    assert reconciled["market_value_unit"] == Decimal("85.00")
    assert reconciled["valuation_source"] == CollectionItem.ValuationSource.COMPS
    assert reconciled["valuation_confidence"] == CollectionItem.ValuationConfidence.MEDIUM
    assert reconciled["sources_payload"]["ZERO_KEY_COMPS"]["status"] == "ZERO_KEY"

    drivers = reconciled["valuation_drivers"]
    assert any("Multi-source consensus: Synthesized 2 independent sources" in d for d in drivers)
    assert any("Zero-key public comps: Median $85.00" in d for d in drivers)


@patch("apps.valuation.services.lookup_ebay_sold_comps")
@patch("apps.valuation.services.lookup_zero_key_public_comps")
@patch("apps.valuation.services.get_latest_spot_map")
@patch("apps.valuation.services.refresh_item_melt_from_latest_spot")
def test_appraise_item_comps_cascading(
    mock_refresh, mock_spots, mock_zero_key, mock_ebay
):
    from apps.accounts.models import Workspace
    from apps.valuation.services import appraise_item

    mock_spots.return_value = {}
    mock_refresh.return_value = None

    item = _make_dummy_item(melt_val=Decimal("0.00"), metal_type="NONE")
    item.id = "test-item-cascade"
    item.workspace = MagicMock(spec=Workspace)
    item.save = MagicMock()

    # Tier 1 failure, Tier 2 success
    mock_ebay.return_value = None
    mock_zero_key.return_value = {
        "source": "ZERO_KEY_COMPS",
        "value": Decimal("50.00"),
        "median": Decimal("50.00"),
        "low": Decimal("40.00"),
        "high": Decimal("60.00"),
        "count": 3,
        "sold": {"count": 3, "median": Decimal("50.00")},
    }

    with patch("apps.valuation.services._get_workspace_secret") as mock_secret, \
         patch("apps.vision.services.estimate_item_value_with_ai") as mock_ai, \
         patch("apps.valuation.models.ValuationHistory.objects.create"):
        mock_secret.side_effect = lambda ws, prov: "fake-key" if "EBAY" in str(prov) else None
        mock_ai.return_value = (None, {})

        appraise_item(item, item.workspace)
        assert mock_ebay.called
        assert mock_zero_key.called
        assert item.market_value_unit == Decimal("50.00")
        assert item.valuation_source == CollectionItem.ValuationSource.COMPS


@patch("apps.valuation.services.lookup_ebay_sold_comps")
@patch("apps.valuation.services.lookup_zero_key_public_comps")
@patch("apps.valuation.services.get_latest_spot_map")
@patch("apps.valuation.services.refresh_item_melt_from_latest_spot")
def test_appraise_item_comps_tier3_grounding(
    mock_refresh, mock_spots, mock_zero_key, mock_ebay
):
    from apps.accounts.models import Workspace
    from apps.valuation.services import appraise_item

    mock_spots.return_value = {}
    mock_refresh.return_value = None

    item = _make_dummy_item(melt_val=Decimal("0.00"), metal_type="NONE")
    item.id = "test-item-tier3"
    item.workspace = MagicMock(spec=Workspace)
    item.save = MagicMock()

    # Tier 1 and Tier 2 both fail
    mock_ebay.return_value = None
    mock_zero_key.return_value = None

    grounded_comps = {
        "source": "SEARCH_GROUNDING",
        "is_blended": True,
        "value": Decimal("75.00"),
        "median": Decimal("75.00"),
        "low": Decimal("60.00"),
        "high": Decimal("90.00"),
        "count": 4,
        "sold": {"count": 4, "median": Decimal("75.00")},
    }

    with patch("apps.valuation.services._get_workspace_secret") as mock_secret, \
         patch("apps.vision.services.estimate_item_value_with_ai") as mock_ai, \
         patch("apps.valuation.models.ValuationHistory.objects.create") as mock_hist:
        mock_secret.return_value = None
        mock_ai.return_value = (Decimal("75.00"), {"grounded_comps": grounded_comps})

        appraise_item(item, item.workspace)
        assert item.market_value_unit == Decimal("75.00")
        assert item.valuation_source == CollectionItem.ValuationSource.COMPS
        assert mock_hist.call_args[1]["raw_payload"]["sources"]["SEARCH_GROUNDING"]["status"] == "SEARCH_GROUNDING"


def test_reconcile_item_valuation_fallback_to_ai_grounded_comps():
    item = _make_dummy_item(melt_val=Decimal("0.00"), metal_type="NONE")
    grounded_comps = {
        "source": "SEARCH_GROUNDING",
        "value": Decimal("45.00"),
        "median": Decimal("45.00"),
        "low": Decimal("40.00"),
        "high": Decimal("50.00"),
        "count": 2,
    }
    reconciled = reconcile_item_valuation(
        item,
        comps_res=None,
        ai_raw={"grounded_comps": grounded_comps},
    )
    assert reconciled["market_value_unit"] == Decimal("45.00")
    assert reconciled["valuation_source"] == CollectionItem.ValuationSource.COMPS


@patch("apps.valuation.services.lookup_ebay_sold_comps")
@patch("apps.valuation.services.lookup_zero_key_public_comps")
@patch("apps.valuation.services.get_latest_spot_map")
@patch("apps.valuation.services.refresh_item_melt_from_latest_spot")
def test_appraise_item_comps_empty_query(
    mock_refresh, mock_spots, mock_zero_key, mock_ebay
):
    from apps.accounts.models import Workspace
    from apps.valuation.services import appraise_item

    mock_spots.return_value = {}
    mock_refresh.return_value = None

    item = _make_dummy_item(melt_val=Decimal("0.00"), metal_type="NONE")
    item.id = "test-empty-q"
    item.title = ""
    item.year = None
    item.mint_mark = ""
    item.grade = ""
    item.workspace = MagicMock(spec=Workspace)
    item.save = MagicMock()

    with patch("apps.valuation.services._get_workspace_secret") as mock_secret, \
         patch("apps.vision.services.estimate_item_value_with_ai") as mock_ai, \
         patch("apps.valuation.models.ValuationHistory.objects.create"):
        mock_secret.return_value = None
        mock_ai.return_value = (None, {})
        appraise_item(item, item.workspace)
        assert not mock_ebay.called
        assert not mock_zero_key.called



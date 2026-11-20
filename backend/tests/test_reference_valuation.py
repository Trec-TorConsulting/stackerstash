from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

import pytest

from apps.accounts.models import User, Workspace
from apps.catalog.models import (
    CollectionItem,
    StaticGradingReference,
    StaticMarketBaseline,
)
from apps.valuation.services import (
    appraise_item,
    compute_grading_roi_usd,
    convert_to_usd,
)


@pytest.fixture
def workspace(db):
    user = User.objects.create_user(email="valref@example.com", password="pw")
    return Workspace.objects.create(name="Val Ref Lab", slug="val-ref-lab", owner=user)


@pytest.mark.django_db
def test_convert_to_usd():
    # 1. USD identity
    assert convert_to_usd(100, "USD") == Decimal("100.00")

    # 2. Database baseline conversion
    StaticMarketBaseline.objects.create(
        ref_key="fx_eur",
        metric_kind="FX_RATE",
        symbol="EUR",
        value=Decimal("0.90"),
    )
    # 90 EUR at 0.90 EUR/USD -> 100 USD
    assert convert_to_usd("90.00", "EUR") == Decimal("100.00")

    # 3. Static fallback conversion (CAD at 1.36)
    # 136 CAD at 1.36 CAD/USD -> 100 USD
    assert convert_to_usd(Decimal("136.00"), "CAD") == Decimal("100.00")

    # 4. Unknown currency returns amount
    assert convert_to_usd("50.00", "XYZ") == Decimal("50.00")

    # 5. DB query exception path
    with patch("apps.catalog.models.StaticMarketBaseline.objects.filter", side_effect=RuntimeError("DB fail")):
        assert convert_to_usd("136.00", "CAD") == Decimal("100.00")


@pytest.mark.django_db
def test_compute_grading_roi_usd():
    # Default fallback: $25 fee + $15 ship = $40 cost
    # raw $100, graded $200 -> upside = 200 - 100 - 40 = $60
    assert compute_grading_roi_usd(100, 200, service="UNKNOWN") == Decimal("60.00")

    # Custom shipping buffer: $25 fee + $20 ship = $45 cost -> 200 - 100 - 45 = $55
    assert compute_grading_roi_usd(100, 200, service="UNKNOWN", shipping_buffer=20) == Decimal("55.00")

    # Synced database fee record
    StaticGradingReference.objects.create(
        ref_key="fee_pcgs_economy",
        record_kind="FEE_SCHEDULE",
        grading_service="PCGS",
        fee_usd=Decimal("23.00"),
        shipping_buffer_usd=Decimal("12.00"),
    )
    # PCGS Economy: $23 + $12 = $35 cost
    # raw $100, graded $200 -> upside = 200 - 100 - 35 = $65
    assert compute_grading_roi_usd(100, 200, service="PCGS", tier="ECONOMY") == Decimal("65.00")

    # DB query exception path
    with patch("apps.catalog.models.StaticGradingReference.objects.filter", side_effect=RuntimeError("DB fail")):
        assert compute_grading_roi_usd(100, 200, service="PCGS") == Decimal("60.00")


@pytest.mark.django_db
def test_appraisal_flow_wires_deterministic_roi(workspace):
    item = CollectionItem.objects.create(
        workspace=workspace,
        title="1921 Morgan Dollar",
        category=CollectionItem.Category.COIN,
        grading_service=CollectionItem.GradingService.NONE,
        market_value_unit=Decimal("40.00"),
    )

    ai_payload = {
        "estimated_grade": "MS63",
        "estimated_grade_market_usd": 120.00,
        "market_value_usd": 40.00,
    }

    with patch("apps.valuation.services.lookup_ebay_sold_comps", return_value=None), \
         patch("apps.valuation.services.lookup_numista_specs", return_value={}), \
         patch("apps.valuation.services.lookup_greysheet", return_value=None), \
         patch("apps.valuation.services.lookup_numismedia", return_value=None), \
         patch("apps.vision.services.estimate_item_value_with_ai", return_value=(Decimal("40.00"), ai_payload)):
        res = appraise_item(item, workspace)
        assert res is not None
        item.refresh_from_db()
        # Graded $120 - raw $40 - $40 (PCGS fallback cost) = $40.00
        assert item.grading_upside_usd == Decimal("40.00")

    # Invalid estimated_grade_market_usd triggers exception handler
    ai_invalid = {
        "estimated_grade": "MS63",
        "estimated_grade_market_usd": "not-a-valid-decimal",
    }
    with patch("apps.valuation.services.lookup_ebay_sold_comps", return_value=None), \
         patch("apps.valuation.services.lookup_numista_specs", return_value={}), \
         patch("apps.valuation.services.lookup_greysheet", return_value=None), \
         patch("apps.valuation.services.lookup_numismedia", return_value=None), \
         patch("apps.vision.services.estimate_item_value_with_ai", return_value=(Decimal("40.00"), ai_invalid)):
        res_inv = appraise_item(item, workspace)
        assert res_inv is not None

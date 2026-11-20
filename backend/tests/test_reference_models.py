from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

import pytest
from django.conf import settings

from apps.catalog.models import (
    ReferenceSyncLog,
    StaticBanknoteSpec,
    StaticCardSpec,
    StaticGradingReference,
    StaticMarketBaseline,
    StaticNumismaticSpec,
)


@pytest.mark.django_db
def test_static_reference_models_crud():
    # 1. StaticNumismaticSpec
    num_item = StaticNumismaticSpec.objects.create(
        ref_key="test_coin_1",
        item_kind=StaticNumismaticSpec.ItemKind.COIN,
        title="Test Coin 1",
        country="United States",
        series="Morgan Dollar",
        denomination="$1",
        metal_type="SILVER",
        purity=Decimal("0.900000"),
        weight_value=Decimal("0.773440"),
        weight_unit="OZ_T",
        fine_troy_oz=Decimal("0.773440"),
        is_key_date=True,
    )
    assert str(num_item) == "Test Coin 1 [test_coin_1]"
    assert StaticNumismaticSpec.objects.filter(ref_key="test_coin_1").exists()

    # 2. StaticBanknoteSpec
    note_item = StaticBanknoteSpec.objects.create(
        ref_key="test_note_1",
        record_kind=StaticBanknoteSpec.RecordKind.BANKNOTE,
        title="Test Banknote $1",
        denomination="$1",
        friedberg_number="Fr. 1",
        seal_color="Red",
    )
    assert "Test Banknote $1" in str(note_item)

    # 3. StaticCardSpec
    card_item = StaticCardSpec.objects.create(
        ref_key="test_card_1",
        card_game="Pokémon",
        set_name="Base Set",
        card_number="4/102",
        card_name="Charizard",
        rarity="Holo Rare",
    )
    assert "Charizard" in str(card_item)

    # 4. StaticGradingReference
    fee_item = StaticGradingReference.objects.create(
        ref_key="test_fee_1",
        record_kind=StaticGradingReference.RecordKind.FEE_SCHEDULE,
        grading_service="PCGS",
        asset_class=StaticGradingReference.AssetClass.COIN,
        tier_name="Economy",
        fee_usd=Decimal("26.00"),
    )
    assert "PCGS Economy" in str(fee_item)

    # 5. StaticMarketBaseline
    baseline = StaticMarketBaseline.objects.create(
        ref_key="test_fx_eur",
        metric_kind=StaticMarketBaseline.MetricKind.FX_RATE,
        symbol="EUR",
        value=Decimal("1.050000"),
    )
    assert "EUR" in str(baseline)

    # 6. ReferenceSyncLog
    log = ReferenceSyncLog.objects.create(
        sync_tier=ReferenceSyncLog.SyncTier.SEED,
        source_name="FIXTURES",
        status=ReferenceSyncLog.Status.SUCCESS,
        records_upserted=42,
    )
    assert "FIXTURES" in str(log)


def test_reference_json_fixtures_valid():
    fixtures_dir = Path(settings.BASE_DIR) / "apps" / "catalog" / "fixtures" / "reference"
    assert fixtures_dir.exists()

    expected_files = ["numismatics.json", "banknotes.json", "trading_cards.json", "grading_reference.json"]
    for fname in expected_files:
        fpath = fixtures_dir / fname
        assert fpath.exists(), f"Missing fixture: {fname}"
        with open(fpath, encoding="utf-8") as f:
            data = json.load(f)
        assert isinstance(data, list)
        assert len(data) >= 3, f"Fixture {fname} should have at least 3 seed items"
        for row in data:
            assert "ref_key" in row
            assert "title" in row or "card_name" in row or "grading_service" in row

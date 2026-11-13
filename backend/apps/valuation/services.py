from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import ProviderCredential, Workspace
from apps.catalog.models import CollectionItem

from .models import SpotPriceSnapshot, ValuationHistory
from .providers import (
    fetch_spot_prices_from_gold_api,
    lookup_greysheet,
    lookup_pcgs_cert,
)


def get_latest_spot_map() -> dict[str, Decimal]:
    """Return latest USD/troy-oz spot price per metal type."""
    latest: dict[str, Decimal] = {}
    for metal_type, _ in CollectionItem.MetalType.choices:
        if metal_type == CollectionItem.MetalType.NONE:
            continue
        snap = SpotPriceSnapshot.objects.filter(metal_type=metal_type).first()
        if snap:
            latest[metal_type] = snap.price_usd_per_troy_oz
    return latest


def refresh_item_melt_from_latest_spot(
    item: CollectionItem, spot_map: dict[str, Decimal] | None = None
) -> CollectionItem:
    """Recompute item.melt_value_unit from latest spot prices."""
    spots = spot_map if spot_map is not None else get_latest_spot_map()
    if item.metal_type != CollectionItem.MetalType.NONE and item.metal_type in spots:
        melt = (item.fine_troy_oz * spots[item.metal_type]).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        item.melt_value_unit = melt
        if (
            item.valuation_source == CollectionItem.ValuationSource.SPOT_MELT
            or item.market_value_unit == Decimal("0.00")
        ):
            item.market_value_unit = melt
            item.valuation_source = CollectionItem.ValuationSource.SPOT_MELT
            item.is_estimate = False
            item.valued_at = timezone.now()
        item.save(
            update_fields=[
                "melt_value_unit",
                "market_value_unit",
                "valuation_source",
                "is_estimate",
                "valued_at",
            ]
        )
    return item


@transaction.atomic
def refresh_spot_prices() -> dict[str, Decimal]:
    """Fetch live spot prices, store snapshots, and recalculate bullion melt values."""
    fetched = fetch_spot_prices_from_gold_api()
    for metal_type, price in fetched.items():
        SpotPriceSnapshot.objects.create(
            metal_type=metal_type,
            price_usd_per_troy_oz=price,
            source="gold-api.com",
        )
    spots = get_latest_spot_map()
    bullion_items = CollectionItem.objects.exclude(
        metal_type=CollectionItem.MetalType.NONE
    )
    for item in bullion_items:
        refresh_item_melt_from_latest_spot(item, spots)
    return spots


def _get_workspace_secret(workspace: Workspace, provider: str) -> str:
    cred = ProviderCredential.objects.filter(workspace=workspace, provider=provider).first()
    return cred.get_secret() if cred else ""


def appraise_item(item: CollectionItem, workspace: Workspace) -> CollectionItem:
    """Run the valuation waterfall: Melt -> PCGS -> Greysheet -> AI Estimate fallback."""
    spots = get_latest_spot_map()
    refresh_item_melt_from_latest_spot(item, spots)

    raw_payload: dict[str, Any] = {}
    matched_source: str | None = None
    matched_value: Decimal | None = None
    is_estimate = False

    # 1. PCGS Cert lookup
    if item.grading_service == CollectionItem.GradingService.PCGS and item.cert_number:
        pcgs_token = _get_workspace_secret(workspace, ProviderCredential.Provider.PCGS)
        res = lookup_pcgs_cert(item.cert_number, pcgs_token)
        if res:
            matched_source = CollectionItem.ValuationSource.PCGS
            matched_value = res["market_value"]
            raw_payload = res["raw"]

    # 2. Greysheet BYOK lookup
    if matched_value is None:
        gs_key = _get_workspace_secret(workspace, ProviderCredential.Provider.GREYSHEET_KEY)
        gs_tok = _get_workspace_secret(workspace, ProviderCredential.Provider.GREYSHEET_TOKEN)
        if gs_key and gs_tok:
            res = lookup_greysheet(item.title, gs_key, gs_tok)
            if res:
                matched_source = CollectionItem.ValuationSource.GREYSHEET
                matched_value = res["market_value"]
                raw_payload = res["raw"]

    # 3. Bullion melt floor if no numismatic override
    if matched_value is None and item.melt_value_unit > Decimal("0.00"):
        matched_source = CollectionItem.ValuationSource.SPOT_MELT
        matched_value = item.melt_value_unit
        is_estimate = False

    # 4. AI Appraisal fallback (strictly labeled as Estimate)
    if matched_value is None:
        from apps.vision.services import estimate_item_value_with_ai

        ai_val, ai_raw = estimate_item_value_with_ai(item, workspace)
        if ai_val is not None:
            matched_source = CollectionItem.ValuationSource.AI_ESTIMATE
            matched_value = ai_val
            is_estimate = True
            raw_payload = ai_raw

    if matched_value is not None and matched_source is not None:
        item.market_value_unit = matched_value
        item.valuation_source = matched_source
        item.is_estimate = is_estimate
        item.valued_at = timezone.now()
        item.save(
            update_fields=[
                "market_value_unit",
                "valuation_source",
                "is_estimate",
                "valued_at",
            ]
        )
        ValuationHistory.objects.create(
            item=item,
            melt_value_unit=item.melt_value_unit,
            market_value_unit=item.market_value_unit,
            source=matched_source,
            is_estimate=is_estimate,
            raw_payload=raw_payload,
        )

    return item


def compute_portfolio_summary(workspace: Workspace) -> dict[str, Any]:
    """Compute portfolio totals, GSR, DCA cost/oz, breakdowns, and top valuable items."""
    from apps.catalog.api import _item_to_out

    all_items = list(
        CollectionItem.objects.filter(workspace=workspace)
        .select_related("container")
        .prefetch_related("photos")
    )
    active_items = [
        i for i in all_items if i.status != CollectionItem.Status.SOLD
    ]
    sold_items = [
        i for i in all_items if i.status == CollectionItem.Status.SOLD
    ]

    total_market = sum((i.total_market_value for i in active_items), Decimal("0.00"))
    total_melt = sum((i.total_melt_value for i in active_items), Decimal("0.00"))
    total_cost = sum(
        (i.purchase_price for i in active_items if i.purchase_price is not None),
        Decimal("0.00"),
    )
    costed_market = sum(
        (i.total_market_value for i in active_items if i.purchase_price is not None),
        Decimal("0.00"),
    )
    unrealized_pnl = (costed_market - total_cost).quantize(Decimal("0.01"))

    realized_pnl = sum(
        (
            (i.sold_price - i.purchase_price)
            for i in sold_items
            if i.sold_price is not None and i.purchase_price is not None
        ),
        Decimal("0.00"),
    ).quantize(Decimal("0.01"))

    # Metal breakdown & DCA cost per troy oz
    metal_stats: dict[str, dict[str, Decimal]] = {}
    for item in active_items:
        if item.metal_type == CollectionItem.MetalType.NONE:
            continue
        bucket = metal_stats.setdefault(
            item.metal_type,
            {
                "fine_troy_oz": Decimal("0.000000"),
                "melt_value": Decimal("0.00"),
                "market_value": Decimal("0.00"),
                "cost_basis": Decimal("0.00"),
                "costed_oz": Decimal("0.000000"),
            },
        )
        lot_oz = item.fine_troy_oz * item.quantity
        bucket["fine_troy_oz"] += lot_oz
        bucket["melt_value"] += item.total_melt_value
        bucket["market_value"] += item.total_market_value
        if item.purchase_price is not None and lot_oz > 0:
            bucket["cost_basis"] += item.purchase_price
            bucket["costed_oz"] += lot_oz

    metal_breakdown = []
    for metal, st in metal_stats.items():
        avg_cost_per_oz = (
            (st["cost_basis"] / st["costed_oz"]).quantize(Decimal("0.01"))
            if st["costed_oz"] > 0
            else None
        )
        metal_breakdown.append(
            {
                "metal_type": metal,
                "fine_troy_oz": st["fine_troy_oz"].quantize(Decimal("0.0001")),
                "melt_value": st["melt_value"].quantize(Decimal("0.01")),
                "market_value": st["market_value"].quantize(Decimal("0.01")),
                "avg_cost_per_troy_oz": avg_cost_per_oz,
            }
        )

    # Category breakdown
    cat_stats: dict[str, dict[str, Any]] = {}
    for item in active_items:
        c = cat_stats.setdefault(
            item.category,
            {"category": item.category, "count": 0, "market_value": Decimal("0.00")},
        )
        c["count"] += item.quantity
        c["market_value"] += item.total_market_value

    spots = get_latest_spot_map()
    gsr: Decimal | None = None
    if spots.get("GOLD") and spots.get("SILVER") and spots["SILVER"] > 0:
        gsr = (spots["GOLD"] / spots["SILVER"]).quantize(Decimal("0.01"))

    top_items = sorted(
        active_items, key=lambda i: i.total_market_value, reverse=True
    )[:10]

    return {
        "total_items": sum(i.quantity for i in active_items),
        "unique_entries": len(active_items),
        "total_market_value": total_market.quantize(Decimal("0.01")),
        "total_melt_value": total_melt.quantize(Decimal("0.01")),
        "total_cost_basis": total_cost.quantize(Decimal("0.01")),
        "unrealized_pnl": unrealized_pnl,
        "realized_pnl": realized_pnl,
        "gold_silver_ratio": gsr,
        "spot_prices": spots,
        "metal_breakdown": metal_breakdown,
        "category_breakdown": list(cat_stats.values()),
        "top_valuable_items": [_item_to_out(i) for i in top_items],
    }


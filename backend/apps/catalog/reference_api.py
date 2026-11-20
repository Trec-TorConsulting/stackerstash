from __future__ import annotations

import logging
from typing import Any

from ninja import Router, Schema

from apps.accounts.auth import WorkspaceAuth
from apps.catalog.models import ReferenceSyncLog, StaticMarketBaseline
from apps.catalog.reference_catalog import match_static_reference
from apps.catalog.reference_data.banknote_guru import analyze_us_serial
from apps.catalog.reference_data.grading import lookup_glossary_term
from apps.catalog.reference_data.storage_fit import recommend_storage_fit
from apps.valuation.services import compute_grading_roi_usd

logger = logging.getLogger(__name__)

reference_router = Router(tags=["Reference Data"], auth=WorkspaceAuth())


class SerialAnalysisIn(Schema):
    serial_number: str


@reference_router.get("/lookup")
def reference_lookup(
    request: Any,
    q: str = "",
    category: str | None = None,
    year: str | None = None,
) -> dict[str, Any]:
    """Look up collectible reference specs and guru diagnostics locally."""
    hints: dict[str, Any] = {}
    if category:
        hints["category"] = category
    if year:
        hints["year"] = year
    res = match_static_reference(q, hints)
    if res:
        return res
    return {"matched": False, "query": q}


@reference_router.post("/analyze-serial")
def reference_analyze_serial(request: Any, payload: SerialAnalysisIn) -> dict[str, Any]:
    """Deterministic fancy serial number pattern and FRB district analysis."""
    return analyze_us_serial(payload.serial_number)


@reference_router.get("/storage-fit")
def reference_storage_fit(
    request: Any,
    item_type: str = "COIN",
    diameter_mm: float | None = None,
    thickness_mm: float | None = None,
    point_thickness: int | None = None,
) -> dict[str, Any]:
    """Recommend capsule, tube, toploader, or sleeve protection sizing."""
    return recommend_storage_fit(
        item_type=item_type,
        diameter_mm=diameter_mm,
        thickness_mm=thickness_mm,
        point_thickness=point_thickness,
    )


@reference_router.get("/grading-roi")
def reference_grading_roi(
    request: Any,
    raw_value: float,
    graded_value: float,
    service: str = "PCGS",
    tier: str = "ECONOMY",
) -> dict[str, Any]:
    """Compute deterministic grading ROI backed by StaticGradingReference fee schedule."""
    upside = compute_grading_roi_usd(
        raw_market_val=raw_value,
        graded_market_val=graded_value,
        service=service,
        tier=tier,
    )
    return {
        "raw_value": str(raw_value),
        "graded_value": str(graded_value),
        "service": service.upper(),
        "tier": tier.upper(),
        "grading_upside_usd": str(upside),
    }


@reference_router.get("/glossary")
def reference_glossary(request: Any, term: str = "") -> dict[str, Any]:
    """Look up collector and grading terminology definitions."""
    defn = lookup_glossary_term(term)
    if defn:
        fn = defn.get("full_name") or ""
        ds = defn.get("desc") or ""
        desc = f"{fn}: {ds}" if fn and ds else (fn or ds)
    else:
        desc = None
    return {"term": term, "definition": desc, "details": defn}


@reference_router.get("/market-baselines")
def reference_market_baselines(
    request: Any,
    kind: str | None = None,
    symbol: str | None = None,
) -> list[dict[str, Any]]:
    """Return latest market baseline metrics (FX rates, spot snapshots, GSR)."""
    qs = StaticMarketBaseline.objects.all()
    if kind:
        qs = qs.filter(metric_kind=kind.upper())
    if symbol:
        qs = qs.filter(symbol=symbol.upper())
    return [
        {
            "ref_key": b.ref_key,
            "metric_kind": b.metric_kind,
            "symbol": b.symbol,
            "as_of_date": b.as_of_date.isoformat() if b.as_of_date else None,
            "value": str(b.value),
            "source_name": b.source_name,
            "extra_metrics": b.extra_metrics,
        }
        for b in qs[:100]
    ]


@reference_router.get("/sync-status")
def reference_sync_status(request: Any) -> list[dict[str, Any]]:
    """Return recent sync execution logs."""
    logs = ReferenceSyncLog.objects.order_by("-started_at")[:20]
    return [
        {
            "id": log.id,
            "sync_tier": log.sync_tier,
            "source_name": log.source_name,
            "status": log.status,
            "records_upserted": log.records_upserted,
            "error_message": log.error_message,
            "started_at": log.started_at.isoformat() if log.started_at else None,
            "completed_at": log.completed_at.isoformat() if log.completed_at else None,
        }
        for log in logs
    ]

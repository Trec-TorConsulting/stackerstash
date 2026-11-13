from __future__ import annotations

import logging
import re
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import ProviderCredential, Workspace
from apps.catalog.models import CollectionItem

from .models import AppraisalJob, SpotPriceSnapshot, ValuationHistory
from .providers import (
    fetch_spot_prices_from_gold_api,
    lookup_bullion_dealer_benchmark,
    lookup_cert_metadata,
    lookup_ebay_sold_comps,
    lookup_greysheet,
    lookup_numismedia,
    lookup_numista_specs,
)

logger = logging.getLogger(__name__)


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


def _merge_enriched_specs(
    item: CollectionItem,
    spec_candidates: list[tuple[str, dict[str, Any]]],
) -> None:
    """Populate empty or non-USER specs in priority order without overwriting user edits."""
    provenance = dict(item.specs_provenance or {})
    spec_fields = (
        "mint_mark",
        "mintage",
        "variety",
        "composition",
        "gross_weight_grams",
        "diameter_mm",
        "thickness_mm",
        "edge_type",
        "designer",
        "catalog_numbers",
    )
    for source_tag, specs in spec_candidates:
        if not specs:
            continue
        for field in spec_fields:
            if provenance.get(field) == "USER":
                continue
            val = specs.get(field)
            if val in (None, "", {}):
                continue
            current = getattr(item, field)
            if current in (None, "", {}) or provenance.get(field) in (None, "AI", source_tag):
                if field == "catalog_numbers" and isinstance(val, dict):
                    merged_cats = dict(current or {})
                    merged_cats.update({str(k): str(v) for k, v in val.items() if v})
                    setattr(item, field, merged_cats)
                else:
                    model_field = CollectionItem._meta.get_field(field)
                    max_len = getattr(model_field, "max_length", None)
                    if max_len and isinstance(val, str):
                        val = val.strip()[:max_len]
                    setattr(item, field, val)
                provenance[field] = source_tag
    item.specs_provenance = provenance


_HYPE_TOKENS = {"rare", "look", "l@@k", "wow", "nr", "estate", "unsearched", "must", "see"}
_PRESERVE_ACRONYMS = {
    "PCGS", "NGC", "PMG", "CACG", "ANACS", "ICG", "ASE", "AGE", "VAM",
    "EPQ", "PPQ", "DCAM", "UCAM", "DMPL", "PL", "BU", "UNC", "USD", "US", "USA",
}


def _clean_item_title(raw_title: str) -> str:
    """Deterministically normalize messy auction/CSV titles into clean collector Title Case."""
    text = re.sub(r"[!]+", " ", (raw_title or "").strip())
    text = re.sub(r"\s+", " ", text).strip(" -|,;:")
    if not text:
        return raw_title
    cleaned_words: list[str] = []
    for word in text.split(" "):
        stripped = word.strip(".,;:()[]{}")
        if stripped.lower() in _HYPE_TOKENS:
            continue
        upper = stripped.upper()
        if upper in _PRESERVE_ACRONYMS or re.match(r"^(MS|AU|XF|VF|F|VG|G|PR|PF)\d{1,2}\+?$", upper):
            cleaned_words.append(upper if stripped == word else word.replace(stripped, upper))
        elif re.match(r"^\d{4}-[A-Z]{1,2}$", upper):
            cleaned_words.append(upper)
        elif word.isupper() or word.islower():
            cleaned_words.append(word.capitalize())
        else:
            cleaned_words.append(word)
    result = " ".join(cleaned_words).strip()
    return (result or text)[:200]


def _update_job_step(job: AppraisalJob | None, step: str, state: str) -> None:
    if job is None:
        return
    steps = dict(job.steps or {})
    steps[step] = state
    job.steps = steps
    job.save(update_fields=["steps"])


def appraise_item(
    item: CollectionItem, workspace: Workspace, job: AppraisalJob | None = None
) -> CollectionItem:
    """Run concurrent multi-source appraisal: Melt + Specs + Guides + Comps + Multimodal AI."""
    spots = get_latest_spot_map()
    refresh_item_melt_from_latest_spot(item, spots)
    _update_job_step(job, "melt", "DONE")

    pcgs_token = _get_workspace_secret(workspace, ProviderCredential.Provider.PCGS)
    gs_key = _get_workspace_secret(workspace, ProviderCredential.Provider.GREYSHEET_KEY)
    gs_tok = _get_workspace_secret(workspace, ProviderCredential.Provider.GREYSHEET_TOKEN)
    numismedia_key = _get_workspace_secret(workspace, ProviderCredential.Provider.NUMISMEDIA_KEY)
    numista_key = _get_workspace_secret(workspace, ProviderCredential.Provider.NUMISTA_KEY)
    ebay_id = _get_workspace_secret(workspace, ProviderCredential.Provider.EBAY_CLIENT_ID)
    ebay_secret = _get_workspace_secret(workspace, ProviderCredential.Provider.EBAY_CLIENT_SECRET)

    from apps.vision.services import estimate_item_value_with_ai

    results: dict[str, Any] = {}
    errors: dict[str, str] = {}

    def _run_cert():
        if item.grading_service != CollectionItem.GradingService.NONE and item.cert_number:
            return lookup_cert_metadata(item.grading_service, item.cert_number, pcgs_token)
        return None

    def _run_greysheet():
        if gs_key and gs_tok:
            return lookup_greysheet(item.title, gs_key, gs_tok)
        return None

    def _run_numismedia():
        if numismedia_key:
            return lookup_numismedia(
                item.title,
                year=item.year,
                denomination=item.denomination,
                mint_mark=item.mint_mark,
                grade=item.grade or item.estimated_grade,
                api_key=numismedia_key,
            )
        return None

    def _run_numista():
        if numista_key:
            return lookup_numista_specs(
                item.title,
                year=item.year,
                country=item.country,
                denomination=item.denomination,
                api_key=numista_key,
            )
        return None

    def _run_comps():
        if ebay_id and ebay_secret:
            q = " ".join(p for p in [item.year, item.mint_mark, item.title, item.grade] if p).strip()
            return lookup_ebay_sold_comps(q, ebay_id, ebay_secret)
        return None

    def _run_ai():
        return estimate_item_value_with_ai(item, workspace)

    tasks = {
        "cert": _run_cert,
        "greysheet": _run_greysheet,
        "numismedia": _run_numismedia,
        "numista": _run_numista,
        "comps": _run_comps,
        "ai": _run_ai,
    }

    with ThreadPoolExecutor(max_workers=5) as pool:
        future_map = {pool.submit(fn): name for name, fn in tasks.items()}
        for fut in as_completed(future_map):
            name = future_map[fut]
            try:
                results[name] = fut.result()
            except Exception as exc:
                logger.warning("Appraisal provider %s failed for item %s: %s", name, item.id, exc)
                errors[name] = str(exc)

    _update_job_step(job, "specs", "DONE")
    _update_job_step(job, "price_guides", "DONE")
    _update_job_step(job, "comps", "DONE")
    _update_job_step(job, "ai", "DONE")

    cert_res = results.get("cert")
    gs_res = results.get("greysheet")
    nm_res = results.get("numismedia")
    numista_res = results.get("numista")
    comps_res = results.get("comps")
    ai_tuple = results.get("ai")
    ai_val, ai_raw = ai_tuple if isinstance(ai_tuple, tuple) else (None, {})

    # 1. Enrich specs in priority order: PCGS > NUMISTA > AI
    spec_candidates: list[tuple[str, dict[str, Any]]] = []
    if cert_res and cert_res.get("specs"):
        spec_candidates.append(("PCGS", cert_res["specs"]))
    if numista_res and numista_res.get("specs"):
        spec_candidates.append(("NUMISTA", numista_res["specs"]))
    if ai_raw and isinstance(ai_raw.get("inferred_specs"), dict):
        spec_candidates.append(("AI", ai_raw["inferred_specs"]))
    _merge_enriched_specs(item, spec_candidates)

    # 2. Collect all source quotes
    sources_payload: dict[str, Any] = {
        "SPOT_MELT": {
            "value": str(item.melt_value_unit),
            "status": "OK" if item.melt_value_unit > 0 else "N/A",
        }
    }
    quotes: list[tuple[str, Decimal]] = []

    if cert_res and cert_res.get("market_value"):
        v = Decimal(str(cert_res["market_value"])).quantize(Decimal("0.01"))
        sources_payload["PCGS"] = {"value": str(v), "status": "OK"}
        quotes.append((CollectionItem.ValuationSource.PCGS, v))
    elif cert_res:
        sources_payload[cert_res["source"]] = {
            "value": None,
            "status": "LINK_ONLY",
            "verification_url": cert_res.get("verification_url"),
        }

    if gs_res and gs_res.get("market_value"):
        v = Decimal(str(gs_res["market_value"])).quantize(Decimal("0.01"))
        sources_payload["GREYSHEET"] = {"value": str(v), "status": "OK"}
        quotes.append((CollectionItem.ValuationSource.GREYSHEET, v))

    if nm_res and nm_res.get("market_value"):
        v = Decimal(str(nm_res["market_value"])).quantize(Decimal("0.01"))
        sources_payload["NUMISMEDIA"] = {"value": str(v), "status": "OK"}
        quotes.append((CollectionItem.ValuationSource.NUMISMEDIA, v))

    if comps_res and comps_res.get("median"):
        v = Decimal(str(comps_res["median"])).quantize(Decimal("0.01"))
        comp_key = comps_res.get("source") or "COMPS"
        sources_payload[comp_key] = {
            "value": str(v),
            "low": str(comps_res["low"]),
            "high": str(comps_res["high"]),
            "count": comps_res["count"],
            "is_ask": bool(comps_res.get("is_ask", False)),
            "status": "ACTIVE_ASK" if comps_res.get("is_ask") else "OK",
        }
        # Realized sold comps rank above AI; active asking prices rank below AI/guides
        if not comps_res.get("is_ask"):
            quotes.append((CollectionItem.ValuationSource.COMPS, v))

    if ai_val is not None:
        sources_payload["AI_ESTIMATE"] = {
            "value": str(ai_val),
            "low": ai_raw.get("low_usd"),
            "high": ai_raw.get("high_usd"),
            "photo_inspected": ai_raw.get("photo_inspected", False),
            "status": "OK",
        }
        quotes.append((CollectionItem.ValuationSource.AI_ESTIMATE, ai_val))

    if comps_res and comps_res.get("is_ask") and comps_res.get("median") and not quotes:
        quotes.append((CollectionItem.ValuationSource.COMPS, Decimal(str(comps_res["median"])).quantize(Decimal("0.01"))))

    bullion_bench = lookup_bullion_dealer_benchmark(
        item.title, item.metal_type, item.melt_value_unit or Decimal("0.00")
    )
    if bullion_bench:
        sources_payload["BULLION_BENCHMARK"] = {
            "value": bullion_bench["low_usd"],
            "low": bullion_bench["low_usd"],
            "high": bullion_bench["high_usd"],
            "status": "BENCHMARK",
        }

    # 3. Reconcile primary market value & enforce melt-floor invariant
    melt_val = item.melt_value_unit or Decimal("0.00")
    primary_source, primary_val = quotes[0] if quotes else (None, None)

    final_val: Decimal | None = None
    final_source: str | None = None
    is_estimate = False

    if primary_val is not None and primary_val >= melt_val:
        final_val = primary_val
        final_source = primary_source
        is_estimate = primary_source in {
            CollectionItem.ValuationSource.AI_ESTIMATE,
            CollectionItem.ValuationSource.COMPS,
        }
    elif melt_val > Decimal("0.00"):
        final_val = melt_val
        final_source = CollectionItem.ValuationSource.SPOT_MELT
        is_estimate = False

    # 4. Compute Low / High range
    low_val: Decimal | None = None
    high_val: Decimal | None = None
    if comps_res and comps_res.get("low") and comps_res.get("high"):
        low_val = Decimal(str(comps_res["low"]))
        high_val = Decimal(str(comps_res["high"]))
    elif ai_raw and ai_raw.get("low_usd") and ai_raw.get("high_usd"):
        low_val = Decimal(str(ai_raw["low_usd"]))
        high_val = Decimal(str(ai_raw["high_usd"]))
    elif final_val is not None and final_val > 0:
        low_val = (final_val * Decimal("0.90")).quantize(Decimal("0.01"))
        high_val = (final_val * Decimal("1.10")).quantize(Decimal("0.01"))

    if melt_val > Decimal("0.00") and low_val is not None and low_val < melt_val:
        low_val = melt_val
    if final_val is not None and high_val is not None and high_val < final_val:
        high_val = final_val

    # 5. Confidence scoring
    has_guide = any(
        s in {
            CollectionItem.ValuationSource.PCGS,
            CollectionItem.ValuationSource.GREYSHEET,
            CollectionItem.ValuationSource.NUMISMEDIA,
        }
        for s, _ in quotes
    )
    if has_guide and (comps_res or len(quotes) >= 2):
        confidence = CollectionItem.ValuationConfidence.HIGH
    elif has_guide or (comps_res and comps_res.get("count", 0) >= 3) or (
        ai_val is not None and ai_raw.get("photo_inspected")
    ):
        confidence = CollectionItem.ValuationConfidence.MEDIUM
    else:
        confidence = CollectionItem.ValuationConfidence.LOW

    # 6. Explainability drivers & Collectibility thesis
    drivers: list[str] = []
    if melt_val > Decimal("0.00"):
        drivers.append(f"Live metal melt floor: ${melt_val:.2f} ({item.fine_troy_oz:.4f} fine ozt).")
    if primary_val is not None and melt_val > primary_val:
        drivers.append(
            f"Spot metal value (${melt_val:.2f}) currently exceeds numismatic guide/estimate (${primary_val:.2f})."
        )
    if cert_res and cert_res.get("market_value"):
        drivers.append(f"PCGS cert #{item.cert_number} price guide: ${cert_res['market_value']}.")
    if gs_res and gs_res.get("market_value"):
        drivers.append(f"Greysheet CDN valuation: ${gs_res['market_value']}.")
    if nm_res and nm_res.get("market_value"):
        drivers.append(f"NumisMedia FMV: ${nm_res['market_value']}.")
    if comps_res:
        comp_label = "Active eBay asking prices" if comps_res.get("is_ask") else "Realized sold comps"
        drivers.append(
            f"{comp_label} ({comps_res['count']} listings): ${comps_res['low']}–${comps_res['high']} (median ${comps_res['median']})."
        )
    if bullion_bench:
        drivers.append(
            f"Typical {bullion_bench['label']} dealer premium: +{bullion_bench['low_pct']:.0f}%–{bullion_bench['high_pct']:.0f}% over melt (${bullion_bench['low_usd']}–${bullion_bench['high_usd']})."
        )
    for d in ai_raw.get("valuation_drivers") or []:
        if d not in drivers:
            drivers.append(d)

    tier = ai_raw.get("collectibility_tier") or ""
    if not tier:
        if final_source == CollectionItem.ValuationSource.SPOT_MELT:
            tier = CollectionItem.CollectibilityTier.BULLION
        elif item.metal_type == CollectionItem.MetalType.NONE:
            tier = CollectionItem.CollectibilityTier.NUMISMATIC
        elif final_val and melt_val > 0 and final_val > melt_val * Decimal("1.15"):
            tier = CollectionItem.CollectibilityTier.SEMI_NUMISMATIC
        else:
            tier = CollectionItem.CollectibilityTier.BULLION

    hold_outlook = ai_raw.get("hold_outlook") or (
        "Value tracks precious-metal spot prices closely; high bullion liquidity."
        if tier == CollectionItem.CollectibilityTier.BULLION
        else "Carries collector premium above melt; hold for numismatic demand or consider third-party grading if raw."
    )

    # Raw / ungraded grade estimation enrichment (preserve USER override)
    if (
        item.grading_service == CollectionItem.GradingService.NONE
        and item.category in {"COIN", "PAPER", "FLIPPER", "ROUND"}
        and ai_raw
    ):
        prov = dict(item.specs_provenance or {})
        if ai_raw.get("estimated_grade") and prov.get("estimated_grade") != "USER":
            item.estimated_grade = ai_raw["estimated_grade"]
            prov["estimated_grade"] = "AI"
            item.specs_provenance = prov
        if ai_raw.get("estimated_grade_range"):
            item.estimated_grade_range = ai_raw["estimated_grade_range"]
        if ai_raw.get("estimated_grade_rationale"):
            item.estimated_grade_rationale = ai_raw["estimated_grade_rationale"]
        if ai_raw.get("grading_upside_usd") is not None:
            try:
                item.grading_upside_usd = Decimal(str(ai_raw["grading_upside_usd"])).quantize(Decimal("0.01"))
            except Exception:
                pass

    # Clean & normalize title for uniform catalog readability (preserve USER override)
    title_change: dict[str, str] | None = None
    prov = dict(item.specs_provenance or {})
    if prov.get("title") != "USER":
        ai_title = (ai_raw.get("normalized_title") or "").strip() if ai_raw else ""
        candidate_title = _clean_item_title(ai_title) if ai_title else _clean_item_title(item.title)
        if candidate_title and candidate_title != item.title:
            title_change = {"from": item.title, "to": candidate_title}
            item.title = candidate_title
            prov["title"] = "AI" if ai_title else "AUTO"
            item.specs_provenance = prov

    if ai_raw.get("ai_provider") == "GEMINI":
        item.ai_enrichment_pending = False
        item.ai_enrichment_last_error = ""
    elif ai_raw.get("gemini_quota_hit"):
        item.ai_enrichment_pending = True
        if not item.ai_enqueued_at:
            item.ai_enqueued_at = timezone.now()
        item.ai_enrichment_last_error = "Gemini quota exceeded (429); queued for deferred upgrade."

    if final_val is not None and final_source is not None:
        item.market_value_unit = final_val
        item.market_value_low = low_val
        item.market_value_high = high_val
        item.valuation_source = final_source
        item.valuation_confidence = confidence
        item.collectibility_tier = tier
        item.hold_outlook = hold_outlook
        item.valuation_drivers = drivers
        item.is_estimate = is_estimate
        item.valued_at = timezone.now()
        item.save()

        ValuationHistory.objects.create(
            item=item,
            melt_value_unit=item.melt_value_unit,
            market_value_unit=item.market_value_unit,
            source=final_source,
            is_estimate=is_estimate,
            raw_payload={
                "sources": sources_payload,
                "low_usd": str(low_val) if low_val is not None else None,
                "high_usd": str(high_val) if high_val is not None else None,
                "confidence": confidence,
                "collectibility_tier": tier,
                "hold_outlook": hold_outlook,
                "valuation_drivers": drivers,
                "grounded_sources": ai_raw.get("grounded_sources") or [],
                "title_updated": title_change,
                "errors": errors,
            },
        )
    elif ai_raw.get("gemini_quota_hit") or ai_raw.get("ai_provider") == "GEMINI":
        item.save(
            update_fields=[
                "ai_enrichment_pending",
                "ai_enqueued_at",
                "ai_enrichment_last_error",
                "updated_at",
            ]
        )

    return item


def _run_appraisal_job_thread(job_id: Any) -> None:
    from django.db import close_old_connections

    close_old_connections()
    try:
        job = AppraisalJob.objects.select_related("item", "workspace").get(id=job_id)
        job.status = AppraisalJob.Status.RUNNING
        job.save(update_fields=["status"])
        appraise_item(job.item, job.workspace, job=job)
        job.status = AppraisalJob.Status.COMPLETED
        job.completed_at = timezone.now()
        job.save(update_fields=["status", "completed_at"])
    except Exception as exc:
        logger.exception("AppraisalJob %s failed: %s", job_id, exc)
        AppraisalJob.objects.filter(id=job_id).update(
            status=AppraisalJob.Status.FAILED,
            error_message=str(exc),
            completed_at=timezone.now(),
        )
    finally:
        close_old_connections()


def start_appraisal_job(
    item: CollectionItem, workspace: Workspace, sync: bool = False
) -> AppraisalJob:
    """Create or reuse an active AppraisalJob; refresh melt immediately and run deep checks."""
    active = AppraisalJob.objects.filter(
        item=item,
        workspace=workspace,
        status__in=[AppraisalJob.Status.PENDING, AppraisalJob.Status.RUNNING],
    ).first()
    if active:
        return active

    spots = get_latest_spot_map()
    refresh_item_melt_from_latest_spot(item, spots)

    job = AppraisalJob.objects.create(
        workspace=workspace,
        item=item,
        status=AppraisalJob.Status.PENDING,
        steps={
            "melt": "DONE",
            "specs": "PENDING",
            "price_guides": "PENDING",
            "comps": "PENDING",
            "ai": "PENDING",
        },
    )
    if sync:
        _run_appraisal_job_thread(job.id)
        job.refresh_from_db()
    else:
        t = threading.Thread(target=_run_appraisal_job_thread, args=(job.id,), daemon=True)
        t.start()
    return job


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


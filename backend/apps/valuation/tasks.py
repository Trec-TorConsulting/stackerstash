import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import ProviderCredential, resolve_workspace_credential
from apps.catalog.models import CollectionItem

from .services import appraise_item, refresh_item_melt_from_latest_spot, refresh_spot_prices

logger = logging.getLogger(__name__)


@shared_task(name="apps.valuation.tasks.refresh_spot_prices_task")
def refresh_spot_prices_task() -> dict[str, str]:
    spots = refresh_spot_prices()
    return {k: str(v) for k, v in spots.items()}


@shared_task(name="apps.valuation.tasks.process_deferred_ai_enrichment_task")
def process_deferred_ai_enrichment_task(batch_size: int = 5) -> dict[str, int]:
    """Batch-process items queued after Gemini 429 quota limits once quota recovers."""
    pending = list(
        CollectionItem.objects.select_related("workspace", "workspace__owner")
        .filter(ai_enrichment_pending=True, ai_enrichment_attempts__lt=10)
        .order_by("ai_enqueued_at", "created_at")[:batch_size]
    )
    upgraded = 0
    deferred = 0

    for item in pending:
        gemini_cred, _ = resolve_workspace_credential(
            item.workspace, ProviderCredential.Provider.GEMINI
        )
        if gemini_cred is None:
            continue

        try:
            updated = appraise_item(item, item.workspace)
            if not updated.ai_enrichment_pending:
                upgraded += 1
            else:
                updated.ai_enrichment_attempts += 1
                updated.save(update_fields=["ai_enrichment_attempts", "updated_at"])
                deferred += 1
                # Stop batch early if Gemini is still returning 429 quota errors
                break
        except Exception as exc:
            from apps.vision.services import _sanitize_error_message

            sanitized_err = _sanitize_error_message(str(exc))
            logger.warning("Deferred AI enrichment failed for item %s: %s", item.id, sanitized_err)
            item.ai_enrichment_attempts += 1
            item.ai_enrichment_last_error = sanitized_err[:500]
            item.save(update_fields=["ai_enrichment_attempts", "ai_enrichment_last_error", "updated_at"])
            deferred += 1

    return {"checked": len(pending), "upgraded": upgraded, "deferred": deferred}


def reappraise_stale_items(
    stale_days: int | None = None,
    batch_size: int = 25,
) -> dict[str, int]:
    """Re-appraise stale items while preserving USER-locked market values."""
    days = stale_days if stale_days is not None else int(getattr(settings, "VALUATION_STALE_DAYS", 7))
    cutoff = timezone.now() - timedelta(days=days)
    stale_qs = (
        CollectionItem.objects.select_related("workspace")
        .filter(Q(valued_at__isnull=True) | Q(valued_at__lt=cutoff))
        .order_by("valued_at", "created_at")[:batch_size]
    )
    items = list(stale_qs)
    reappraised = 0
    skipped_locked = 0
    failed = 0

    for item in items:
        prov = dict(item.specs_provenance or {})
        if prov.get("market_value_unit") == "USER":
            try:
                refresh_item_melt_from_latest_spot(item)
                skipped_locked += 1
            except Exception as exc:
                logger.warning("Melt refresh failed for locked item %s: %s", item.id, exc)
                failed += 1
            continue

        try:
            appraise_item(item, item.workspace)
            reappraised += 1
        except Exception as exc:
            logger.warning("Stale re-appraisal failed for item %s: %s", item.id, exc)
            failed += 1

    return {
        "checked": len(items),
        "reappraised": reappraised,
        "skipped_locked": skipped_locked,
        "failed": failed,
    }


@shared_task(name="apps.valuation.tasks.reappraise_stale_items_task")
def reappraise_stale_items_task(stale_days: int | None = None, batch_size: int = 25) -> dict[str, int]:
    return reappraise_stale_items(stale_days=stale_days, batch_size=batch_size)


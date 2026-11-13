import logging

from celery import shared_task

from apps.accounts.models import ProviderCredential
from apps.catalog.models import CollectionItem

from .services import appraise_item, refresh_spot_prices

logger = logging.getLogger(__name__)


@shared_task(name="apps.valuation.tasks.refresh_spot_prices_task")
def refresh_spot_prices_task() -> dict[str, str]:
    spots = refresh_spot_prices()
    return {k: str(v) for k, v in spots.items()}


@shared_task(name="apps.valuation.tasks.process_deferred_ai_enrichment_task")
def process_deferred_ai_enrichment_task(batch_size: int = 5) -> dict[str, int]:
    """Batch-process items queued after Gemini 429 quota limits once quota recovers."""
    pending = list(
        CollectionItem.objects.select_related("workspace")
        .filter(ai_enrichment_pending=True, ai_enrichment_attempts__lt=10)
        .order_by("ai_enqueued_at", "created_at")[:batch_size]
    )
    upgraded = 0
    deferred = 0

    for item in pending:
        has_gemini = ProviderCredential.objects.filter(
            workspace=item.workspace,
            provider=ProviderCredential.Provider.GEMINI,
        ).exists()
        if not has_gemini:
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
            logger.warning("Deferred AI enrichment failed for item %s: %s", item.id, exc)
            item.ai_enrichment_attempts += 1
            item.ai_enrichment_last_error = str(exc)[:500]
            item.save(update_fields=["ai_enrichment_attempts", "ai_enrichment_last_error", "updated_at"])
            deferred += 1

    return {"checked": len(pending), "upgraded": upgraded, "deferred": deferred}


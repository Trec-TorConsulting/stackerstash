# Proposal: Ollama Fallback & Deferred AI Batch Queue on 429 Quota

## Why

1. When Gemini returns `429 Too Many Requests` (quota exceeded), Ollama is supposed to identify the item's basics immediately, but `_call_ollama_vision` and `estimate_item_value_with_ai` send `"format": "json"` with a 25–30s timeout, causing Ollama vision/thinking models to return `200 OK` with empty `message.content` or time out.
2. Items added or appraised while Gemini is rate-limited (429) should not stay stuck on basic fallback metadata forever—they should be queued and batch-updated automatically once Gemini quota returns.
3. The frontend PWA service worker does not enable `cleanupOutdatedCaches: true`, allowing stale cached UI bundles (such as the removed `Clean BG` button) to linger in browsers after deployment.

## What Changes

- Remove `"format": "json"` from Ollama `/api/chat` payloads in `_call_ollama_vision` and `estimate_item_value_with_ai`, support `message.thinking` fallback in `_parse_ollama_response`, and increase Ollama HTTP timeout to `45.0s` (within a `90.0s` remote-provider deadline inside Gunicorn's `120s` timeout).
- Return `quota_deferred: true` from `identify_images` when Gemini hits 429/quota and fallback is used.
- Add `ai_enrichment_pending`, `ai_enrichment_attempts`, `ai_enrichment_last_error`, and `ai_enqueued_at` fields to `CollectionItem` (with migration).
- Mark `CollectionItem.ai_enrichment_pending = True` when saved from a quota-deferred identification or when `appraise_item` hits a Gemini 429 fallback; clear it when Gemini appraisal succeeds.
- Add Celery task `apps.valuation.tasks.process_deferred_ai_enrichment_task` scheduled every 15 minutes via `CELERY_BEAT_SCHEDULE` to batch-update pending items (re-identifying empty fields + running full `appraise_item`), halting the batch immediately if Gemini still returns 429.
- Enable `cleanupOutdatedCaches: true` in `frontend/vite.config.ts` and pass `ai_enrichment_pending` on item creation in `ScanAddPage.tsx`.

## Capabilities

### Modified Capabilities
- `vision-identification`: Reliable Ollama fallback without `format: "json"` grammar lock, 45s Ollama timeout, and `quota_deferred` flag on 429 fallback.
- `deferred-ai-enrichment`: Batch queue fields on `CollectionItem`, automatic queueing on 429, and periodic Celery Beat worker processing.

## Impact

- `backend/apps/vision/services.py`
- `backend/apps/catalog/models.py`, `backend/apps/catalog/migrations/0008_collectionitem_deferred_ai_fields.py`, `backend/apps/catalog/schemas.py`, `backend/apps/catalog/api.py`
- `backend/apps/valuation/services.py`, `backend/apps/valuation/tasks.py`, `backend/config/settings.py`
- `frontend/vite.config.ts`, `frontend/src/lib/api.ts`, `frontend/src/pages/ScanAddPage.tsx`


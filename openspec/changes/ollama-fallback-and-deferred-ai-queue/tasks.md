## 1. Ollama Fallback Fix

- [x] 1.1 Remove `"format": "json"` from `_call_ollama_vision` and `estimate_item_value_with_ai`, support `message.thinking` in `_parse_ollama_response`, increase Ollama timeout to `45.0s` (with `90.0s` deadline in `identify_images`), and return `quota_deferred` when Gemini hits 429.

## 2. Deferred AI Batch Queue

- [x] 2.1 Add `ai_enrichment_pending`, `ai_enrichment_attempts`, `ai_enrichment_last_error`, and `ai_enqueued_at` to `CollectionItem` and generate migration `0008`.
- [x] 2.2 Expose `ai_enrichment_pending` in `CollectionItemOut` and `CollectionItemCreateIn`, and wire `appraise_item` to set/clear `ai_enrichment_pending` based on Gemini 429 vs success.
- [x] 2.3 Add `process_deferred_ai_enrichment_task` in `backend/apps/valuation/tasks.py` and schedule it in `CELERY_BEAT_SCHEDULE`.

## 3. Frontend & PWA Cache Cleanup

- [x] 3.1 Enable `cleanupOutdatedCaches: true` in `frontend/vite.config.ts` and pass `ai_enrichment_pending` from `identifyResult?.quota_deferred` on item creation in `ScanAddPage.tsx`.

## 4. Verification & Deployment

- [x] 4.1 Add unit tests for Ollama `thinking` fallback, `quota_deferred`, and `process_deferred_ai_enrichment_task`; run `pytest`, `ruff`, `vitest`, and `vite build`.
- [x] 4.2 Commit, push, build/push multi-arch backend & frontend images, and deploy to K3s.

# Design: Ollama Fallback & Deferred AI Batch Queue

## Decisions

1. **Ollama Payload**: Removing `"format": "json"` avoids grammar-sampler failures on Ollama vision models (`llama3.2-vision`, `qwen2.5vl`, `gemma3`, etc.) while `_extract_json_block` already extracts JSON from prose or fenced blocks. `_parse_ollama_response` also checks `message.thinking` if `message.content` is blank.
2. **Quota Detection Helper**: `_is_quota_error(msg)` checks for `"429"` or `"quota"` or `"rate"` in provider error strings so both `identify_images` and `estimate_item_value_with_ai` can signal `quota_deferred = True`.
3. **CollectionItem Queue Fields**: Storing `ai_enrichment_pending` directly on `CollectionItem` avoids a separate join table, supports filtering in list/detail APIs, and lets `appraise_item` automatically clear `ai_enrichment_pending = False` whenever a Gemini appraisal succeeds.
4. **Celery Beat Batch Processing**: `process_deferred_ai_enrichment_task` runs every 15 minutes (`900.0s`), processes up to 5 pending items (`ai_enrichment_attempts < 10`) in FIFO order, fills missing fields from Gemini vision if photos exist, runs `appraise_item`, and aborts the batch on the first 429 to respect rate-limit recovery.
5. **PWA Cache Cleanup**: `cleanupOutdatedCaches: true` in `frontend/vite.config.ts` ensures Workbox purges outdated precache entries on service worker activation.


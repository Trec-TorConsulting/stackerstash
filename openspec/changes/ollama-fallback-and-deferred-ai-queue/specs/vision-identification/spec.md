## MODIFIED Requirements

### Requirement: Ollama vision and appraisal fallback avoids grammar-lock empty responses
`_call_ollama_vision` and `estimate_item_value_with_ai` SHALL NOT force `"format": "json"` on Ollama `/api/chat` requests, SHALL use a `45.0` second timeout (bounded by the request deadline), and SHALL fall back to `message.thinking` if `message.content` and `response` are empty.

#### Scenario: Gemini 429 triggers Ollama basic identification
- **WHEN** Gemini returns `429 Too Many Requests` during `identify_images` and an Ollama URL is configured
- **THEN** `_call_ollama_vision` completes without `"format": "json"`, parses the JSON block from Ollama's response, and returns `quota_deferred: true` alongside the identified candidate

### Requirement: Deferred AI batch queue updates items when Gemini quota returns
`CollectionItem` SHALL track `ai_enrichment_pending`, `ai_enrichment_attempts`, `ai_enrichment_last_error`, and `ai_enqueued_at`. Items identified or appraised during a Gemini 429 fallback SHALL be marked `ai_enrichment_pending = True`, and a periodic Celery Beat task (`apps.valuation.tasks.process_deferred_ai_enrichment_task`) SHALL batch-process pending items when Gemini quota is available, stopping the batch early if Gemini still returns 429.

#### Scenario: Batch worker processes pending items and stops on 429
- **WHEN** `process_deferred_ai_enrichment_task` runs with pending items
- **THEN** it enriches and appraises items using Gemini and clears `ai_enrichment_pending`, or increments `ai_enrichment_attempts` and stops the current batch if Gemini returns 429

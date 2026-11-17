# Design: Resilient Vision Fallback and Timeout Budget

## Context

In production K3s, `POST /api/v1/vision/identify` runs synchronously inside a Gunicorn worker (`--timeout 60`). When Gemini free-tier quotas return 429, `identify_images` tries `gemini-2.0-flash` (404), then calls the in-cluster Ollama service (`timeout=60.0`), which took ~24–32s and failed with `Expecting value: line 1 column 1 (char 0)` because `resp.json()` or `_extract_json_block` received empty/NDJSON/non-JSON output. Finally, `_attempt_ocr_fallback` ran RapidOCR with `_preprocess_image_for_ocr` encoding a 1600px PNG, exceeding the 60s Gunicorn worker timeout and killing the worker.

## Decisions

1. **Remove retired `gemini-2.0-flash`**: Keep `GEMINI_VISION_MODELS = ("gemini-2.5-flash", "gemini-2.5-flash-lite")`.
2. **Harden `_call_ollama_vision`**:
   - Default `timeout: float = 25.0` (and pass `min(25.0, remaining_budget)` from `identify_images` if budget tracking is active).
   - Parse `resp.text`: if `resp.json()` fails, attempt line-by-line NDJSON parsing (`json.loads(line)` for each non-empty line, concatenating `message.content` or `response`), or raise `ValueError(f"Ollama returned non-JSON response: {raw_text[:200]}")`.
   - Extract `text = (data.get("message") or {}).get("content") or data.get("response") or ""` and raise `ValueError("Ollama returned empty completion text")` if blank.
3. **Request time budget in `identify_images`**:
   - Track `deadline = time.monotonic() + 75.0` (leaving 45s headroom inside Gunicorn's 120s timeout for OCR + DB/valuation work).
   - Before calling Ollama or additional remote providers, check `remaining = deadline - time.monotonic()`; if `remaining < 5.0`, skip remaining remote providers and go directly to `_attempt_ocr_fallback`.
4. **Faster OCR preprocessing**:
   - In `backend/apps/vision/ocr.py`, change `_preprocess_image_for_ocr` default `max_dimension` from `1600` to `1200` and save as JPEG (`quality=85`) instead of PNG, which is significantly faster in Pillow and RapidOCR with negligible accuracy loss.
5. **Gunicorn worker timeout**:
   - Update `backend/Dockerfile` `CMD` from `--timeout 60` to `--timeout 120`.


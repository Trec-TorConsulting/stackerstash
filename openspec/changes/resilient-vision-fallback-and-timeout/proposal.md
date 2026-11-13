# Proposal: Resilient Vision Fallback and Timeout Budget

## Why

Production K3s backend logs (`stackerstash-backend`) revealed three compounding failures when users click "Identify with AI":

1. **Retired Gemini fallback model**: `GEMINI_VISION_MODELS` still includes `gemini-2.0-flash`, which returns `404 Not Found` (`models/gemini-2.0-flash is no longer available to new users`) after `gemini-2.5-flash` and `gemini-2.5-flash-lite` hit `429 Too Many Requests`.
2. **Ollama JSON/NDJSON parsing failure & long hang**: `_call_ollama_vision` waits up to 60s (taking 24–32s in production) and then fails with `Expecting value: line 1 column 1 (char 0)` when Ollama returns an empty body, NDJSON chunks, or non-JSON text.
3. **Gunicorn 60s worker timeout**: After Gemini + Ollama consume 30–35s, `_attempt_ocr_fallback` runs RapidOCR with slow 1600px PNG re-encoding in `_preprocess_image_for_ocr`, pushing total request latency past Gunicorn's `--timeout 60` and causing `[CRITICAL] WORKER TIMEOUT` (`SIGKILL`) and a 502/504 error in the UI.

## What Changes

- Remove retired `gemini-2.0-flash` from `GEMINI_VISION_MODELS` in `backend/apps/vision/services.py`.
- Harden `_call_ollama_vision` to handle empty responses, NDJSON streaming lines, and non-JSON text cleanly with descriptive errors, and bound its HTTP timeout to `25.0` seconds.
- Add a per-request deadline/budget in `identify_images` so provider fallbacks do not starve local OCR fallback.
- Optimize `_preprocess_image_for_ocr` in `backend/apps/vision/ocr.py` to resize to `max_dimension=1200` and encode as JPEG (quality 85) instead of lossless PNG.
- Increase Gunicorn `--timeout` from `60` to `120` in `backend/Dockerfile` so multi-provider fallback + local OCR completes without worker `SIGKILL`.

## Capabilities

### Modified Capabilities
- `vision-identification`: Resilient Gemini model list, robust Ollama response parsing & bounded timeout, request time budget across fallbacks, faster OCR preprocessing, and 120s Gunicorn worker timeout.

## Impact

- `backend/apps/vision/services.py`
- `backend/apps/vision/ocr.py`
- `backend/Dockerfile`
- `backend/tests/test_valuation_and_vision.py`
- `backend/tests/test_ocr_fallback.py`


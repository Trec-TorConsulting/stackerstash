## 1. Vision Fallback & Timeout Fixes

- [x] 1.1 Remove retired `gemini-2.0-flash` from `GEMINI_VISION_MODELS` in `backend/apps/vision/services.py`.
- [x] 1.2 Harden `_call_ollama_vision` in `backend/apps/vision/services.py` to handle empty bodies, NDJSON lines, and non-JSON text with a bounded default timeout (`25.0s`).
- [x] 1.3 Add request time budget (`75.0s` remote provider deadline) in `identify_images` so fallback providers do not starve `_attempt_ocr_fallback`.
- [x] 1.4 Optimize `_preprocess_image_for_ocr` in `backend/apps/vision/ocr.py` (`max_dimension=1200`, JPEG quality `85`).
- [x] 1.5 Increase Gunicorn `--timeout` from `60` to `120` in `backend/Dockerfile`.

## 2. Verification & Deployment

- [x] 2.1 Add/update unit tests in `backend/tests/test_valuation_and_vision.py` and `backend/tests/test_ocr_fallback.py`, and run `pytest` and `ruff`.
- [x] 2.2 Commit, push to `origin main`, build multi-arch `stackerstash-backend:0.1.0` OCI archive, push via `skopeo`, and restart K3s deployments.

# Tasks

## 1. Dependencies & BYOK Vault Extension

- [x] 1.1 Add `rapidocr-onnxruntime` to `backend/pyproject.toml` and verify dependency resolution (`uv sync` or `pip check`) succeeds without breaking existing packages.
- [x] 1.2 Add `GROQ_API_KEY` and `OPENROUTER_API_KEY` to `ProviderCredential.Provider` in `backend/apps/accounts/models.py`, generate the Django migration, and verify with unit tests in `backend/tests/test_accounts.py` that saving, masking, and deleting both keys work as expected.

## 2. Gemini Quota Resilience & Image Optimization

- [x] 2.1 Implement Gemini model cascade (`gemini-2.5-flash` -> `gemini-2.5-flash-lite` -> `gemini-2.0-flash`) on HTTP 429/503 in `backend/apps/vision/services.py` for both `identify_images` and `estimate_item_value_with_ai`, and short-circuit the ungrounded appraisal retry when the grounded call returns HTTP 429; verify with `respx` unit tests in `backend/tests/test_valuation_and_vision.py` and `backend/tests/test_ai_appraisal.py`.
- [x] 2.2 Update `_collect_item_photo_b64` in `backend/apps/vision/services.py` to normalize and downscale appraisal photos (`max_dimension=1024`) via `_prepare_images_for_vision`, and verify in `backend/tests/test_ai_appraisal.py` that oversized images are resized before encoding.

## 3. Free Cloud Vision & Text Backup Providers (Groq & OpenRouter)

- [x] 3.1 Add OpenAI-compatible vision and text-only client helpers in `backend/apps/vision/services.py` for `GROQ_API_KEY` and `OPENROUTER_API_KEY` (using free-tier vision/text models) and wire them into the `identify_images` and `estimate_item_value_with_ai` fallback chain between Gemini and Ollama; verify with `respx` mock tests covering Gemini 429 -> Groq/OpenRouter success and error sanitization.

## 4. Local OCR & Text-Only / Deterministic Catalog Fallback

- [x] 4.1 Create `backend/apps/vision/ocr.py` with Pillow contrast preprocessing, lazy-loaded `rapidocr-onnxruntime` text extraction, and regex parsers for years, denominations, grading services, cert numbers, banknote serial numbers, and metal/purity keywords; verify with unit tests covering slab labels, paper currency text, and stamped bullion text.
- [x] 4.2 Wire OCR fallback into `identify_images` in `backend/apps/vision/services.py`: when all vision providers fail or are unconfigured, extract OCR text, attempt text-only (no-image) LLM structuring via any configured text provider, and enrich with deterministic `PCGS` / `Numista` / `auto_sort` lookups so readable items return a populated candidate (`OCR_TEXT` / `OCR_CATALOG`) while unreadable/empty images fall back cleanly to `MANUAL`; verify with integration tests in `backend/tests/test_valuation_and_vision.py`.

## 5. Settings UI & End-to-End Verification

- [x] 5.1 Expose `GROQ_API_KEY` and `OPENROUTER_API_KEY` with free-tier setup hints in `frontend/src/pages/SettingsPage.tsx` under the AI & Vision group, and verify frontend tests (`npm test`) and build (`npm run build`) pass.
- [x] 5.2 Run the full backend test suite (`pytest`) and `ruff check` across modified files to confirm zero regressions.

## Workflow follow-up

- Review the generated artifacts, implement via `/opsx-apply`, and archive the change once verified.


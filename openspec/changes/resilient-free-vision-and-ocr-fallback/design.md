# Design

## Context

See `proposal.md` for motivation. Currently in `backend/apps/vision/services.py`:
- `identify_images()` calls a single hardcoded model (`gemini-2.5-flash`), then `OLLAMA_URL`, then returns an empty `MANUAL` candidate.
- `estimate_item_value_with_ai()` reads raw photos via `_collect_item_photo_b64()` without downscaling, and loops `for use_grounding in (True, False)` against `gemini-2.5-flash`—which triggers a second Gemini call even when the first returns HTTP 429.
- `ProviderCredential.Provider` in `backend/apps/accounts/models.py` supports `GEMINI` and `OLLAMA_URL`/`OLLAMA_MODEL`, with no free cloud backup providers.

## Goals / Non-Goals

**Goals:**
- Reduce Gemini 429 occurrences via smaller appraisal image payloads and automatic model cascading.
- Provide zero-cost cloud vision/text backups (Groq, OpenRouter) alongside self-hosted Ollama.
- Guarantee that readable slabs, paper currency, stamped bars, and clear coins return pre-filled metadata via local OCR + text-only/deterministic lookup even when all vision APIs are exhausted or unconfigured.

**Non-Goals:**
- Integrating paid OCR APIs (e.g., Google Cloud Vision, AWS Textract).
- Auto-saving items without user review when confidence is low.
- Replacing multimodal vision AI as the primary path for raw/worn coins where visual surface grading is required.

## Decisions

1. **Gemini Model Cascade & 429 Short-Circuit**
   - Define an ordered model list: `("gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash")`.
   - On HTTP 429 or 503, immediately advance to the next model in the cascade.
   - In `estimate_item_value_with_ai()`, when `use_grounding=True` fails with HTTP 429, break out of the grounding retry for that model instead of making a second ungrounded call to the same exhausted model.
   - *Alternative considered*: Exponential backoff sleep on 429. Rejected as primary strategy because free-tier daily/minute quotas can remain exhausted for minutes, causing poor UX timeouts; cascading to `flash-lite` or backup providers is immediate.

2. **Appraisal Image Normalization**
   - Update `_collect_item_photo_b64()` to pass photo bytes through `_prepare_images_for_vision(..., max_dimension=1024)` so appraisal calls send compact oriented JPEGs instead of multi-megabyte raw camera files.

3. **Free Cloud Vision/Text Backups (`GROQ_API_KEY`, `OPENROUTER_API_KEY`)**
   - Add `GROQ_API_KEY` and `OPENROUTER_API_KEY` to `ProviderCredential.Provider` (encrypted at rest via existing Fernet vault) and expose them in `SettingsPage.tsx` under "AI & Vision".
   - Both expose OpenAI-compatible `/chat/completions` APIs, allowing a shared HTTP helper for vision and text-only requests.
   - Vision provider order: `GEMINI (cascade)` → `GROQ` → `OPENROUTER` → `OLLAMA` → `OCR fallback`.

4. **In-Process Local OCR (`rapidocr-onnxruntime`)**
   - Use `rapidocr-onnxruntime` with Pillow preprocessing (EXIF transpose, grayscale, autocontrast).
   - *Alternative considered*: `pytesseract`. Rejected because it requires the `tesseract-ocr` OS binary in local dev and Docker/K3s containers, whereas `rapidocr-onnxruntime` is a self-contained Python wheel.
   - Lazy-import and cache the OCR engine instance so startup time and memory are unaffected when primary vision succeeds.

5. **OCR → Text-Only LLM → Deterministic Catalog Pipeline (`backend/apps/vision/ocr.py`)**
   - Step 1 (Local OCR + Regex): Extract raw text lines and parse structured hints:
     - Grading service (`PCGS`, `NGC`, `PMG`, `PCGS_BANKNOTE`, `CACG`, `ANACS`, `ICG`), cert number, grade (`MS65`, `PR70`, `66 EPQ`, etc.)
     - 4-digit year (`1700–2026`), denomination (`$1`, `ONE DOLLAR`, `50 CENTS`, `25C`, `1 OZ`, etc.)
     - Banknote serial numbers and series years (`SERIES 2017A`)
     - Bullion metal & purity keywords (`SILVER`, `GOLD`, `COPPER`, `.999`, `.9999`, `FINE`)
   - Step 2 (Text-Only LLM, No Image): If any text-capable provider is configured (Groq text, OpenRouter text, `gemini-2.5-flash-lite` text-only, or Ollama text), send *only* the OCR text + regex hints to populate the standard JSON schema. Sending text-only uses ~200 tokens instead of thousands of image tokens.
   - Step 3 (Deterministic Catalog Enrichment): Even if no LLM succeeds, enrich the regex-parsed candidate with existing `PCGS` cert lookup (if cert + token exist), `Numista` query (if `NUMISTA_KEY` exists), and `auto_sort` / `presets` classification so a usable, pre-filled candidate is returned whenever OCR finds readable text (`provider_used="OCR_TEXT"` or `"OCR_CATALOG"`).

## Risks / Trade-offs

- **Raw/worn coin legibility**: Curved, low-contrast coin rims are harder for OCR than flat banknotes or slab labels → Mitigated by Pillow contrast preprocessing, permissive regexes, and graceful fallback to `MANUAL` with photos preserved when OCR text is empty.
- **Free-tier model ID churn**: Groq/OpenRouter free model slugs can change → Mitigated by centralizing model defaults in `backend/apps/vision/services.py` (with optional Django setting overrides) and falling through cleanly on 404/429.
- **Container image size**: `rapidocr-onnxruntime` adds ONNX runtime + lightweight OCR models → Mitigated by lazy loading and keeping dependencies minimal in `pyproject.toml`.


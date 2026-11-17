# Proposal

## Why

Users on the Google Gemini free tier frequently encounter `Gemini exceeded your current quota` (HTTP 429) during item identification and AI appraisal. Currently, `backend/apps/vision/services.py` only attempts a single model (`gemini-2.5-flash`), sends unresized full-resolution photos during appraisal, performs a second Gemini call even after a 429 error, and drops straight to an empty `MANUAL` candidate when Gemini and Ollama fail—leaving users with no pre-filled data.

## What Changes

- **Gemini Quota Optimization & Model Cascade**:
  - Add an automatic Gemini model fallback chain (`gemini-2.5-flash` → `gemini-2.5-flash-lite` → `gemini-2.0-flash`) when HTTP 429 / quota errors occur.
  - Short-circuit the ungrounded retry in `estimate_item_value_with_ai` when the grounded call fails with HTTP 429 so quota is not burned twice.
  - Downscale and JPEG-normalize photos in `_collect_item_photo_b64` (max 1024px) to reduce image token usage during appraisals.
- **Free Cloud Backup Providers (BYOK)**:
  - Add optional **Groq** (`GROQ_API_KEY`) and **OpenRouter** (`OPENROUTER_API_KEY`, defaulting to `:free` vision/text models) credentials to `ProviderCredential` and the Settings vault as zero-cost cloud fallbacks between Gemini and Ollama.
- **Local OCR + Text-Only & Deterministic Lookup Guarantee**:
  - Add a zero-cost, in-process local OCR pipeline (for slab labels, paper banknotes, stamped bars, and legible coin dates/denominations) that runs whenever all vision AI providers fail or are unconfigured.
  - Extract structured hints via regex (years, denominations, grading services, cert numbers, serial numbers, metal/purity keywords).
  - Route extracted text (with **no image**) to any available text-only LLM (`gemini-2.5-flash-lite`, Groq, OpenRouter, or Ollama) **or** directly into deterministic PCGS / Numista / `auto_sort` / melt lookups so identification **always returns the best populated candidate** rather than a blank manual form.

## Capabilities

### New Capabilities
<!-- None; existing capabilities own vision fallback and BYOK credentials. -->

### Modified Capabilities
- `vision-identification`: Expand the identification and appraisal fallback chain with Gemini model cascade, free cloud vision/text BYOK backups (Groq, OpenRouter), image token reduction, and a local OCR + text-only/catalog lookup fallback so readable items always return populated metadata.
- `identity-tenancy`: Extend the encrypted BYOK `ProviderCredential` vault and Settings UI to support `GROQ_API_KEY` and `OPENROUTER_API_KEY`.

## Impact

- **Backend**:
  - `backend/apps/vision/services.py` (Gemini model cascade, 429 short-circuit, appraisal photo downscaling, provider fallback chain)
  - `backend/apps/vision/ocr.py` (new module for local OCR, regex numismatic/currency extraction, text-only prompt fallback, and deterministic catalog/Numista/PCGS lookup)
  - `backend/apps/accounts/models.py` + new Django migration (add `GROQ_API_KEY`, `OPENROUTER_API_KEY` to `ProviderCredential.Provider`)
  - `backend/pyproject.toml` (add lightweight local OCR dependency)
  - `backend/tests/` (unit & integration tests for 429 cascade, Groq/OpenRouter mocks, OCR extraction, and text-only/deterministic fallback)
- **Frontend**:
  - `frontend/src/pages/SettingsPage.tsx` (surface `GROQ_API_KEY` and `OPENROUTER_API_KEY` with free-tier setup hints in the AI & Vision group)


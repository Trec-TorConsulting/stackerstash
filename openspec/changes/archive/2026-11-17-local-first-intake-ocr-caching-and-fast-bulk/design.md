# Design

## Context

See [proposal.md](proposal.md) for motivation. Currently, `frontend/src/pages/ScanAddPage.tsx` calls `POST /api/v1/vision/identify` immediately on Front capture in `CAMERA` mode and again on Back capture; `backend/apps/vision/services.py` invokes cloud Vision AI (`Gemini` → `Groq` → `OpenRouter` → `Ollama`) before `RapidOCR`; and `handleBatchCatalogAll` runs full Vision AI + `auto_appraise=True` for every pair. Meanwhile, the server already hosts Redis, Postgres, OpenCV, Pillow, and `RapidOCR` behind the PWA.

## Goals / Non-Goals

**Goals:**
- Resolve standard collectibles (US/world bullion, Goldbacks, constitutional silver, common coins, and graded slabs) locally via barcode/QR + `RapidOCR` + a static server reference catalog before spending any AI tokens.
- Cache image identification results (by SHA-256 and perceptual `dHash`), slab cert metadata, and external catalog lookups in Redis + Postgres so repeated queries are instant and free.
- Eliminate duplicate Front-only Vision AI calls during Camera Front+Back capture.
- Provide a **Fast Bulk Mode** that processes batches using local identification, parallel uploads, and spot-melt valuation without blocking on AI appraisal.

**Non-Goals:**
- Training or bundling a custom client-side ML classifier in the browser (heavy bundle size; the server handles OCR, static catalog, and caching).
- Modifying existing already-saved items retroactively without user action.

## Decisions

### 1. Local-First Identification Cascade (`identify_images`)
Instead of `Vision AI → OCR fallback`, `identify_images` executes in strict ascending-cost order within the existing 40–48s request budget:
1. **Image Hash Cache (`SHA-256` + `dHash`)**: Compute an 8×8 difference hash (`dHash`, Hamming distance ≤ 4) and exact SHA-256 over the submitted image pair. On hit in Redis/Postgres (`ImageIdentificationCache`), return immediately (`provider_used: "CACHE"`).
2. **Local Barcode/QR + `RapidOCR` + `parse_ocr_numismatic_hints`**: Decode any QR/1D slab barcode (`cv2.QRCodeDetector` + optional `pyzbar` / regex) and run `RapidOCR` once upfront (`~150–250ms` at `800px`).
3. **Cert Cache + Static Reference Catalog Match**:
   - If `grading_service` + `cert_number` is found, check `CertLookupCache` (Redis + Postgres) for cached cert metadata.
   - Run `match_static_reference(ocr_text, hints)` against the in-memory static reference catalog (`backend/apps/catalog/reference_catalog.py`). If a high-confidence match is found (e.g., Goldback state + denomination + year, American Silver/Gold Eagle, Maple Leaf, Morgan/Peace Dollar, 90% junk silver, Geiger/PAMP/Valcambi standard bar), return immediately (`provider_used: "LOCAL_CATALOG"`, 0 AI tokens).
4. **Text-Only LLM Tier**: If OCR extracted ≥ 25 characters of usable text without a confident static match, send a compact text-only prompt (no images) to the configured provider (~150 tokens vs ~2,600+ image tokens).
5. **Compact Composite Vision AI Escalation**: Only when local + text tiers cannot resolve the item, stitch `OBVERSE` and `REVERSE` into a single `768px` side-by-side JPEG composite and call Gemini/Groq/OpenRouter/Ollama Vision. Persist the result to `ImageIdentificationCache`.

*Alternative considered*: Running OCR in the browser via Tesseract.js. Rejected because it adds ~10MB+ WASM download to the mobile PWA and is slower than server-side `RapidOCR`.

### 2. Server-Hosted Static Reference Catalog (`reference_catalog.py`)
- Store a structured, versioned Python/JSON dataset in `backend/apps/catalog/reference_catalog.py` (loaded once at worker startup into memory) covering:
  - **Goldbacks**: States (Utah, Nevada, New Hampshire, Wyoming, South Dakota, Florida, Oklahoma, etc.), denominations (`1/2`, `1`, `2`, `5`, `10`, `25`, `50`, `100`, `1/4`), exact fine gold weights (`0.00025`–`0.1` ozt), purity `0.9999`, category `PAPER`.
  - **US & World Bullion / Coins**: ASE, AGE, Buffalo, Maple Leaf, Britannia, Krugerrand, Philharmonic, Kangaroo, Libertad, Morgan/Peace Dollars, 90% Constitutional Silver (dime/quarter/half/dollar), generic 1oz/5oz/10oz/1kg bars & rounds (metal, fine/gross weight, purity, diameter, thickness, composition).
  - **Slab Formats**: PCGS, NGC, PMG, PCGS Banknote, CACG, ANACS, ICG cert URL templates and regexes.
- Paired with Postgres cache models (`ImageIdentificationCache`, `CertLookupCache`, `CatalogLookupCache`) + Redis hot cache (TTL 7 days) so external Numista/cert lookups are never repeated.

### 3. Single-Pass Camera Debounce (3B)
- In `ScanAddPage.tsx`, `canIdentifyFiles` requires both `OBVERSE` and `REVERSE` for `COIN`, `SLAB`, and `PAPER` regardless of `intakeSource` (`CAMERA` or `UPLOAD`).
- Taking the Front photo stages and auto-crops it locally and highlights **Snap Back**; `runIdentify` automatically triggers once Back is captured (or when the user explicitly clicks **Identify with AI** for a single-sided item like a bar/coin).

### 4. Fast Basic Bulk Add Mode (3C)
- Add `identify_mode: "full" | "fast_local"` on `POST /api/v1/vision/identify` (`fast_local` runs Steps 1–3 only and returns immediately without calling any LLM).
- On `ScanAddPage.tsx`, add a **Fast Bulk Mode** toggle in the batch pairing banner:
  - Uses `identify_mode: "fast_local"` (0 AI tokens),
  - Creates items with `auto_appraise: false` and `ai_enrichment_pending: true` (when static/OCR didn't fully resolve title),
  - Uploads `OBVERSE` and `REVERSE` in parallel via `Promise.all`,
  - Relies on `create_item`'s synchronous `refresh_item_melt_from_latest_spot` for instant melt valuation.

## Risks / Trade-offs

- **False-positive static catalog match** (e.g., matching a 1 oz Silver Eagle when the photo is a commemorative silver round) → Require multiple corroborating tokens (issuer/series + denomination/weight) and return `ai_confidence` calibrated to match strength so low-confidence candidates still escalate to text/Vision AI.
- **`dHash` collision across similar-looking coins** → Include exact `SHA-256` first and enforce tight Hamming distance (`≤ 3`) plus workspace scoping for `dHash` hits.
- **User wants AI on a single-sided camera photo** → Keep the **Identify with AI** button always enabled whenever `files.length >= 1` so users can trigger identification on 1 photo at any time.

## Migration Plan

1. Add Django migration for `ImageIdentificationCache` and `CertLookupCache` (safe additive tables, zero impact on existing `CollectionItem` rows).
2. Deploy backend first (backward-compatible API with optional `identify_mode` parameter defaulting to `"full"`).
3. Deploy frontend with updated `ScanAddPage.tsx` single-pass camera flow and Fast Bulk Mode toggle.

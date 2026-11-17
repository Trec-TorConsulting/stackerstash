# Tasks

## 1. Server Static Reference Catalog & Caching Layer

- [x] 1.1 Create `backend/apps/catalog/reference_catalog.py` with the static collectible reference dataset (Goldback states/denominations/weights, common US & world bullion coins/rounds/bars, constitutional 90% silver, and slab cert patterns) and `match_static_reference(ocr_text, hints)`, verified by unit tests covering Goldback, Silver Eagle, and non-matching inputs.
- [x] 1.2 Add `ImageIdentificationCache` (SHA-256 + `dHash`) and `CertLookupCache` models + Django migration in `backend/apps/vision/` (or `catalog/`), with Redis hot-cache read/write helpers, verified by migration check and cache hit/miss unit tests.
- [x] 1.3 Wire `CertLookupCache` and static reference spec enrichment into `backend/apps/valuation/services.py` / cert lookup endpoints so repeated cert or Numista lookups resolve from cache without external HTTP calls, verified by mocked HTTP call-count tests.

## 2. Local-First Identification Cascade & Compact Vision (3A)

- [x] 2.1 Add local barcode/QR decoding (`cv2.QRCodeDetector` + slab barcode regexes) and expand `parse_ocr_numismatic_hints` in `backend/apps/vision/ocr.py` for Goldback, bullion bar/round, and coin inscriptions, verified by OCR parser unit tests.
- [x] 2.2 Invert `identify_images` in `backend/apps/vision/services.py` to execute: `ImageIdentificationCache` (SHA-256/`dHash`) → barcode/QR + `RapidOCR` + `CertLookupCache` + `match_static_reference` → text-only LLM tier → compact `768px` composite Vision AI (`_build_vision_composite`), plus `identify_mode: "full" | "fast_local"` in `backend/apps/vision/api.py`, verified by backend integration tests asserting zero AI calls on cache/static hits and text-only routing when OCR is rich.

## 3. Single-Pass Camera Flow & Fast Bulk Add Mode (3B & 3C)

- [x] 3.1 Update `canIdentifyFiles` and `ingestFiles` in `frontend/src/pages/ScanAddPage.tsx` so `CAMERA` mode waits for both `OBVERSE` and `REVERSE` before auto-calling `runIdentify` (while keeping the manual **Identify with AI** button available for single-photo items), verified by component tests in `frontend/src/__tests__/intake.test.tsx`.
- [x] 3.2 Add `identifyMode` support to `api.identifyImages` in `frontend/src/lib/api.ts` and a **Fast Bulk Mode** toggle in `frontend/src/pages/ScanAddPage.tsx` (`handleBatchCatalogAll`) that uses `identify_mode="fast_local"`, `auto_appraise=false`, and parallel `Promise.all` photo uploads, verified by batch intake component tests and `npx tsc -b && npx vitest run`.

## 4. End-to-End Verification

- [x] 4.1 Run full backend test suite (`.venv/bin/python -m pytest -q tests`) and full frontend checks (`npx tsc -b && npx vitest run && npx vite build`) and confirm all checks pass.

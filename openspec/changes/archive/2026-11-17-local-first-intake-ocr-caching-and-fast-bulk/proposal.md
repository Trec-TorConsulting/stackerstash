# Proposal

## Why

The current intake pipeline (`ScanAddPage` → `/api/v1/vision/identify` → `create_item`) sends full-resolution Vision AI requests prematurely and repeatedly: camera mode fires an AI identification call on the Front photo alone and a second full call after the Back photo is snapped, local `RapidOCR` only runs as a last-resort fallback after cloud providers fail, slab barcodes are not decoded automatically, and batch intake triggers full AI identification and appraisal jobs for every item. Because the PWA is backed by a persistent server with Redis, Postgres, OpenCV, and `RapidOCR`, we can invert the pipeline to resolve items locally first using OCR, barcode/QR decoding, a server-held static reference catalog, and perceptual/cert caching—invoking AI only when required.

## What Changes

- **Local-First Identification Pipeline (3A — OCR, Barcode, Text-Only Tier & Compact Vision)**:
  - Run local barcode/QR decoding and `RapidOCR` + `parse_ocr_numismatic_hints` **before** calling any external AI provider.
  - Match extracted OCR/barcode hints against a server-side static reference catalog (common US/world coins, bullion rounds/bars, Goldbacks, constitutional silver, and slab formats) to resolve structured fields with **zero AI tokens**.
  - When OCR yields rich text but no exact catalog match, run a **text-only LLM pass** (~150 tokens) instead of sending images.
  - Escalate to Vision AI only when local + OCR + text tiers cannot identify the item, and compress Vision payloads into a single `768px` composite image (cutting image tokens by 50–65%).
- **Server-Side Static Reference & Caching Layer (`server-reference-cache`)**:
  - Maintain a versioned, server-hosted static numismatic/bullion/Goldback/slab reference dataset in memory/Postgres (specs, weights, purities, diameters, mints, denominations, series, Goldback denominations/states, and slab cert URL/format rules) so the server never needs external lookups or AI for standard items.
  - Cache identification results by perceptual image hash (`dHash`) + exact SHA-256, and cache slab cert / Numista / catalog enrichment responses in Redis + Postgres.
- **Single-Pass Camera Front+Back Debounce (3B)**:
  - Stop firing an automatic Vision AI call after the Front photo alone in `CAMERA` mode; wait until both `OBVERSE` and `REVERSE` are captured (or the user explicitly taps **Identify with AI** for a single-sided item).
- **Fast Basic Bulk Add Mode (3C)**:
  - Add a **Fast Bulk Mode** on `ScanAddPage` for 2+ or 4+ paired photos that runs local auto-crop, local OCR + static reference matching (0 Vision AI calls by default), parallel photo uploads, immediate spot-melt valuation, and skips/defers full AI appraisal (`auto_appraise: false`).

## Capabilities

### New Capabilities
- `server-reference-cache`: Server-hosted static collectible reference catalog (coins, bullion, Goldbacks, slab formats) and perceptual-hash / cert / enrichment caching layer backed by Redis and Postgres.

### Modified Capabilities
- `vision-identification`: Invert identification to a local-first cascade (barcode/QR + RapidOCR + static catalog + dHash cache → text-only LLM → compact composite Vision AI), eliminate duplicate Front-only camera AI calls, and support a Fast Basic Bulk Add mode that skips/defers AI calls.

## Impact

- **Backend**:
  - `backend/apps/vision/ocr.py` (barcode/QR decode + expanded OCR parser)
  - `backend/apps/vision/services.py` (dHash cache, local-first cascade, text-only tier, composite Vision image prep, `mode="fast_local" | "full"`)
  - `backend/apps/vision/api.py` (intake mode / `local_only` flag)
  - New `backend/apps/catalog/reference_catalog.py` (static reference dataset + lookup/matching + cache models/Redis helpers)
  - `backend/apps/catalog/api.py` / `backend/apps/valuation/services.py` (cert & spec cache reuse, `auto_appraise=false` fast path)
- **Frontend**:
  - `frontend/src/pages/ScanAddPage.tsx` (wait for Front+Back in camera mode, explicit single-side ID action, Fast Bulk Mode toggle, parallel photo uploads)
  - `frontend/src/lib/api.ts` (pass `local_only` / `identify_mode` options)
- **Tests**:
  - Backend unit/integration tests for barcode/OCR-first fast path, static reference matching, dHash cache hits, and fast bulk mode.
  - Frontend tests for camera single-pass identification and Fast Bulk Mode.

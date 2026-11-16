# Proposal

## Why

Live inspection of `stackerstash.com` uncovered several image-processing, form, and UI/UX defects:
1. Raw coins/rounds with dark mirror proof fields, underexposed backgrounds, or 2×2 holders can lose the coin or invert the foreground mask during GrabCut background removal; banknotes in clear sleeves retain the sleeve/mat border; and small-denomination coins in grading slabs (cents, dimes, nickels, quarters) fail `detect_coin_in_slab` due to an overly high minimum radius (`0.25 * sw`). Additionally, upside-down or sideways photos have no in-app rotation control.
2. The `/scan` Purity field can display raw 32-bit float artifacts (e.g. `0.9990000128746033`), and forms across `/collection`, `/scan`, and `/settings` emit DOM accessibility/form warnings.
3. Collection cards show redundant/overlapping `Graded Slab` + `Graded` badges, items with gross weight and composition can display `0 ozt` / `$0.00` melt value when `fine_weight_oz` is missing, and the Dashboard displays `+$0.00` Unrealized P&L when total cost basis is `$0.00`.
4. Minor UI polish issues remain in the global footer (`Vault Sign In` shown when authenticated), Settings Ollama URL badge truncation, and mobile header logo contrast.

## What Changes

- **Image Processing & Photo Rotation**:
  - Add `detect_circular_coin` (CLAHE + `HoughCircles` + angular edge coverage + radial LAB contrast) for raw/flipped/capsuled coins and rounds, and lower `detect_coin_in_slab` `min_r` to `0.13 * sw` (with CLAHE fallback) so dimes, cents, nickels, and quarters inside slabs are extracted cleanly.
  - Fix `_salient_foreground_mask` border-contour scoring, `_remove_background_grabcut` inverted-mask recovery and RGBA re-clean seeding, and `detect_rectangular_subject` dark-rim refinement for sleeved notes/bars.
  - Add `POST /api/v1/catalog/items/{item_id}/photos/{photo_id}/rotate` endpoint and a **Rotate 90°** action in the item detail photo UI.
- **Form Precision & Accessibility**:
  - Normalize `purity` formatting on `/scan` to strip IEEE-754 float noise (e.g. `0.999`).
  - Add `id`/`name`/`<label>` associations on form controls in `/collection`, `/scan`, and `/settings`, wrap password fields in `<form>` elements on `/settings`, and replace the deprecated `apple-mobile-web-app-capable` meta tag in `frontend/index.html`.
- **Card UI, Valuation & Polish**:
  - Deduplicate `Graded Slab` / `Graded` badges on collection cards and adjust badge layout so labels don't overlap.
  - Fall back to computing fine weight from `gross_weight_g` and `purity` when `fine_weight_oz` is `0` on precious-metal items, and display `—` for Dashboard `Unrealized P&L` when `total_cost_basis` is `0`.
  - Hide/update the footer `Vault Sign In` link when authenticated, add ellipsis truncation to the Settings Ollama URL badge, and improve mobile header logo contrast.

## Capabilities

### Modified Capabilities
- `catalog-inventory`: Direct circular coin detection for raw/flipped/capsuled coins and small-denomination slabbed coins, improved rectangular sleeve/mat trimming, and 90° photo rotation endpoint/UI.
- `valuation-analytics`: Fine-weight fallback calculation from gross weight and purity when `fine_weight_oz` is zero, and `—` display for Unrealized P&L when cost basis is zero.

## Impact

- **Backend**: `backend/apps/catalog/image_processing.py`, `backend/apps/catalog/api.py`, `backend/apps/catalog/importer.py`, `backend/apps/catalog/models.py` / `valuation` helpers, `backend/tests/test_catalog.py`.
- **Frontend**: `frontend/index.html`, `frontend/src/lib/api.ts`, `frontend/src/pages/ScanAddPage.tsx`, `frontend/src/pages/ItemDetailPage.tsx`, `frontend/src/pages/CollectionPage.tsx`, `frontend/src/pages/DashboardPage.tsx`, `frontend/src/pages/SettingsPage.tsx`, `frontend/src/components/SiteFooter.tsx`, `frontend/src/components/Layout.tsx`.

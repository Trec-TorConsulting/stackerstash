# Proposal

## Why

Today, when client-side auto-crop succeeds during intake (`ScanAddPage`), the browser replaces the upload payload with a simple rectangular canvas crop and sends `auto_crop=false` to the server. That bypasses the server's category-aware edge detection, tilt deskewing, Obverse/Reverse size harmonization, and detail enhancement—producing inconsistent vault photos across coins, slabs, bars, paper notes, and assay cards. In addition, batch cataloging uploads `OBVERSE` and `REVERSE` concurrently (preventing sibling size alignment), and `_item_shape_hint` omits `ASSAY` when guarding rectangular documents attached to coins.

## What Changes

- Make **server-side** processing (`process_item_image`) the authoritative vault trimmer and finisher for all auto-cropped uploads (`auto_crop=true`), including deskewing tilted rectangles, shape-hinted edge detection (`coin`, `bar`, `note`, `rect`), and Obverse/Reverse sibling size alignment.
- Restrict **client-side** auto-crop (`autoCropImageFile`) to instant staging preview, glare/clipped-edge warnings, and AI identification—while retaining and uploading the normalized uncropped original (`originalFile ?? file`) with `auto_crop=true` in both single-item save and batch cataloging.
- Upload `OBVERSE` before `REVERSE` sequentially per item in batch cataloging (`handleBatchCatalogAll`) so server-side Obverse/Reverse sibling size alignment applies in batch mode just like single-item save.
- Preserve **manual crop/rotate** (`PhotoCropRotateView`, initialized from `originalFile ?? file`) and **Undo Auto** (`undoAutoCrop`) as explicit user overrides that send `auto_crop=false` so the server preserves user framing.
- Fix `_item_shape_hint` in `backend/apps/catalog/api.py` so `ASSAY` photos (alongside `RECEIPT` and `SLAB_LABEL` via `_RECTANGULAR_DOCUMENT_LABELS`) resolve to `"rect"` instead of `"coin"` on `COIN`/`ROUND` items.
- Confirm additional photos uploaded from `ItemDetailPage` continue using the `auto_crop=true` default for consistent vault presentation.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `guided-camera-capture`: Clarify that client-side auto-crop is preview-only when `autoCropEnabled` is active, retaining the normalized uncropped original for sequential server-authoritative upload (`auto_crop=true`) unless the user manually crops/rotates or clicks Undo Auto (`auto_crop=false`).
- `catalog-inventory`: Specify server-authoritative vault auto-trim, tilt deskewing, shape-hinted edge detection (including `ASSAY` document framing), and Obverse/Reverse dimension harmonization on photo upload when `auto_crop=true`, and exact framing preservation when `auto_crop=false`.

## Impact

- **Frontend**: `frontend/src/pages/ScanAddPage.tsx` (`ingestFiles`, `handleSave`, `handleBatchCatalogAll`, `PhotoCropRotateView` prop), `frontend/src/pages/ItemDetailPage.tsx` (verify default `autoCrop=true`), and `frontend/src/__tests__/autoCropIntake.test.tsx`.
- **Backend**: `backend/apps/catalog/api.py` (`_item_shape_hint`, `upload_item_photo`), `backend/apps/catalog/image_processing.py` (`process_item_image`, `deskew_tilted_rectangle`, `detect_subject_crop_box`, `align_crop_box_to_size`), and `backend/tests/test_catalog.py`.

# Tasks

## 1. Frontend Intake Preview vs. Upload Handoff (`ScanAddPage.tsx`)

- [x] 1.1 In `frontend/src/pages/ScanAddPage.tsx`, update `ingestFiles` (`serverAutoCrop: true` instead of `!r.applied` when `autoCropEnabled && isAutoCropSupported()`) and `handleSave` (`files[i].originalFile ?? files[i].file`) so client auto-crop remains a preview/AI input while `api.uploadPhoto` receives the normalized uncropped original with `{ autoCrop: true }` (keeping `harmonizeCropPair` and `undoAutoCrop` setting `serverAutoCrop: false` intact; verify `PhotoCropRotateView` receives `files[editingPhotoIndex].originalFile ?? files[editingPhotoIndex].file` and `onConfirm` sets `serverAutoCrop: false`).
- [x] 1.2 In `frontend/src/pages/ScanAddPage.tsx`, update `handleBatchCatalogAll` so `api.identifyImages` continues using `item.file` (preview-cropped when available) while `api.uploadPhoto` normalizes `item.originalFile ?? item.file` with `{ autoCrop: pair[i].serverAutoCrop }` and uploads each item's `OBVERSE` before `REVERSE` sequentially instead of `Promise.all` (verify by inspection and unit test).
- [x] 1.3 Update `frontend/src/__tests__/autoCropIntake.test.tsx` (replacing the old `"sends auto_crop=false for client-cropped photos..."` assertion) to verify: (a) client-cropped preview uploads `original` with `{ autoCrop: true }` on save, (b) `undoAutoCrop` uploads `original` with `{ autoCrop: false }`, (c) manual `PhotoCropRotateView` confirmation loads `original` when available and uploads the manually cropped file with `{ autoCrop: false }`, and (d) `handleBatchCatalogAll` passes `cropped` to `api.identifyImages` and uploads `original` sequentially (`OBVERSE` then `REVERSE`) with `{ autoCrop: true }`. Run `cd frontend && npm test` and verify all tests pass.

## 2. Backend Shape Hint Fix & Vault Auto-Crop Verification

- [x] 2.1 In `backend/apps/catalog/api.py`, update `_item_shape_hint` to check `if label in _RECTANGULAR_DOCUMENT_LABELS:` (instead of only `(RECEIPT, SLAB_LABEL)`) so `ASSAY` photos on `COIN`/`ROUND` items resolve to `shape_hint="rect"` in `upload_item_photo` and `recrop_collection_photos.py` (verify by inspection and pytest).
- [x] 2.2 Add pytest coverage in `backend/tests/test_catalog.py` verifying: (a) uploading an `ASSAY` photo for a `COIN` item with default `auto_crop=true` crops to the rectangular card rather than collapsing onto an inner coin, (b) uploading an `OBVERSE` + `REVERSE` pair for a tilted rectangular/coin item with `auto_crop=true` deskews, crops, and harmonizes dimensions, and (c) uploading with `auto_crop=false` preserves exact user framing while still enforcing the 1600px cap, enhancement, and thumbnail generation. Run `cd backend && .venv/bin/pytest` and verify all tests pass.

## 3. Item Detail Upload Check & Final Verification

- [x] 3.1 Verify `frontend/src/pages/ItemDetailPage.tsx` (`handleAddPhoto`) uploads with the `autoCrop=true` default and confirm both full test suites (`cd frontend && npm test` and `cd backend && .venv/bin/pytest`) pass with zero failures.

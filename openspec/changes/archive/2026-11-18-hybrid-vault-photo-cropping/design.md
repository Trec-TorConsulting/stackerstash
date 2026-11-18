# Design

## Context

See [proposal.md](./proposal.md) for motivation. Currently:
1. In `frontend/src/pages/ScanAddPage.tsx`, `ingestFiles` runs `autoCropImageFile(file)` when `autoCropEnabled` is true. When `r.applied` is true, it stores `file: r.file`, `originalFile: imageFiles[i]`, and sets `serverAutoCrop: !r.applied` (`false`). `handleSave` and `handleBatchCatalogAll` then upload `item.file` with `autoCrop: item.serverAutoCrop`, bypassing the server's `deskew_tilted_rectangle`, `detect_subject_crop_box(shape_hint=...)`, and sibling `target_size` alignment.
2. In `ScanAddPage.tsx` `handleBatchCatalogAll`, the two photos in a pair are uploaded via `Promise.all(...)`, so `OBVERSE` and `REVERSE` run concurrently and neither finds a committed sibling row for `target_size` alignment.
3. In `ScanAddPage.tsx`, `PhotoCropRotateView` opens `files[editingPhotoIndex].file` (the preview crop) rather than `originalFile ?? file`.
4. In `backend/apps/catalog/api.py`, `_item_shape_hint` returns `None` for `(RECEIPT, SLAB_LABEL)` (allowing line 1077 to map `_RECTANGULAR_DOCUMENT_LABELS` to `"rect"`), but omits `ASSAY`, so an `ASSAY` photo on a `COIN`/`ROUND` item falls through to `"coin"`.

## Goals / Non-Goals

**Goals:**
- Make server-side `process_item_image(..., auto_crop=True)` the single authoritative trimmer/deskewer/aligner for all auto-cropped photos across single-item save, batch catalog, and item-detail uploads.
- Keep client-side `autoCropImageFile` and `harmonizeCropPair` intact for instant staging previews, clipped-edge/glare warnings, and `api.identifyImages`.
- Ensure manual framing (`PhotoCropRotateView`), explicit revert (`undoAutoCrop`), and toggle-off (`autoCropEnabled === false`) cleanly pass `auto_crop=false`.
- Ensure `ASSAY` photos on `COIN`/`ROUND` items resolve to `shape_hint="rect"`.

**Non-Goals:**
- Enabling automatic background removal (`remove_background=True`) on upload.
- Changing `GuidedCameraModal.tsx` (currently standalone and tested separately in `intake.test.tsx`).
- Changing the `normalizeImageFileForUpload(..., 2048, 0.92)` upload arguments in `ScanAddPage.tsx` / `ItemDetailPage.tsx` (keeping 2048px client upload headroom gives the server's cropper more pixels before it encodes down to `MAX_IMAGE_DIMENSION = 1600`).
- Rewriting CV algorithms inside `autoCrop.ts` or `image_processing.py`.

## Decisions

1. **`StagedPhoto` field invariants in `ScanAddPage.tsx`**
   - `file`: Preview image displayed in the staging grid and passed to `api.identifyImages` (`runIdentify` and `handleBatchCatalogAll` step 1). When `autoCropImageFile` applies, `file` is the client-cropped (and possibly `harmonizeCropPair`-aligned) image; `originalFile` holds the untouched `imageFiles[i]`.
   - `serverAutoCrop`:
     - In `ingestFiles` when `autoCropEnabled && isAutoCropSupported()`: set `serverAutoCrop: true` unconditionally (even when `r.applied` is `true`). Keep `originalFile: r.applied ? imageFiles[i] : undefined` and `autoCropped: r.applied`.
     - In `ingestFiles` when `!autoCropEnabled || !isAutoCropSupported()`: keep `serverAutoCrop: autoCropEnabled` (`false` when toggle is off).
     - In `undoAutoCrop(idx)`: keep existing behavior (`file: original`, `originalFile: undefined`, `cropResult: undefined`, `autoCropped: false`, `serverAutoCrop: false`) because clicking Undo Auto expresses user intent to keep the uncropped original.
     - In `PhotoCropRotateView`: pass `imageFile={files[editingPhotoIndex].originalFile ?? files[editingPhotoIndex].file}` so manual editing starts from the full uncropped frame when available. Its `onConfirm` keeps `file: croppedFile`, `originalFile: undefined`, `cropResult: undefined`, `autoCropped: false`, `serverAutoCrop: false`.
   - Upload payload selection:
     - In `handleSave`: normalize `files[i].originalFile ?? files[i].file` via `normalizeImageFileForUpload(sourceFile, 2048, 0.92)` and pass `{ autoCrop: files[i].serverAutoCrop }`.
     - In `handleBatchCatalogAll`: normalize `pair.map((item) => normalizeImageFileForUpload(item.file, 2048, 0.92))` for `api.identifyImages`, and normalize `item.originalFile ?? item.file` for `api.uploadPhoto`. Upload `pair` sequentially (`for (let i = 0; i < pair.length; i++)`) with `OBVERSE` (`i === 0`) before `REVERSE` (`i === 1`) so `REVERSE` finds `OBVERSE`'s stored dimensions for `target_size` alignment.

2. **Fix `ASSAY` label shape hinting in `backend/apps/catalog/api.py`**
   - Update `_item_shape_hint(item, label)` line 1016 from `if label in (ItemPhoto.Label.RECEIPT, ItemPhoto.Label.SLAB_LABEL):` to `if label in _RECTANGULAR_DOCUMENT_LABELS:` so `ASSAY` (along with `RECEIPT` and `SLAB_LABEL`) returns `None` and is consistently promoted to `"rect"` by both `upload_item_photo` and `recrop_collection_photos.py`.
   - Keep `ItemDetailPage.tsx` line 213 calling `api.uploadPhoto(id, normalized, nextLabel, !existingLabels.size)` (which defaults `autoCrop` to `true`).

3. **Updating existing frontend unit tests (`frontend/src/__tests__/autoCropIntake.test.tsx`)**
   - Test 1 (`"auto-crops camera photos, identifies with the cropped file, and supports undo"`) stays valid because `runIdentify` still sends `cropped`.
   - Test 3 (`"sends auto_crop=false for client-cropped photos and true for uncropped ones on save"`) tests the superseded behavior and must be updated to assert that a client-auto-cropped preview uploads the original file with `{ autoCrop: true }`, while adding coverage for `PhotoCropRotateView` (`{ autoCrop: false }`), `undoAutoCrop` (`{ autoCrop: false }`), and `handleBatchCatalogAll` (`identifyImages` receives `cropped`; sequential `uploadPhoto` calls receive `original` with `{ autoCrop: true }`).

## Risks / Trade-offs

- **[Risk] Staging preview differs slightly from final saved vault thumbnail** → Mitigation: Both perform tight rectangular framing; the server adds tilt deskewing and Obverse/Reverse symmetry, and post-save navigation loads the server-processed asset.
- **[Risk] Sequential `OBVERSE` → `REVERSE` upload in batch mode adds one extra serial HTTP round-trip per item** → Mitigation: Only 2 photos per item are uploaded sequentially (`OBVERSE` then `REVERSE`), while uploads are already normalized on the client; this minor latency trade-off guarantees uniform Front/Back symmetry in the vault.

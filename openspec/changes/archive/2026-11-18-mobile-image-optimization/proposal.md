# Proposal: Mobile Image Optimization

## Why

Processed item photos are currently stored as high-bitrate JPEGs (`quality=95`) or lossless PNGs up to `2400px` (and up to `4096px` on client auto-crop), and catalog list/grid views fetch full-resolution images because `ItemPhoto` has no thumbnail derivative. On slow mobile connections, this causes sluggish uploads, heavy data usage, and slow gallery rendering.

## What Changes

- **WebP-first backend encoding**: Update `process_item_image` and `rotate_item_image` to encode non-transparent images as WebP (`quality=82`, `method=5`) instead of `quality=95` JPEG or lossless PNG, while preserving PNG/WebP alpha only when transparency is actually present.
- **Bounded output dimensions**: Lower `MAX_IMAGE_DIMENSION` from `2400` to `1600` px on the backend and align client `AUTO_CROP_DEFAULTS.maxOutputDimension` (`4096` → `1600`) so uploads and stored images stay sharp for inspection and OCR without excessive pixel counts.
- **Thumbnail derivative for list/grid views**: Add an optional `thumbnail` `ImageField` (`480px` max dimension, WebP `quality=78`) on `ItemPhoto`, generated on photo upload, import, and rotation, and expose `thumbnail_url` on `PhotoOut` and `primary_thumbnail_url` on item list/detail schemas (falling back to the full URL when null).
- **Mobile-friendly client upload compression**: Tune frontend JPEG/WebP upload encoding (`GuidedCameraModal`, `imageUtils`, `autoCrop`) from `0.92–0.94` to `0.82–0.84` (using `image/webp` when supported, with JPEG fallback), and lower the `normalizeImageFileForUpload` bypass threshold from `1,200,000` bytes to `350,000` bytes.
- **Frontend thumbnail usage & lazy loading**: Use `primary_thumbnail_url` (with fallback to `primary_photo_url`) and `loading="lazy"` / `decoding="async"` in collection/dashboard cards, reserving full-resolution `url` for `ItemDetailPage` and zoom/crop views.

## Capabilities

### New Capabilities

_(None — all changes extend existing catalog and camera capture capabilities.)_

### Modified Capabilities

- `catalog-inventory`: Require WebP-optimized full-size storage (`<= 1600px`), generation of a `<= 480px` WebP thumbnail derivative on upload/rotation/import, `thumbnail_url` / `primary_thumbnail_url` API fields, and thumbnail usage in gallery/list views.
- `guided-camera-capture`: Require client-side capture, auto-crop, and upload normalization to cap output dimensions at `1600px` and compress uploads at `0.82–0.84` quality (WebP or JPEG) with a `350 KB` pass-through threshold.

## Impact

- **Backend**: `backend/apps/catalog/image_processing.py`, `backend/apps/catalog/models.py` (+ migration), `backend/apps/catalog/api.py`, `backend/apps/catalog/importer.py`, and existing catalog/image tests.
- **Frontend**: `frontend/src/lib/imageUtils.ts`, `frontend/src/lib/autoCrop.ts`, `frontend/src/components/GuidedCameraModal.tsx`, `frontend/src/lib/api.ts`, `frontend/src/pages/CollectionPage.tsx`, `frontend/src/pages/DashboardPage.tsx`, and frontend unit tests.
- **API**: Additive, backwards-compatible fields (`thumbnail_url` on `PhotoOut`, `primary_thumbnail_url` on item schemas); `url` and `primary_photo_url` remain unchanged.

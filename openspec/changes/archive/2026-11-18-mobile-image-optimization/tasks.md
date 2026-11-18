# Tasks

## 1. Backend Image Encoding & Thumbnail Generation

- [x] 1.1 Update `backend/apps/catalog/image_processing.py` to set `MAX_IMAGE_DIMENSION = 1600`, encode opaque processed images as WebP (`quality=82, method=5`) in `_encode_processed_image` (preserving alpha/PNG only when `img.mode == "RGBA"` or `force_png=True`), and add `generate_image_thumbnail(raw_or_processed_bytes, max_dimension=480, quality=78)` returning `(bytes, width, height, "webp")`; verify with unit tests in `backend/tests/test_catalog.py` (or `test_image_verification.py`) asserting WebP output, `<= 1600px` main image, `<= 480px` thumbnail, and preserved RGBA cutouts.
- [x] 1.2 Add nullable `thumbnail = models.ImageField(upload_to=item_photo_upload_path, max_length=255, null=True, blank=True)` to `ItemPhoto` in `backend/apps/catalog/models.py` and create the Django migration via `makemigrations catalog`; verify `python manage.py migrate` and `python manage.py check` succeed cleanly.
- [x] 1.3 Update `backend/apps/catalog/api.py` (`PhotoOut`, item list/detail schemas, `_photo_to_out`, `upload_item_photo`, `rotate_item_photo`) and `backend/apps/catalog/importer.py` to generate/save `photo.thumbnail` on upload, import, and rotation (deleting old thumbnail on rotate), and expose `thumbnail_url` / `primary_thumbnail_url` with fallback to `image.url`; verify with backend API tests covering upload, rotation, and legacy fallback when `thumbnail` is null.

## 2. Frontend Upload Compression & Thumbnail Rendering

- [x] 2.1 Add a shared `canvasToOptimizedBlob(canvas, quality)` helper in `frontend/src/lib/imageUtils.ts` that encodes `"image/webp"` with `"image/jpeg"` fallback, update `renderCroppedRotatedImage`, `rotateImageFile90`, `normalizeImageFileForUpload` (`maxDimension = 1600`, `quality = 0.82`, pass-through threshold `350_000` bytes), `GuidedCameraModal.tsx` (`canvasToJpegFile` / optimized upload at `0.83`), and `AUTO_CROP_DEFAULTS` in `frontend/src/lib/autoCrop.ts` (`maxOutputDimension = 1600`, `jpegQuality = 0.83`); verify with updated Vitest unit tests in `frontend/src/__tests__/imageUtils.test.ts` and `frontend/src/__tests__/autoCrop.test.ts`.
- [x] 2.2 Update `frontend/src/lib/api.ts` types (`PhotoOut` / item types) to include `thumbnail_url` and `primary_thumbnail_url`, and update `frontend/src/pages/CollectionPage.tsx` and `frontend/src/pages/DashboardPage.tsx` to render `item.primary_thumbnail_url || item.primary_photo_url` with `loading="lazy"` and `decoding="async"`, keeping full-resolution `url` for `ItemDetailPage.tsx`; verify with `npm run test` and `npm run build` in `frontend/`.

## 3. Integration Verification

- [x] 3.1 Run the full backend test suite (`pytest`) and frontend test/build suite (`npm test && npm run build`) and confirm all tests pass without regressions.

## Workflow follow-up

- Archive the change via `/opsx-archive` after implementation and PR merge.

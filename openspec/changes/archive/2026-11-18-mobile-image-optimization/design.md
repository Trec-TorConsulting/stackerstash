# Design: Mobile Image Optimization

## Context

See `proposal.md` (Why) for motivation. Currently, the frontend (`GuidedCameraModal.tsx`, `imageUtils.ts`, `autoCrop.ts`) and backend (`image_processing.py`) encode photos at high quality (`0.92–0.95`), allow dimensions up to `2400–4096px`, fall back to lossless PNG for non-JPEG/non-WebP uploads, and store a single `ItemPhoto.image` file without a thumbnail derivative.

## Goals / Non-Goals

**Goals:**
- Reduce upload payload sizes over slow mobile connections by capping client-side dimensions at `1600px` and encoding at `0.82–0.84` quality.
- Reduce stored and served image sizes on the backend by standardizing opaque processed photos on WebP (`quality=82, method=5`) capped at `1600px`.
- Eliminate full-resolution downloads in collection/dashboard list views by generating a `<= 480px` WebP thumbnail (`quality=78`) per `ItemPhoto`.
- Maintain full backward compatibility for existing `ItemPhoto` records that do not yet have a `thumbnail` file.

**Non-Goals:**
- Re-encoding or migrating existing historical `ItemPhoto` files in bulk during the schema migration (existing rows fall back gracefully to `image.url`; an optional backfill can be run separately if needed).
- Changing Vision AI / OCR identification behavior or accuracy thresholds.
- Modifying `deploy/chart/` (production Helm chart lives outside this repo).

## Decisions

1. **WebP (`quality=82, method=5`) as default backend format for opaque images**
   - *Rationale*: Pillow's WebP encoder produces 25–35% smaller files than JPEG at equivalent perceptual quality for coins, slabs, and banknotes, and 5–10× smaller files than PNG. All modern mobile browsers (iOS Safari 14+, Android Chrome) support WebP.
   - *Alpha preservation*: `_encode_processed_image` checks `img.mode == "RGBA"` (and whether `force_png=True` is explicitly requested, e.g. for transparent cutouts). When `RGBA` is present, WebP lossless/lossy-with-alpha or PNG can be used; keeping PNG for `force_png=True` transparent cutouts avoids breaking existing cutout expectations while converting all opaque `RGB` photos to WebP.
   - *Alternative considered*: Progressive JPEG at `quality=82`. Rejected as primary format because WebP yields consistently smaller payloads; kept as a client-side fallback when `canvas.toBlob("image/webp")` is unsupported.

2. **Cap `MAX_IMAGE_DIMENSION` and `AUTO_CROP_DEFAULTS.maxOutputDimension` at `1600px`**
   - *Rationale*: `1600px` on the long edge provides ~55% fewer pixels than `2400px` (and ~85% fewer than `4096px`) while retaining crisp mint marks, slab certification numbers, and banknote serial numbers for both human zoom and Vision AI/OCR.
   - *Alternative considered*: `1200px`. Rejected because small-denomination coins inside tall grading slabs can lose fine mint-mark detail below `1400–1600px`.

3. **Dedicated `thumbnail` `ImageField` on `ItemPhoto` (`<= 480px`, WebP `quality=78`)**
   - *Rationale*: Storing a pre-generated `480px` WebP (~15–35 KB) alongside `image` avoids on-the-fly image resizing on every HTTP request and keeps Django's static/media serving simple.
   - *API contract*: Add `thumbnail_url: str | None = None` to `PhotoOut` and `primary_thumbnail_url: str | None = None` to item list/detail schemas. When `photo.thumbnail` is empty (legacy rows), `thumbnail_url` falls back to `photo.image.url` (or `None` if no image) so the frontend can always bind `primary_thumbnail_url ?? primary_photo_url`.
   - *Alternative considered*: Dynamic resizing proxy / query-param resizer (`?w=480`). Rejected to avoid adding infrastructure complexity or runtime CPU spikes on the K3S pod.

4. **Client-side WebP encoding with JPEG fallback (`0.82–0.84` quality) and `350 KB` normalization threshold**
   - *Rationale*: Encoding at `0.82–0.84` before upload halves mobile uplink time and avoids double-compressing oversized files. Lowering `normalizeImageFileForUpload`'s pass-through threshold from `1,200,000` bytes to `350,000` bytes ensures 400 KB–1.2 MB gallery picks are also resized/compressed before upload.
   - *Helper*: Add a small shared `canvasToOptimizedBlob(canvas, quality)` helper in `frontend/src/lib/imageUtils.ts` that tries `"image/webp"` first and falls back to `"image/jpeg"` if `blob` is null or its MIME type is not `image/webp`.

## Risks / Trade-offs

- **Legacy `ItemPhoto` rows without thumbnails** → `thumbnail` field is `null=True, blank=True`; `_photo_to_out` and item serializers fall back to `image.url` when `thumbnail` is absent, requiring zero downtime or blocking data migration.
- **Older test mocks for `HTMLCanvasElement.prototype.toBlob`** → Frontend unit tests that mock `toBlob` may assert `image/jpeg` or not handle `image/webp`; tests will be updated to support the new helper and verify quality/dimension bounds.
- **Slightly softer sharpening** → Reducing JPEG/WebP quality from `95` to `82` can marginally soften extreme zoom, which is mitigated by keeping `1600px` resolution and `enhance=True` on server-side `process_item_image`.

## Migration Plan

1. Add `thumbnail = models.ImageField(upload_to=item_photo_upload_path, max_length=255, null=True, blank=True)` to `ItemPhoto` and generate the Django migration.
2. Deploy backend and frontend together; existing items continue rendering via `image.url` fallback while all new uploads, imports, and rotations produce WebP images and thumbnails.
3. Rollback is safe: reverting the code leaves `thumbnail` nullable and unused, and WebP `image` files remain valid in all browsers.

# Tasks

## 1. Server-Side Auto-Crop, Deskew & Quality Forensics

- [x] 1.1 Update `AUTO_CROP_PADDING_RATIO` to `0.06` and improve foreground isolation on textured/carbon-fiber mats and dark-on-dark slabs in `backend/apps/catalog/image_processing.py` (pre-smoothing before edge/GrabCut detection and guarding against glare-patch false crops); verify with `pytest backend/tests/test_image_processing.py` covering textured mat, dark slab, and padded coin-rim cases.
- [x] 1.2 Implement automatic small-angle deskew (`1.0°–15.0°`) for tilted rectangular subjects (slabs, notes, proof sets, flips) in `process_item_image` before computing the final padded crop box; verify with unit tests in `backend/tests/test_image_processing.py` confirming tilted rectangles are straightened without clipping corners and circular coins are not falsely rotated.
- [x] 1.3 Extend `analyze_image_quality_and_forensics` in `backend/apps/catalog/image_processing.py` to detect localized specular glare over the central subject region and clipped subject edges, returning non-blocking warnings; verify with unit tests in `backend/tests/test_image_verification.py`.

## 2. Client-Side Auto-Crop & Capture/Upload Warnings

- [x] 2.1 Update `AUTO_CROP_DEFAULTS.paddingRatio` to `0.06` and add lightweight spatial smoothing before border k-means/edge scoring in `frontend/src/lib/autoCrop.ts` so patterned carbon-fiber mats and dark slabs isolate reliably; verify with `npm test -- autoCrop.test.ts` (including new textured-mat and 6% padding assertions).
- [x] 2.2 Surface `subject_clipped` framing hints and localized specular glare warnings on staged/captured photos in `frontend/src/pages/ScanAddPage.tsx` (reusing `cameraMetrics.ts` glare scoring for staged files) without blocking user override; verify with `npm test -- autoCropIntake.test.tsx`.

## 3. Existing Collection Photo Backfill Command

- [x] 3.1 Create Django management command `backend/apps/catalog/management/commands/recrop_collection_photos.py` supporting `--dry-run`, `--workspace`, `--item-id`, `--backup-dir`, and `--limit` to idempotently deskew and re-crop existing `ItemPhoto` assets with 6% padding and update `width`/`height`; verify with unit/integration tests in `backend/tests/test_recrop_command.py` covering dry-run, backup creation, idempotency, and skipping already-tight/low-confidence photos.

## 4. End-to-End Verification

- [x] 4.1 Run full backend (`pytest`) and frontend (`npm test` and `npm run build`) checks to confirm all image processing, intake, and collection grid behaviors pass with zero regressions.

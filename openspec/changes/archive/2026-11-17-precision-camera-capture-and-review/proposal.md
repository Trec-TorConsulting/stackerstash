# Proposal

## Why

On `https://stackerstash.com/items/374be31f-4ce5-4444-a723-f6106cc90c1d`, the Front (Obverse) image is off. A deep dive into the current capture pipeline (`GuidedCameraModal.tsx`, `cameraMetrics.ts`, `imageUtils.ts`, `ScanAddPage.tsx`) shows why: the viewfinder displays an `aspect-[4/3]` `object-cover` preview of a `1920×1080` stream, while `ImageCapture.takePhoto()` / burst capture saves the entire uncropped sensor frame without reticle cropping, without explicit EXIF `imageOrientation: 'from-image'` handling on all paths, and without an interactive Front/Back review, crop, or rotate step before submission.

## What Changes

- **High-Resolution WYSIWYG Camera Capture**:
  - Request 4:3 high-resolution sensor streams (`width: { ideal: 4032 }, height: { ideal: 3024 }`) to match the 4:3 viewfinder and modern `ImageCapture.takePhoto()` support (including iOS Safari 18.4+ and Android Chrome).
  - Compute exact visible-viewport-to-sensor mapping so software zoom and reticle framing match what the user sees in the viewfinder (WYSIWYG), rather than capturing unaligned outer margins.
  - Enforce `createImageBitmap(source, { imageOrientation: 'from-image' })` across `normalizePhotoBlob`, `normalizeImageFileForUpload`, and native camera (`capture="environment"`) / file-upload paths, and apply normalization before `api.uploadPhoto()` as well as `api.identifyImages()`.
- **Numismatic Quality Gates, Glare Detection & Auto-Capture**:
  - Upgrade `evaluateFrameMetrics` in `cameraMetrics.ts` to evaluate sharpness on the reticle region, detect specular glare clusters (`luma > 240`), and expose a toggleable **Auto-Capture** mode that triggers when sharpness, exposure, stability, and glare gates stay green.
  - Wire hardware `zoom`, `torch` (with glare warning), and `continuous` `focusMode` safely via `track.getCapabilities()` feature detection, and use `recommendedZoom` or clear framing prompts instead of ignoring it.
- **Interactive Front & Back Review, Crop & Rotate**:
  - Add an interactive review step after capturing Front (and Back) using `react-easy-crop` (mobile pinch-to-zoom, pan, aspect presets for Coin 1:1 / Note 2:1 / Slab 3:4 / Free, and 90° rotate) before advancing or completing, plus a per-photo **Crop / Rotate / Retake** action on `ScanAddPage.tsx`.

## Capabilities

### Modified Capabilities
- `vision-identification`: Enhance `Camera and photo upload intake` with WYSIWYG reticle-aligned high-resolution capture, EXIF orientation normalization, glare/stability/auto-capture guidance, and interactive Front/Back crop and rotation review prior to AI identification and upload.

## Impact

- **Frontend Dependencies**: Add `react-easy-crop` to `frontend/package.json`.
- **Frontend Modules**: `frontend/src/components/GuidedCameraModal.tsx`, `frontend/src/lib/cameraMetrics.ts`, `frontend/src/lib/imageUtils.ts`, `frontend/src/pages/ScanAddPage.tsx`, and new/updated crop-review UI component.
- **Tests**: `frontend/src/__tests__/cameraMetrics.test.ts`, `frontend/src/__tests__/intake.test.tsx`.
- **Backend**: No breaking API changes; cleaner, upright, tightly framed client captures reduce reliance on aggressive server-side GrabCut guessing.

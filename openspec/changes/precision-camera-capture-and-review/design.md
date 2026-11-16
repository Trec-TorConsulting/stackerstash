# Design

## Context

See `proposal.md` for motivation. Currently, `GuidedCameraModal.tsx` displays an `aspect-[4/3]` `object-cover` `<video>` preview of a `1920×1080` stream, runs `evaluateFrameMetrics` on the full `160×120` downsampled frame (ignoring `recommendedZoom`), and captures either via `ImageCapture.takePhoto()` or a 5-frame burst without cropping to the visible viewport/reticle, without explicit EXIF `imageOrientation: 'from-image'` guarantees, and without a Front/Back review, crop, or rotate step. `ScanAddPage.tsx` only calls `normalizeImageFileForUpload()` before `identifyImages()`, not before `uploadPhoto()`.

## Goals / Non-Goals

**Goals:**
- Deliver WYSIWYG framing between the live viewfinder/reticle and the captured image.
- Capture high-resolution upright images on modern iOS Safari (18.4+), Android Chrome, and desktop browsers, with graceful burst/canvas fallbacks.
- Detect specular glare on reflective coins/slabs and support optional steady+sharp Auto-Capture.
- Provide a mobile-friendly interactive Crop, Zoom & 90° Rotate review step for Front and Back before identification and upload.

**Non-Goals:**
- Replacing backend OpenCV segmentation in `backend/apps/catalog/image_processing.py` or bundling `opencv.js` WebAssembly in the frontend.
- Changing Vision AI provider routing, appraisal formulas, or backend database schemas.

## Decisions

### 1. High-Resolution 4:3 Stream + WYSIWYG Viewport-to-Sensor Mapping
- **Decision**: Request `width: { ideal: 4032 }, height: { ideal: 3024 }` with `facingMode: { ideal: 'environment' }` in `getUserMedia`. Map the visible `object-cover` 4:3 viewport (plus active software zoom) onto the decoded `ImageBitmap` dimensions when normalizing the capture, rather than saving unaligned outer sensor margins.
- **Rationale**: Matches the `aspect-[4/3]` viewfinder, maximizes sensor pixel density for `ImageCapture.takePhoto()` (including iOS Safari 18.4+), and eliminates the framing drift between what the user sees and what gets saved.
- **Alternatives considered**: Switching the viewfinder to 16:9. Rejected because coins, slabs, and banknotes fit 4:3 with less wasted background.

### 2. EXIF Orientation Normalization Across All Intake Paths
- **Decision**: Explicitly pass `{ imageOrientation: 'from-image' }` to `createImageBitmap()` in `normalizePhotoBlob()` and `normalizeImageFileForUpload()`. Route `handleNativeFallback` (`capture="environment"`) through normalization + crop/rotate review, and normalize files in `ScanAddPage.tsx` before `api.uploadPhoto()` as well as `api.identifyImages()`.
- **Rationale**: Prevents sideways/upside-down mobile captures and ensures `uploadPhoto()` never receives unrotated raw camera files.

### 3. Center-Weighted Quality Gates, Glare Detection & Auto-Capture
- **Decision**: Scope `evaluateFrameMetrics()` sharpness, luma, and new glare detection (`reticleGlareRatio`: fraction of reticle pixels with `luma > 240`) to the inner reticle region. Add an optional **Auto-Capture** mode that triggers capture after 3 consecutive steady, sharp, glare-free evaluation ticks (~660ms). Expose `torch` toggle and `zoom` slider safely via `track.getCapabilities()`, and surface `recommendedZoom` as a framing prompt/action.
- **Rationale**: Eliminates shutter-tap motion blur on mobile and catches reflective hotspots on proof coins/slabs before capture.

### 4. Interactive Front & Back Crop/Rotate Review (`react-easy-crop`)
- **Decision**: Add `react-easy-crop` and introduce a `PhotoCropRotateView` (used inside `GuidedCameraModal` as a `review-front` / `review-back` step, and reusable from `ScanAddPage.tsx` draft thumbnails). Provide aspect presets (`1:1` Coin, `4:3` Slab/Standard, `2:1` Note/Bar) and 90° rotation buttons, rendering the confirmed crop via offscreen canvas with `imageOrientation: 'from-image'`.
- **Rationale**: `react-easy-crop` provides native mobile pinch-to-zoom, pan, and built-in rotation, unlike corner-handle croppers (`react-image-crop`). Wrapping `<Cropper>` in a `relative h-[340px] sm:h-[420px]` container avoids flex-modal collapse.

## Risks / Trade-offs

- **Sensor aspect ratio differs from `<video>` preview on some devices** → Mapping via aspect-ratio `object-cover` math + immediate interactive review lets the user adjust framing if needed.
- **Auto-capture triggers while user is still adjusting** → Requiring 3 consecutive green ticks and landing on the Review/Retake screen makes false triggers harmless and immediately reversible.
- **Added dependency (`react-easy-crop`)** → Lightweight (~15KB gzipped) and isolated to the crop/review component.

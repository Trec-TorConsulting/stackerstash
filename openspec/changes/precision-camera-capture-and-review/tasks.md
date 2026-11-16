# Tasks

## 1. Dependencies & EXIF/Image Utilities

- [x] 1.1 Install `react-easy-crop` in `frontend/package.json` and verify `npm install` and TypeScript type resolution succeed.
- [x] 1.2 Update `frontend/src/lib/imageUtils.ts` to decode with `{ imageOrientation: 'from-image' }`, add a canvas crop+rotate export helper (`renderCroppedRotatedImage`), and verify with unit tests in `frontend/src/__tests__/intake.test.tsx` or a dedicated imageUtils test.

## 2. Numismatic Frame Metrics & Glare Detection

- [x] 2.1 Upgrade `evaluateFrameMetrics` in `frontend/src/lib/cameraMetrics.ts` to weight sharpness/exposure on the inner reticle region and detect specular glare clusters (`luma > 240`), returning `glareRatio` and `hasGlare` alongside `recommendedZoom`.
- [x] 2.2 Update `frontend/src/__tests__/cameraMetrics.test.ts` to cover glare detection, reticle-scoped sharpness, and `recommendedZoom`, and verify `npm test -- cameraMetrics` passes.

## 3. High-Res WYSIWYG Capture, Auto-Capture & Crop/Rotate Review

- [x] 3.1 Create `frontend/src/components/PhotoCropRotateView.tsx` using `react-easy-crop` with `1:1` (Coin), `4:3` (Slab/Standard), and `2:1` (Note/Bar) aspect presets, 90° rotate controls, and Confirm/Retake actions; verify it renders cleanly in a `relative` sized container on mobile and desktop viewports.
- [x] 3.2 Upgrade `frontend/src/components/GuidedCameraModal.tsx` to request 4:3 high-res streams (`4032×3024` ideal), compute exact `object-cover` WYSIWYG sensor-to-viewport crops in `normalizePhotoBlob` and `captureBestBurstFrame`, support safe `getCapabilities()` `torch` and `recommendedZoom` prompts, add optional Auto-Capture (3 consecutive green ticks), and route Front, Back, and Native Camera fallback captures through `PhotoCropRotateView`.
- [x] 3.3 Update `frontend/src/pages/ScanAddPage.tsx` to add per-thumbnail Crop/Rotate/Retake actions using `PhotoCropRotateView` and ensure `normalizeImageFileForUpload` runs before `api.uploadPhoto()` as well as `api.identifyImages()`.
- [x] 3.4 Expand `frontend/src/__tests__/intake.test.tsx` to test Front-to-Review-to-Back flow, Auto-Capture toggle, glare warning state, and native fallback normalization, and verify `npm test` passes.

## 4. Verification & Validation

- [x] 4.1 Run `openspec validate precision-camera-capture-and-review --strict`, `npm test`, and `npm run build` in `frontend/`, confirming zero errors.

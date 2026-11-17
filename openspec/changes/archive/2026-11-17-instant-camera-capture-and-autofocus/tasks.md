# Tasks

## 1. Frame Metrics & Sharpness Scoring

- [x] 1.1 Update `evaluateFrameMetrics` in `frontend/src/lib/cameraMetrics.ts` to make stability advisory (removing the `"Hold steady — stabilizing"` blocker) and export a lightweight `computeSharpnessScore(luma, width, height)` helper for burst frame ranking; verify with unit tests in `frontend/src/__tests__/cameraMetrics.test.ts` that sharpness scoring ranks crisp edges higher than blurred buffers and quality pills remain advisory.

## 2. Guided Camera Capture Upgrade

- [x] 2.1 Apply continuous autofocus (`focusMode: 'continuous'`) in `frontend/src/components/GuidedCameraModal.tsx` when `track.getCapabilities().focusMode` supports it (tracking hardware zoom capability to avoid double-zooming); verify via Vitest component tests mocking `getCapabilities`/`applyConstraints` and graceful handling when unsupported.
- [x] 2.2 Implement hybrid capture in `GuidedCameraModal.tsx`: use `ImageCapture(videoTrack).takePhoto()` when available (normalizing to max `1600px` JPEG with software zoom crop only when hardware zoom is unavailable), and fall back to a 5-frame burst (`~50ms` interval) selecting the highest-sharpness frame when `ImageCapture` is unavailable or fails; verify both `takePhoto` and burst fallback paths with Vitest tests in `frontend/src/__tests__/intake.test.tsx`.
- [x] 2.3 Keep the native OS camera `<input type="file" accept="image/*" capture="environment">` accessible on both `front` and `back` steps in `GuidedCameraModal.tsx` and ensure the Capture button is never blocked by stability checks; verify in `frontend/src/__tests__/intake.test.tsx` that native capture works on both steps and `npm run build` (`tsc -b && vite build`) passes cleanly.


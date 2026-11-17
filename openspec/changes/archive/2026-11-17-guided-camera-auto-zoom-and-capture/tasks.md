# Tasks

## 1. Frame Metrics & Auto-Zoom / Stability Logic

- [x] 1.1 Create `frontend/src/lib/cameraMetrics.ts` with pure, unit-tested helpers (`evaluateFrameMetrics`) computing `meanLuma`, `meanEdge`, `meanFrameDiff` (frame-to-frame stability), quality tone/label, and `recommendedZoomStep` from `160x120` grayscale buffers; verify with unit tests in `frontend/src/__tests__/intake.test.tsx`.

## 2. GuidedCameraModal Auto-Capture & Auto-Zoom UX

- [x] 2.1 Integrate `evaluateFrameMetrics` into `frontend/src/components/GuidedCameraModal.tsx` with `autoCapture` (default `true`) and `autoZoom` (default `true`) toggles, `3`-frame steady lock-on countdown indicator, `1.5s` front-to-back flip cooldown, and immediate `autoZoom` yield when the user drags the manual zoom slider.
- [x] 2.2 Add tests in `frontend/src/__tests__/intake.test.tsx` verifying Auto-Capture & Auto-Zoom toggles, manual zoom override disabling Auto-Zoom, and `npm test -- --run` + `npm run build` passing cleanly.

## Workflow follow-up

- Review the generated artifacts, implement via `/opsx-apply`, and archive the change once verified.


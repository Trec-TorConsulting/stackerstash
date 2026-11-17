# Tasks

## 1. Subject Detection & Frame Metrics Robustness

- [x] 1.1 Update `detectSubjectBox` in `frontend/src/lib/cameraMetrics.ts` to use median/trimmed border background statistics (clamping outlier edge spread) and center-weighted saliency so uneven edge shadows or fingers do not hide centered collectibles; verify with `cameraMetrics.test.ts` including a noisy/shadowed border test case.
- [x] 1.2 Tune `GLARE_RATIO_THRESHOLD` (0.18) and `isSteady` (`meanFrameDiff < 18`) in `frontend/src/lib/cameraMetrics.ts` for shiny collectibles handheld in real lighting; verify with unit tests in `frontend/src/__tests__/cameraMetrics.test.ts`.

## 2. Live Tracking Overlay & Auto-Snap Reliability

- [x] 2.1 Persist `prevSubjectBoxRef` in `frontend/src/components/GuidedCameraModal.tsx` and pass it to `evaluateFrameMetrics` so `smoothSubjectBox` and `boxMoved` function across ticks; verify via `intake.test.tsx`.
- [x] 2.2 Render a live smoothed subject bounding-box overlay (`data-testid="live-subject-box"`) inside the viewfinder in `frontend/src/components/GuidedCameraModal.tsx` showing tracking vs. locked state; verify via component tests in `frontend/src/__tests__/intake.test.tsx`.
- [x] 2.3 Default `autoCapture` to `true` in `auto` mode and add a 1-tick grace step (`Math.max(0, steadyTicksRef.current - 1)`) with `AUTO_CAPTURE_TICKS = 4` so single-frame flicker does not reset lock progress; verify all frontend tests (`npm test`) and build (`npm run build`) pass.

## Workflow follow-up

- Branch, commit, push, open PR, and merge to `main`.
- Deploy updated image/chart to HomeLab K3S cluster (`stackerstash` namespace).
- Archive the OpenSpec change after verification.

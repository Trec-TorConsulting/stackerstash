# Design

## Context

See `proposal.md` for motivation. `GuidedCameraModal.tsx` already runs a 200ms evaluation loop over a 160x120 sample canvas using `evaluateFrameMetrics()` in `cameraMetrics.ts`, but `prevSubjectBox` is passed as `null`, `subjectBox` is not rendered in the UI, `autoCapture` defaults to `false`, and `detectSubjectBox()` / Auto-Snap gates are brittle on real-world surfaces and shiny metals.

## Goals / Non-Goals

**Goals:**
- Make live item placement detection visibly responsive and accurate in `GuidedCameraModal`.
- Make Auto-Snap reliably trigger when holding a coin, bar, slab, or note steady.
- Keep CPU cost negligible on mobile devices (160x120 sampling at 200ms).

**Non-Goals:**
- Adding a heavy ML/WebGL object detection model (e.g., TensorFlow.js / ONNX) to the client bundle.
- Changing backend image processing or vision OCR pipelines.

## Decisions

1. **Persist `prevSubjectBoxRef` in `GuidedCameraModal.tsx`**:
   - Pass `prevSubjectBoxRef.current` into `evaluateFrameMetrics()` and update it with `metrics.subjectBox` each tick.
   - Rationale: Enables existing `smoothSubjectBox` EMA smoothing and `boxMoved` steadiness checks without any new dependencies.
2. **Render live `subjectBox` overlay in viewfinder**:
   - Store `subjectBox` in component state (or cleared when `null`) and render a lightweight positioned `div` inside the viewfinder container using percentage coordinates (`left`, `top`, `width`, `height`), colored emerald when `framingState === 'locked'` and amber/sky otherwise.
   - Alternative considered: Canvas-drawn overlay — rejected because CSS-positioned `div` with `transition-all duration-150` is simpler, accessible, and easy to test in Vitest/Testing Library.
3. **Robust `detectSubjectBox` background modeling & center-weighted saliency**:
   - Use trimmed/lower-spread border statistics (clamping extreme border outlier spread) and apply a gentle center-proximity bias when thresholding so an edge shadow or finger does not drown out a centered coin/slab.
4. **Tuned Auto-Snap thresholds & 1-tick grace window**:
   - Raise `GLARE_RATIO_THRESHOLD` slightly (e.g. `0.12` -> `0.18`) and `meanFrameDiff` steadiness ceiling (`14` -> `18`) so handheld phones shooting shiny silver/slabs can lock.
   - Use `AUTO_CAPTURE_TICKS = 4` (800ms) and decrement `steadyTicksRef` by 1 (instead of resetting to 0) on a single missed tick.
   - Default `autoCapture` to `true` when `initialShape === 'auto'` (users can still toggle it off via the existing Auto-Snap button).

## Risks / Trade-offs

- [Auto-Snap firing slightly too early on a moving hand] → Mitigation: Keep `AUTO_CAPTURE_TICKS = 4` (800ms) and still require `framingState === 'locked'` and `isSteady`.
- [Defaulting `autoCapture` to `true` could surprise existing unit tests in `intake.test.tsx`] → Mitigation: Inspect and update `intake.test.tsx` expectations if needed and run the full frontend test suite.

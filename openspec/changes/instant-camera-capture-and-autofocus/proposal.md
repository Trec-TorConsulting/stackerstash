# Proposal

## Why

The current in-app camera capture (`GuidedCameraModal`) grabs single frames from a live `<video>` stream via `canvas.drawImage` and continuously prompts users with `"Hold steady — stabilizing"` when frame-to-frame motion is detected. This forces users—especially on mobile devices—to hold completely still for an extended time and still produces lower-resolution, motion-prone video snapshots instead of full-resolution hardware still photos.

## What Changes

- Upgrade `GuidedCameraModal` to use the MediaStream `ImageCapture.takePhoto()` API when supported (Chromium/Android/Desktop) so capturing triggers the device's full-resolution hardware shutter, autofocus, and stabilization pipeline instead of grabbing a 1080p video frame.
- Enable continuous hardware autofocus (`focusMode: 'continuous'`) on the active `MediaStreamTrack` whenever supported by `track.getCapabilities()`.
- Replace single-frame `<canvas>` snapshots on unsupported browsers (such as iOS Safari) with an instant short-burst capture (4–6 frames over ~250ms) that automatically selects and normalizes the sharpest frame (highest edge/sharpness score), eliminating the need for the user to freeze before tapping Capture.
- Make live frame-quality pills purely advisory (light/glare/framing hints) without implying the user is blocked from capturing, and allow native OS camera capture (`<input type="file" accept="image/*" capture="environment">`) for both front and back steps as a first-class, zero-wait mobile option.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `vision-identification`: Enhance camera capture requirements to support hardware still capture (`ImageCapture.takePhoto()`), continuous autofocus constraints, instant burst best-frame selection fallback, and non-blocking advisory framing feedback with front/back native camera support.

## Impact

- Frontend components & utilities: `frontend/src/components/GuidedCameraModal.tsx`, `frontend/src/lib/cameraMetrics.ts`
- Frontend tests: `frontend/src/__tests__/intake.test.tsx` (and/or unit tests for burst best-frame selection and `ImageCapture` fallback)
- No backend API, database, or dependency changes required (uses standard browser Web APIs with graceful fallback).


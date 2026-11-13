# Design

## Context

`GuidedCameraModal.tsx` currently initializes a `1920x1080` `getUserMedia` video stream, polls `evaluateFrameMetrics()` in `cameraMetrics.ts` every `220ms` (requiring `meanFrameDiff < 11.5` and `meanEdge >= 7.5`), and snapshots a single frame via `canvas.drawImage(video, ...)` on Capture. See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Deliver crisp, full-resolution still photos on supported browsers via `ImageCapture.takePhoto()` + `focusMode: 'continuous'`.
- Eliminate the "hold completely still" wait on iOS Safari and other non-`ImageCapture` browsers by capturing a fast burst (5 frames over ~250ms) and picking the sharpest frame automatically.
- Preserve existing crop/zoom behavior, 1600px max-dimension JPEG normalization, front/back step flow, and zero new runtime npm dependencies.
- Expose the native OS camera `<input type="file" capture="environment">` on both front and back steps for users who prefer their device's native HDR/OIS camera pipeline.

**Non-Goals:**
- Adding heavy WebAssembly computer-vision libraries (e.g., OpenCV.js / `jscanify`) for coin/note edge deskewing.
- Replacing the backend vision/OCR pipeline or changing API contracts.

## Decisions

1. **Hybrid Capture Strategy (`ImageCapture.takePhoto()` → Burst Best-Frame Fallback):**
   - *Choice:* Check `'ImageCapture' in window` and `typeof ImageCapture === 'function'` when capturing. Call `new ImageCapture(videoTrack).takePhoto()` first; if unsupported or if `takePhoto()` rejects, fall back to a 5-frame burst (`~50ms` apart via `requestAnimationFrame` / short timer) scored by `computeSharpnessScore()` on the center crop.
   - *Rationale:* `takePhoto()` engages the hardware shutter, full sensor resolution, and OS OIS/autofocus on Chromium/Android/Desktop without any third-party library. The burst fallback solves iOS Safari's lack of `ImageCapture` without forcing users to freeze before pressing Capture.
   - *Alternatives considered:* `react-camera-pro` / `react-webcam-pro` (adds styled-components/package overhead while still hitting the same iOS WebKit `getUserMedia` limitations); native `<input capture>` only (loses live coin/note reticle guidance and multi-step flow).

2. **Continuous Autofocus Constraint:**
   - *Choice:* Immediately after `getUserMedia` resolves, inspect `track.getCapabilities()`. If `focusMode` includes `'continuous'`, apply `track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] })` inside a `try/catch` / `.catch(() => {})`.
   - *Rationale:* Prevents soft focus on close-up coin/banknote shots on Android/UVC cameras while remaining safe on browsers (iOS Safari) that do not expose `focusMode`.

3. **Purely Advisory Live Quality Pill:**
   - *Choice:* Update `evaluateFrameMetrics()` in `cameraMetrics.ts` so it focuses on exposure (`meanLuma < 45` / `> 238`) and framing/sharpness hints without blocking Capture or nagging `"Hold steady — stabilizing"` on minor hand movement.
   - *Rationale:* With `takePhoto()` hardware OIS and burst best-frame selection, minor hand movement no longer ruins the shot.

4. **Zoom Normalization on `takePhoto()` Blob:**
   - *Choice:* Decode the `Blob` returned by `takePhoto()` via `createImageBitmap(blob)` (with `Image` fallback), apply the same center-crop for `zoom > 1`, and downscale to `maxDim = 1600` onto an offscreen canvas before exporting `image/jpeg` at `0.94` quality.
   - *Rationale:* Keeps upload sizes fast for Vision AI/OCR while preserving hardware optical sharpness and honoring the user's digital zoom setting.

## Risks / Trade-offs

- **Digital zoom on `takePhoto()` vs hardware zoom:** When hardware `caps.zoom` is supported, `applyConstraints` already zooms optically/natively on the sensor; applying software crop *again* would double-zoom. → **Mitigation:** Track whether hardware zoom was applied (`hardwareZoomSupported` ref) and only apply software center-crop when hardware zoom is unavailable.
- **Burst capture latency on low-end devices:** Capturing 5 full-resolution frames to canvases could take >300ms on older phones. → **Mitigation:** Score frames on a small `160x120` sample buffer (already fast) and only encode the winning frame to `1600px` JPEG, keeping memory and CPU minimal.


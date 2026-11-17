# Design

## Context

See `proposal.md` for motivation. `frontend/src/components/GuidedCameraModal.tsx` currently runs a `450ms` interval sampling a `160x120` offscreen canvas to compute `meanLuma` and `meanEdge`, and applies `zoom` via both `MediaTrackCapabilities.zoom` (when supported) and reticle-centered canvas cropping on `captureCurrentFrame()`.

## Goals / Non-Goals

**Goals:**
- Make mobile and desktop camera capture effortless and hands-free when lighting and framing are good.
- Prevent blurry mid-motion captures by requiring frame-to-frame stability in addition to sharpness and exposure.
- Keep all controls intuitive and non-intrusive: clear status pills, a smooth lock-on progress ring/bar, simple toggles, and instant manual override.

**Non-Goals:**
- Running heavy ML/YOLO bounding-box models in the browser (lightweight canvas pixel metrics keep battery usage low and frame analysis instant on mobile).
- Auto-capturing during native `<input capture="environment">` fallback (which delegates to the OS camera app).

## Decisions

1. **Frame-Stability + Quality Lock-On for Auto-Capture**
   - Store the previous `160x120` grayscale luma buffer in a `useRef<Float32Array | null>`.
   - Compute `meanFrameDiff = avg(|luma[i] - prevLuma[i]|)` on each 450ms tick.
   - A frame counts toward lock-on only when:
     - Exposure is good (`50 <= meanLuma <= 235`),
     - Sharpness is good (`meanEdge >= 10`), and
     - Hand/subject is steady (`meanFrameDiff < 6.0`).
   - Require `3` consecutive good+steady ticks (~1.35s) to trigger `captureCurrentFrame()`. Expose `lockProgress` (`0..3`) in the UI so the user sees `"Hold steady… (1/3 -> 3/3)"` and knows it is about to snap.
   - Reset `lockProgress` and apply a `1500ms` cooldown (`cooldownUntilRef`) after Step 1 captures so the user has time to flip the coin/note for Step 2.

2. **Center-vs-Outer Edge Ratio for Smart Auto-Zoom**
   - On the same `160x120` sample, compare edge energy in the **inner 35% center box** vs. the **outer reticle ring** (and outer frame).
   - If the inner center has strong detail (`innerEdge > 12`) while the outer ring is relatively flat (`innerEdge / (ringEdge + 1) > 1.8`) and `zoom < 2.0`, step `zoom` up by `+0.25` (max `2.0x`, throttled to at most once per 900ms so it doesn't oscillate).
   - *Trade-off*: Textured backgrounds (e.g., wood grain) have high `ringEdge`, in which case Auto-Zoom stays at `1.0x` instead of falsely zooming in. Users can always adjust the manual zoom slider, which immediately sets `autoZoom = false`.

3. **Pure Helper Functions for Testability**
   - Extract `evaluateFrameMetrics(luma, prevLuma, width, height)` into a pure exported helper (in `GuidedCameraModal.tsx` or `frontend/src/lib/cameraMetrics.ts`) so Vitest unit tests can deterministically test exposure, sharpness, stability, lock-on, and auto-zoom recommendations without needing a physical webcam.

## Risks / Trade-offs

- **iOS Safari lacks `capabilities.zoom` on `getUserMedia`**: Hardware optical zoom won't engage on iOS PWAs, so `captureCurrentFrame()` uses the existing reticle-centered canvas crop (`cropW = vw / zoom`). Still produces a tight, well-framed image for AI/OCR.
- **Accidental early capture**: Mitigated by requiring 3 consecutive steady frames + 1.5s flip cooldown + one-tap `Auto-Capture` toggle.


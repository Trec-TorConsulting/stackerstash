# Design

## Context

See `proposal.md` for motivation and `specs/vision-identification/spec.md` for behavioral requirements. Currently, `GuidedCameraModal.tsx` samples a `160×120` luma buffer every `220ms`, runs `evaluateFrameMetrics()` on a fixed center box (`0.325`–`0.675`), defaults `autoCapture` to `false`, and forces the user to manually switch between `Coin (Circle)` and `Note / Bar (Rect)` stencils.

## Goals / Non-Goals

**Goals:**
- Detect foreground collectibles (coins, rounds, bars, slabs, paper currency, Goldbacks) in real time (`< 3ms` per frame on `160×120` buffers) with zero external ML/WASM downloads.
- Dynamically adapt the on-screen reticle position, size, and shape (`coin`, `slab`, `note`) around the detected item in `Auto-Detect` mode without upfront item-type selection.
- Default `Auto-Capture` to `true` with strict subject-lock quality gates (subject detected, centered, unclipped, sufficiently sized, sharp, glare-free, and steady), visual lock-on progress, shutter flash, and haptic feedback.
- Use the detected subject bounding box and shape class to guide high-resolution capture cropping and pre-select the matching aspect ratio in `PhotoCropRotateView`.

**Non-Goals:**
- Bundling heavy multi-megabyte WebGL/WASM object detection weights that slow down PWA cold start or fail offline.
- Removing manual shutter capture or manual stencil overrides (`Coin`, `Slab / Bar`, `Note / Goldback`) for users who want explicit control.

## Decisions

### 1. Zero-Dependency Foreground Saliency & Contour Bounding Box (`detectSubjectBox`)
- **Decision**: Extend `cameraMetrics.ts` with `detectSubjectBox(luma, width, height, rgbaData?)`:
  1. Model the background from the outer 6% border ring (median luma/RGB chroma and 75th-percentile spread) plus border gradient baseline.
  2. Score each interior pixel `(col, row)` using combined color/luma contrast against the border background and local gradient magnitude (`gx + gy`).
  3. Compute the foreground centroid and robust 6th–94th percentile bounding box (`x, y, width, height` normalized to `0..1`), rejecting noise when foreground coverage is `< 3.5%` or `> 92%` of the frame.
  4. Classify shape (`'coin' | 'slab' | 'note'`) using the aspect ratio in physical viewfinder coordinates (`(box.width * VIEWFINDER_ASPECT) / box.height`) combined with corner-vs-center radial circularity.
- **Rationale**: Pure typed-array math runs in `< 2ms` on mobile CPUs, works deterministically in Vitest/JSDOM unit tests, and handles metallic coins, polymer/gold foil Goldbacks, paper notes, and acrylic slabs alike.
- **Alternatives considered**: Fetching a TensorFlow.js / MediaPipe WASM model from CDN. Rejected because it adds 5–12 MB network overhead, breaks strict offline air-gapped PWA operation, and cannot be deterministically tested in JSDOM.

### 2. Temporal EMA Bounding-Box Smoothing & Framing State Machine
- **Decision**: Add `smoothSubjectBox(prevBox, nextBox, alpha = 0.45)` so the live reticle glides smoothly and resists single-frame flicker. Evaluate a five-state framing gate (`'none' | 'too_small' | 'edge_clipped' | 'off_center' | 'locked'`) before evaluating sharpness (`innerEdge`), glare (`glareRatio`), and stability (`isSteady` requiring both low pixel delta and stable bounding-box center).
- **Rationale**: Prevents false auto-snaps on empty tables, tiny distant coins, or items cut off at the frame edge.

### 3. Dynamic Viewfinder Reticle & Default Auto-Snap With Lock-On Progress
- **Decision**: In `GuidedCameraModal.tsx`:
  - Replace the binary `circle | rect` state with `reticleMode: 'auto' | 'coin' | 'slab' | 'note'` (defaulting to `'auto'`).
  - Default `autoCapture` to `true` and sample frames every `180ms`.
  - Render a smoothly positioned reticle overlay matching the smoothed `subjectBox` when in `'auto'` mode, displaying a live detected-type badge (`Coin / Round`, `Slab / Bar`, `Note / Goldback`) and an emerald lock-on progress bar/ring (`steadyTicks / AUTO_CAPTURE_TICKS`).
  - On auto-snap trigger, show a brief shutter flash overlay, invoke `navigator.vibrate?.(35)` when available, crop the high-res frame around the detected subject/shape, and open `PhotoCropRotateView` pre-configured with the detected preset (`'coin' | 'slab' | 'note'`).
- **Rationale**: Replicates CoinSnap's zero-click live detection and auto-snap feel while keeping the post-snap interactive crop/rotate review as a safety net.

## Risks / Trade-offs

- **Low-contrast surface (e.g., silver coin on grey metal desk)** → Saliency combines both RGB/luma distance *and* interior Sobel/gradient edge density so rim and relief edges still lock on even when surface luma matches the desk.
- **User wants manual framing without auto-snap** → Auto-Capture toggle remains 1-tap accessible in the camera HUD, and manual stencil pills (`Coin`, `Slab / Bar`, `Note / Goldback`) lock the reticle immediately.

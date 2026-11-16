# Proposal

## Why

Currently, `GuidedCameraModal` relies on a static center reticle (`Coin (Circle)` or `Note / Bar (Rect)`) that the user must manually toggle, and its frame quality evaluator checks a fixed inner square (`0.325`–`0.675`) without knowing whether an actual subject is present, what shape it has (round coin vs. vertical slab/bar vs. wide paper note/Goldback), or where its boundaries are. To deliver a CoinSnap-level, zero-click PWA capture experience ("Approach A"), the viewfinder needs real-time client-side subject detection, a dynamic bounding-box reticle that automatically adapts to any collectible shape without preselection, and default-enabled Auto-Snap with visual lock-on progress and bounding-box-aware high-resolution cropping.

## What Changes

- **Real-Time Client-Side Subject & Shape Detection (`cameraMetrics.ts`)**:
  - Implement a fast (`< 3ms` per frame on `160×120` RGBA/luma samples) border-background color/luma + gradient saliency detector (`detectSubjectBox`) with temporal Exponential Moving Average (`smoothSubjectBox`) smoothing.
  - Automatically classify the live subject's geometry into `'coin'` (1:1 circular/compact round), `'slab'` (vertical/compact rectangular graded slab, assay card, or bar), or `'note'` (wide rectangular paper currency, Goldback, or horizontal bar) without requiring upfront type preselection.
  - Evaluate sharpness (`innerEdge`), specular glare (`glareRatio`), exposure, and framing state (`'none' | 'too_small' | 'edge_clipped' | 'off_center' | 'locked'`) specifically within the detected subject bounding box.
- **Dynamic Adaptive Reticle & Default Auto-Snap (`GuidedCameraModal.tsx`)**:
  - Add `'auto'` (Auto-Detect) as the default reticle mode alongside optional manual stencil pills (`Auto-Detect`, `Coin (1:1)`, `Slab / Bar`, `Note / Goldback`).
  - Render a live dynamic reticle in `Auto-Detect` mode that smoothly tracks and morphs around the detected subject's bounding box (circular ring for coins, rounded rectangle for slabs/bars/notes) with a live shape badge (`Coin / Round Detected`, `Slab / Bar Detected`, `Note / Goldback Detected`) and a visual lock-on progress ring/bar.
  - Enable **Auto-Capture by default** (`autoCapture = true`), triggering high-resolution capture with shutter flash and haptic feedback (`navigator.vibrate`) once the subject is locked, sharp, steady, properly exposed, and glare-free across consecutive ticks.
- **Smart Bounding-Box Crop & Review Preset Handoff (`GuidedCameraModal.tsx`, `imageUtils.ts`, `PhotoCropRotateView.tsx`)**:
  - Crop high-resolution captures (`ImageCapture.takePhoto()` and burst fallback) around the detected subject bounding box (with protective padding) and automatically initialize `PhotoCropRotateView` to the detected preset (`'coin' | 'slab' | 'note'`).

## Capabilities

### New Capabilities

### Modified Capabilities
- `vision-identification`: Enhance `Camera and photo upload intake` with real-time client-side subject bounding-box and shape detection (`coin`, `slab`, `note`), a dynamic adaptive viewfinder reticle that requires no upfront item-type preselection, default-enabled CoinSnap-style Auto-Snap with lock-on progress, and automatic crop-preset handoff.

## Impact

- **Frontend Modules**: `frontend/src/lib/cameraMetrics.ts`, `frontend/src/lib/imageUtils.ts`, `frontend/src/components/GuidedCameraModal.tsx`, `frontend/src/components/PhotoCropRotateView.tsx`, `frontend/src/pages/ScanAddPage.tsx`.
- **Frontend Tests**: `frontend/src/__tests__/cameraMetrics.test.ts`, `frontend/src/__tests__/imageUtils.test.ts`, `frontend/src/__tests__/intake.test.tsx`.
- **External Dependencies**: Zero new runtime dependencies (pure TypeScript + typed arrays for instant startup and offline PWA support).

# Proposal

## Why

Live item placement detection and Auto-Snap in `GuidedCameraModal` fail to reliably lock onto coins, bars, slabs, and notes in real-world lighting, forcing users to press the shutter manually. Specifically, `GuidedCameraModal` passes `null` for `prevSubjectBox` (disabling EMA bounding-box smoothing and motion checks), does not render the live detected subject bounding box in the viewfinder, defaults Auto-Snap to off, and relies on an outer-border background model and strict glare/steadiness gates that drop out on textured surfaces or shiny metals.

## What Changes

- Render a live, smoothed subject bounding-box overlay inside the `GuidedCameraModal` viewfinder when a collectible is detected, with clear visual state (tracking vs. locked).
- Fix `GuidedCameraModal` to persist and pass `prevSubjectBox` across evaluation ticks so `smoothSubjectBox` and `boxMoved` work as intended.
- Improve `detectSubjectBox` in `cameraMetrics.ts` to use trimmed/median-robust border background estimation and center-weighted foreground saliency so uneven shadows or fingers at the frame edge do not mask the item.
- Tune `evaluateFrameMetrics` and the Auto-Snap loop in `GuidedCameraModal` for shiny collectibles (slightly more tolerant specular glare and steadiness thresholds, plus a 1-tick grace window before resetting lock progress) and default Auto-Snap to enabled in `auto` mode (or persist user preference).

## Capabilities

### New Capabilities
- `guided-camera-capture`: Live subject placement detection, smoothed bounding-box viewfinder feedback, and reliable Auto-Snap capture for coins, bars, slabs, and banknotes.

### Modified Capabilities
<!-- No existing spec requirements in openspec/specs/ are modified. -->

## Impact

- `frontend/src/lib/cameraMetrics.ts`: `detectSubjectBox`, `evaluateFrameMetrics`, and glare/steadiness thresholds.
- `frontend/src/components/GuidedCameraModal.tsx`: `prevSubjectBoxRef` tracking, live bounding-box overlay rendering, Auto-Snap grace window, and default/persisted Auto-Snap state.
- `frontend/src/__tests__/cameraMetrics.test.ts` and `frontend/src/__tests__/intake.test.tsx`: updated and new unit/component tests.

# Tasks

## 1. Real-Time Subject Bounding-Box & Shape Detection (`cameraMetrics.ts`)

- [x] 1.1 Implement `detectSubjectBox`, `smoothSubjectBox`, shape classification (`'coin' | 'slab' | 'note'`), and framing state evaluation (`'none' | 'too_small' | 'edge_clipped' | 'off_center' | 'locked'`) in `frontend/src/lib/cameraMetrics.ts`, scoping sharpness and glare metrics to the detected subject bounding box.
- [x] 1.2 Add unit tests in `frontend/src/__tests__/cameraMetrics.test.ts` covering round coin detection, wide banknote/Goldback detection, vertical slab/bar detection, empty-frame rejection, EMA smoothing, and framing state transitions, and verify `npm test -- cameraMetrics` passes in `frontend/`.

## 2. Subject-Aware High-Resolution Cropping (`imageUtils.ts`)

- [x] 2.1 Add `computeSubjectCropRect` in `frontend/src/lib/imageUtils.ts` to map a normalized viewfinder `SubjectBox` (with protective padding and shape-aware aspect ratio) onto full-resolution sensor dimensions, and add unit tests in `frontend/src/__tests__/imageUtils.test.ts` verifying `npm test -- imageUtils` passes.

## 3. Dynamic Viewfinder Reticle, Default Auto-Snap & Review Preset Handoff (`GuidedCameraModal.tsx`, `ScanAddPage.tsx`)

- [x] 3.1 Upgrade `frontend/src/components/GuidedCameraModal.tsx` with `reticleMode: 'auto' | 'coin' | 'slab' | 'note'` (defaulting to `'auto'`), live adaptive bounding-box reticle and detected-shape badge, default-enabled `autoCapture` with visual lock-on progress and shutter flash, subject-box-aware capture cropping, and automatic `initialPreset` (`'coin' | 'slab' | 'note'`) handoff to `PhotoCropRotateView` and `GuidedCameraResult`.
- [x] 3.2 Update `frontend/src/pages/ScanAddPage.tsx` to open `GuidedCameraModal` in Auto-Detect mode by default without requiring upfront category preselection, and expand `frontend/src/__tests__/intake.test.tsx` to verify live Auto-Detect reticle mode, default Auto-Capture lock-on snap, and detected preset handoff with `npm test -- intake`.

## 4. End-to-End Validation & Production Build

- [x] 4.1 Run `openspec validate live-object-detection-and-auto-snap --strict`, `npm test`, and `npm run build` in `frontend/`, confirming all checks pass with zero errors.

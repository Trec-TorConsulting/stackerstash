# Tasks: Fix Guided Coin Tracking and Trading Card Auto-Detection

## 1. Subject Detection & Coin Tracking Fixes

- [x] 1.1 In `frontend/src/lib/cameraMetrics.ts`, replace 1D projection cuts (`pickBestSpan`, `colCounts`, `rowCounts`) with 2D spatial clustering, morphological closing, and hole-filling to preserve circular coin geometry, verifying that coins with smooth or reflective centers are detected as unified circular entities.
- [x] 1.2 In `frontend/src/lib/cameraMetrics.ts`, implement border-margin rejection (filtering out components touching outer edges) and center-distance weighting to prevent holding fingers and margin shadows from pulling or locking the tracking box to the right side of the frame.
- [x] 1.3 Add test cases in `frontend/src/__tests__/cameraMetrics.test.ts` for coin detection with margin artifacts, flat interior fields, and centering lock-on, verifying with `npm test -- --run cameraMetrics`.

## 2. Viewfinder Geometry Alignment & First-Class Card Reticle

- [x] 2.1 In `frontend/src/lib/cameraMetrics.ts`, extend `DetectedShape` and `ReticleMode` to include `'card'`, update shape classification logic to distinguish standard 2.5:3.5 (5:7) card aspect ratios from slabs and notes, and add `'Trading Card'` to `SHAPE_LABELS`.
- [x] 2.2 In `frontend/src/components/GuidedCameraModal.tsx`, add a dedicated Trading Card reticle (rounded rect, approx 5:7 aspect ratio) and mode selector button ("Card").
- [x] 2.3 In `frontend/src/components/GuidedCameraModal.tsx`, synchronize offscreen analysis canvas sampling with the rendered container's active aspect ratio (`clientWidth / clientHeight`) to ensure overlay coordinates map 1:1 onto the visible video without lateral offset or right-side sticking.
- [x] 2.4 In `frontend/src/components/GuidedCameraModal.tsx`, add accessible exit options: an explicit "Cancel" button in the bottom controls row when `step === 'front'` (replacing the empty placeholder) and a global `Escape` key listener that calls `stopStream()` and `onClose()`.
- [x] 2.5 Update component tests in `frontend/src/__tests__/intake.test.tsx` and `frontend/src/__tests__/componentsCoverage.test.tsx` to verify Card reticle mode, card auto-detection, aligned tracking coordinates, bottom Cancel button dismissal, and `Escape` key closure, running `npm test -- --run intake`.

## 3. Scan & Add Intake & Backend OCR Card Heuristics

- [x] 3.1 In `frontend/src/pages/ScanAddPage.tsx`, fix the category check from `"TRADING_CARD"` to `"CARD"` for `initialShape = "card"`, and update `onComplete` in `GuidedCameraModal` to auto-set `category = "CARD"` when `detectedShape === "card"`.
- [x] 3.2 In `backend/apps/vision/ocr.py`, expand card pattern regexes in `parse_ocr_numismatic_hints` to identify card statistics ("HP", "ATK", "DEF", "1st Edition", "Rookie Card", "RC") and card publisher notices ("Nintendo", "Wizards", "Panini", "Topps", "Upper Deck", "Bowman", "Donruss"), setting `is_card = True` and `category = "CARD"`.
- [x] 3.3 Add unit test coverage in `backend/tests/test_ocr.py` for raw card OCR extraction without explicit franchise names, verifying with `pytest tests/test_ocr.py`.

## 4. End-to-End Verification & Quality Gate

- [x] 4.1 Run full frontend test suite (`npm test -- --run` in `frontend/`) and verify all tests pass.
- [x] 4.2 Run full backend test suite (`pytest` in `backend/`) and verify all tests pass.
- [x] 4.3 Verify production frontend build (`npm run build` in `frontend/`) completes with zero TypeScript or bundling errors.

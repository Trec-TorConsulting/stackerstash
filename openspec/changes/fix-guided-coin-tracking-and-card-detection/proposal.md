# Proposal: Fix Guided Coin Tracking and Trading Card Auto-Detection

## Why

During live guided camera intake, collectors attempting to scan coins report that the viewfinder "isn't seeing the coin" and the floating tracking box remains stuck on the right side of the screen rather than closing in on the centered coin. Additionally, in Auto-Detect mode, trading cards are not recognized as collectible cards—either misclassifying as slabs/bars or falling back to coin intake—preventing seamless camera intake for sports and TCG cards.

These issues stem from three root causes:
1. Viewfinder aspect-ratio mismatch between the responsive video viewport and the offscreen analysis canvas, which distorts normalized coordinates and displaces the tracking overlay toward the right margin.
2. 1D projection histogram thresholding in `cameraMetrics.ts`, where circular coins (which have hollow/smooth interior fields) get split into disjoint edge slivers while border shadows and fingers on the right side dominate column mass, pulling and gluing the tracker to the right.
3. Complete absence of a first-class `card` shape in `DetectedShape`/`ReticleMode`, coupled with a frontend category typo (`TRADING_CARD` instead of `CARD`) in `ScanAddPage.tsx` and narrow OCR card keywords in the backend.

Fixing these ensures accurate, responsive tracking for coins and full auto-detection for trading cards.

## What Changes

- **Viewfinder Aspect Ratio Alignment**: Synchronize the live analysis canvas crop with the active rendered aspect ratio of the viewfinder container, ensuring normalized `(x, y, width, height)` coordinates map 1:1 onto the visible video regardless of viewport or device orientation.
- **Robust 2D Subject Detection & Hole Filling for Coins**: Replace 1D projection column/row histogram cuts in `cameraMetrics.ts` with 2D connected-component saliency analysis, morphological hole-filling (capturing the flat interior field of circular coins), border artifact rejection, and center-distance weighting.
- **First-Class Trading Card Shape & Reticle**: Add `card` to `DetectedShape` and `ReticleMode` in `cameraMetrics.ts` and `GuidedCameraModal.tsx`, provide a dedicated 2.5:3.5 (5:7) card reticle, and update shape classification to identify standard trading cards distinctly from slabs and notes.
- **Effortless Modal Exit Controls**: Provide accessible ways to exit the guided camera without taking a photo, including a prominent thumb-friendly "Cancel" button in the bottom control bar alongside "Native Camera", keyboard `Escape` shortcut support, and backdrop click dismissal.
- **Intake Category Synchronization**: Fix the category check in `ScanAddPage.tsx` (`CARD` instead of `TRADING_CARD`), pass `detectedShape` back on capture completion, and auto-select `category = "CARD"` when a trading card is detected.
- **Enhanced Card OCR Recognition**: Expand local OCR card heuristics in `backend/apps/vision/ocr.py` to identify cards via game markers (HP, ATK, Trainer, Energy, 1st Edition, Rookie/RC) and card manufacturer copyrights (Nintendo, Wizards, Topps, Panini, Bowman, Upper Deck, Donruss, Fleer) even when the word "Pokémon" or brand name is absent on the front.

## Capabilities

### Modified Capabilities
- `guided-camera-capture`: Add `card` shape and reticle modes, synchronize analysis aspect ratio with container geometry, and implement 2D hole-filled subject tracking for coins and cards.
- `trading-card-specs-and-catalog`: Support camera auto-detection intake for trading cards and expand local OCR card heuristics for raw/ungraded cards.

## Impact

- `frontend/src/components/GuidedCameraModal.tsx`: Viewfinder layout, shape modes, card reticle, and coordinate mapping.
- `frontend/src/lib/cameraMetrics.ts`: Subject detection algorithm, 2D component analysis, hole filling, and shape classification (`card`).
- `frontend/src/pages/ScanAddPage.tsx`: Initial shape resolution (`CARD`), `onComplete` category assignment.
- `backend/apps/vision/ocr.py`: Trading card pattern detection and fallback classification.
- Frontend and backend unit/integration tests covering coin tracking, card reticle, and card intake.

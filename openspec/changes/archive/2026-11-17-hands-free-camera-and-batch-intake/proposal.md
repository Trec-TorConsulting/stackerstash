# Proposal: Hands-Free Camera & Batch Auto-Pair Intake

## Problem Statement
Taking photos of coins, slabs, bullion bars, and banknotes still required too many manual steps and stalled too easily in real-world lighting:
1. Live auto-snap blocked on metallic coin specular luster (`glareRatio > 0.18`) and smooth bullion surfaces (`effectiveEdge < 7.5`), and required 4 consecutive ticks without flicker.
2. Every capture forced the user through a mandatory full-screen Review -> Confirm -> Flip -> Review -> Confirm flow, even when Auto-Capture was on.
3. Detected subject bounding boxes were not used to auto-crop captured frames.
4. `ScanAddPage` lacked drag-and-drop, clipboard paste, a direct Phone Camera (`capture="environment"`) button, and multi-item batch pairing when uploading 4+ photos.

## Proposed Solution
1. **Hands-Free Express Camera (`GuidedCameraModal` + `cameraMetrics`)**:
   - Relax metallic glare and smooth-surface sharpness thresholds so real-world coins/bars auto-snap reliably in 3 steady ticks (~600ms).
   - Enable Hands-Free Express mode by default when Auto-Capture is on: Front auto-snaps and transitions straight to Back with a 1.4s flip cooldown (`"Front saved! Flip item for Back"`), and Back auto-snaps straight to completion & AI identification.
   - Auto-crop captured frames tightly around confident `subjectBox` detections using `computeSubjectCropRect`.
2. **Effortless Native / Batch Intake (`ScanAddPage`)**:
   - Add a **Phone Camera** (`capture="environment"`) button and 1-tap **Snap Back** prompt for native hardware autofocus/macro/HDR.
   - Add **Drag & Drop** and **Clipboard Paste** (`Ctrl/Cmd+V`) ingestion, plus per-photo removal.
   - Add **Batch Auto-Pair** when 4+ even-count photos are uploaded/dropped, pairing every 2 photos as Front + Back and cataloging/identifying all items in one click.

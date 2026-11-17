# Delta Spec: Hands-Free Camera & Batch Intake

## Requirements

### Requirement: Hands-Free Auto-Snap Flow
- When `Auto-Capture` and `Hands-Free` are active, capturing Front SHALL immediately save the photo and advance to Back with a flip cooldown (`1400ms`), and capturing Back SHALL immediately complete and trigger AI identification without a blocking review modal.
- Users SHALL be able to toggle `Review Each` or use manual shutter/spacebar to inspect, rotate, or crop before confirming.

### Requirement: Subject Auto-Crop & Metallic Luster Tolerance
- `evaluateFrameMetrics` SHALL tolerate normal metallic coin luster (`glareRatio <= 0.30`) and smooth bullion surfaces (`effectiveEdge >= 4.5`).
- `GuidedCameraModal` SHALL automatically crop captured frames around confident `subjectBox` detections using `computeSubjectCropRect`.

### Requirement: Phone Camera, Drag-and-Drop, Paste & Batch Auto-Pair
- `ScanAddPage` SHALL support native Phone Camera (`capture="environment"`), Drag & Drop, and Clipboard Paste (`Ctrl/Cmd+V`).
- Uploading or dropping 4+ even-count photos SHALL offer Batch Auto-Pair mode to catalog and AI-identify all Front/Back pairs in one click.

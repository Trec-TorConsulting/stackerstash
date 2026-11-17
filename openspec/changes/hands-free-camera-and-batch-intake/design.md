# Design: Hands-Free Camera & Batch Auto-Pair Intake

## Architecture & Key Decisions

### 1. Forgiving Real-World Frame Metrics (`frontend/src/lib/cameraMetrics.ts`)
- `GLARE_LUMA_THRESHOLD` raised to `246` and `GLARE_RATIO_THRESHOLD` raised to `0.30` so normal metallic luster does not block auto-snap, while severe blown-out glare still warns.
- `effectiveEdge` sharpness floor lowered from `7.5` to `4.5` for smooth silver/gold coins and bars.
- `evaluateFramingState` `centerOffset` relaxed to `0.32`; `isSteady` allows `meanFrameDiff < 22` and `boxMoved <= 0.08`.

### 2. Hands-Free Express Capture & Auto-Crop (`frontend/src/components/GuidedCameraModal.tsx`)
- `AUTO_CAPTURE_TICKS` reduced from `4` to `3` (~600ms steady hold).
- `expressMode` defaults to `true` when `autoCapture` is enabled, with a `Hands-Free` / `Review Each` header toggle.
- On auto-snap in `expressMode`, Front transitions immediately to Back with `FLIP_COOLDOWN_MS = 1400` so the user has time to flip the item before Back auto-snap arms.
- `drawNormalizedSource` uses `computeSubjectCropRect` whenever `subjectBox.confidence >= 0.4` and `areaRatio` is within `[0.05, 0.78]`.

### 3. Unified Ingestion & Batch Auto-Pair (`frontend/src/pages/ScanAddPage.tsx`)
- `ingestFiles(picked, defaultLabel, source)` unifies file picker, Phone Camera (`capture="environment"`), drag-and-drop, and `window` `paste` events.
- When `files.length >= 4 && files.length % 2 === 0`, `batchMode` activates automatically, grouping photos into `(Obverse, Reverse)` pairs and exposing `handleBatchCatalogAll()` to identify, create, upload (with optional background removal), and auto-appraise each item sequentially.

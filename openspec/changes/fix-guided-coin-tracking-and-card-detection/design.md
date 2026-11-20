# Design: Fix Guided Coin Tracking and Trading Card Auto-Detection

## Context

See `proposal.md` for background and motivation.

Currently, the camera viewfinder in `frontend/src/components/GuidedCameraModal.tsx` uses a fixed `VIEWFINDER_ASPECT = 4 / 3` for offscreen canvas sampling, while the visual viewfinder container is rendered with `aspect-[4/3] w-full flex-1 ...`. On mobile devices or narrow browser windows, `flex-1` expands the container vertically to fill the available height in `h-[100dvh]`, resulting in a tall portrait aspect ratio (~9:16 or ~3:5). Because the `<video>` uses CSS `object-cover` while the sample canvas extracts a 4:3 landscape crop, normalized coordinates `(x, y)` from `detectSubjectBox` map to a completely different pixel region in the visible container, causing the tracking reticle (`live-subject-box`) to be shifted horizontally toward the right edge.

Furthermore, `detectSubjectBox` in `frontend/src/lib/cameraMetrics.ts` collapses 2D salient pixels into 1D column and row projection histograms (`colCounts` and `rowCounts`) and searches for contiguous spans above a threshold with `pickBestSpan`. Circular coins have smooth/reflective central fields that produce low contrast against backgrounds; this creates a bimodal dip in the column histogram, causing `pickBestSpan` to split the coin into disjoint rim fragments. Meanwhile, background clutter, shadows, or holding fingers on the right margin produce a solid column of edge mass across the full height of the 120-row sample, tricking `pickBestSpan` into locking onto the right edge.

Lastly, the camera system completely lacks trading card awareness: `DetectedShape` and `ReticleMode` only support `coin`, `slab`, and `note`. Sports and TCG cards get classified as `slab` (because their ~0.714 physical aspect ratio falls under `physicalAspect < 0.8`), `ScanAddPage.tsx` has a typo checking `form.category === "TRADING_CARD"` (the database enum is `"CARD"`), and the intake form discards `detectedShape` on completion.

## Goals / Non-Goals

**Goals:**
- Guarantee 1:1 spatial alignment between the live video display and the subject tracking overlay across desktop, mobile portrait, and landscape orientations.
- Replace fragile 1D projection histograms with a robust 2D connected-component, hole-filling, and center-weighted subject detector that reliably encompasses circular coins and ignores edge shadows/fingers.
- Add first-class `card` shape detection, a 5:7 (2.5" x 3.5") card reticle, and card mode selection in `GuidedCameraModal`.
- Provide accessible, thumb-friendly exit paths (bottom bar "Cancel" button, keyboard `Escape`, top `X`) to cleanly exit the camera without taking a photo.
- Wire `detectedShape === 'card'` to auto-select `category = "CARD"` on `ScanAddPage.tsx`.
- Expand backend OCR heuristics in `ocr.py` to identify cards from game terminology and copyright notices without requiring prominent franchise logos.

**Non-Goals:**
- Introducing heavy client-side ML models (e.g. TensorFlow.js or MediaPipe); all real-time tracking must remain sub-5ms pure Canvas/TypeScript to maintain 60fps on low-end mobile devices.
- Altering server-side deskew/perspective warp algorithms in `backend/apps/catalog/image_processing.py`.

## Decisions

### 1. Viewfinder Viewport Aspect Synchronization
- **Decision**: Measure the actual rendered aspect ratio of the viewfinder container via `clientWidth / clientHeight` (or bound the container strictly to a controlled aspect ratio matching the sampling rect). When taking the 160x120 evaluation frame, sample the exact visible viewport slice of the video stream that corresponds to the container's CSS `object-cover` visible rectangle.
- **Rationale**: `object-cover` scales and centers the video to cover the element. By computing the visible crop rect from the container's actual aspect ratio `containerW / containerH`, any normalized coordinate `(x, y, w, h)` in `0..1` space on the sample canvas maps directly to `left: x * 100%`, `top: y * 100%`, `width: w * 100%`, `height: h * 100%` on the container with zero distortion or lateral displacement.
- **Alternatives Considered**: Forcing a letterboxed 4:3 container on mobile: rejected because letterboxing degrades user experience on modern tall mobile screens and leaves large black dead zones.

### 2. 2D Connected Component Saliency & Morphological Hole Filling
- **Decision**: Port the proven 2D spatial techniques from `autoCrop.ts` into a lightweight real-time version for `cameraMetrics.ts`:
  1. Palette modeling + gradient thresholding to produce a binary foreground mask.
  2. Fast 2D morphological closing / hole-filling on the salient mask so the flat, reflective center of a coin is treated as solid foreground.
  3. Connected-component labeling to group contiguous salient pixels into distinct 2D candidate blobs.
  4. Component scoring that penalizes components touching the outer 5% frame margin (rejecting holding fingers/border shadows) and favors components centered in the viewfinder (`1 - 0.5 * dist_from_center`).
- **Rationale**: 1D histograms cannot distinguish a vertical shadow on the right from a centered coin. 2D connected components isolate the coin as a unified entity, ensuring the bounding box centers directly over the coin and closes in on its true outer boundary.
- **Alternatives Considered**: Circular Hough transform: rejected due to high CPU cost on 200ms mobile timers and inability to detect non-circular cards, slabs, or notes.

### 3. First-Class Trading Card Shape & Reticle Mode
- **Decision**:
  - Extend `DetectedShape` to `'coin' | 'card' | 'slab' | 'note'`.
  - Extend `ReticleMode` to `'auto' | 'coin' | 'card' | 'slab' | 'note'`.
  - In `cameraMetrics.ts`, classify shapes based on physical aspect ratio:
    - `card`: physical aspect ratio between `0.64` and `0.79` (or `1.27` to `1.56` landscape) with rectangular corner fill.
    - `slab`: physical aspect ratio between `0.45` and `0.64` (or `1.56` to `2.2`) or thick slab borders.
    - `note`: physical aspect ratio `>= 1.58` (or `<= 0.50`) for US paper currency and Goldbacks.
    - `coin`: physical aspect ratio between `0.80` and `1.25` with circular corner cutoff.
  - Render a dedicated 5:7 card reticle in `GuidedCameraModal`.
- **Rationale**: Standard sports and TCG cards have a strict 2.5" x 3.5" (0.714) form factor distinct from elongated slabs (approx 3.2" x 5.4" ≈ 0.59) and banknotes (approx 2.61" x 6.14" ≈ 0.425).

### 4. Accessible Modal Exit Ergonomics
- **Decision**:
  - Add an explicit `Cancel` button in the bottom controls row (replacing the empty placeholder when `step === 'front'`) styled with clear secondary button styling (`border-slate-700 hover:bg-slate-800 text-slate-300`).
  - Add a window `keydown` listener for `Escape` that invokes `stopStream()` and `onClose()`.
  - Ensure the exit actions immediately stop all MediaStream tracks and reset camera states.
- **Rationale**: On mobile full-screen views, the top-right `X` button is awkward for one-handed thumb reach and easily missed. A bottom-row "Cancel" button provides an immediate, low-effort exit path without requiring a capture tap. On desktop keyboards, `Escape` is standard expected modal dismissal behavior.

### 5. ScanAddPage Integration & OCR Pattern Expansion
- **Decision**:
  - In `ScanAddPage.tsx`, correct `form.category === "TRADING_CARD"` to `form.category === "CARD"` and map it to `initialShape = "card"`.
  - In `onComplete`, if `detectedShape === 'card'`, set `form.category = "CARD"` automatically.
  - In `backend/apps/vision/ocr.py`, expand `is_card` regexes to check for card stats ("HP", "ATK", "DEF", "P/T", "Stage [12]", "Trainer", "Energy", "1st Edition", "Rookie Card", "RC") and card publisher names ("Nintendo", "Wizards", "Topps", "Panini", "Upper Deck", "Bowman", "Donruss", "Fleer", "Score").
- **Rationale**: Raw cards often do not print the word "Pokémon" or brand name on the front face, so game stats and copyright markers ensure immediate, accurate card identification.

## Risks / Trade-offs

- **[Risk] High CPU load on low-end devices during 200ms evaluation timer** → **Mitigation**: Downscale the analysis canvas to 120x90 or 160x120 pixels; morphological passes use fast 1D separable buffers or 3x3 lookup arrays taking < 3ms total execution time.
- **[Risk] Slabs containing trading cards may have conflicting aspect ratios** → **Mitigation**: PSA/BGS slabs are taller and narrower (~0.58 aspect ratio) than raw cards (~0.714); the aspect classification boundaries cleanly distinguish raw cards from graded slabs.
- **[Risk] Non-standard mini or oversized cards** → **Mitigation**: Users can manually select the Card or Slab reticle mode if an irregular card isn't caught by auto-detect.

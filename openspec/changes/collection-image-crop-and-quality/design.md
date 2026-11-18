# Design

## Context

See [proposal.md](proposal.md) for the live collection audit findings and motivation, and the delta specs under `specs/` for required observable behavior.

Currently, image framing and quality checks are split across:
- **Client-side** (`frontend/src/lib/autoCrop.ts`, `cameraMetrics.ts`, `ScanAddPage.tsx`): Runs k-means (`K=3`) border-sampled background estimation on a 256px canvas with `paddingRatio: 0.04`. It bails out (`no_subject` / `low_confidence`) on textured carbon-fiber mats or dark-on-dark slabs, does not deskew tilted items, and does not surface glare or clipped-edge warnings on staged uploads.
- **Server-side** (`backend/apps/catalog/image_processing.py`, `api.py`): Runs `process_item_image(..., auto_crop=True)` using `detect_subject_crop_box` (`AUTO_CROP_PADDING_RATIO = 0.04`). `detect_card_rectangle` discards the `minAreaRect` angle via `_rotated_rect_bounds`, so tilted items stay crooked. `analyze_image_quality_and_forensics` only checks global `brightness > 235`, missing localized specular glare over a coin inside a dark frame.
- **Collection Grid** (`frontend/src/pages/CollectionPage.tsx`): Renders `aspect-[4/3]` cards with `object-contain p-2`.

## Goals / Non-Goals

**Goals:**
- Standardize padded cropping (~6% margin, within the 5–8% target) across client and server so subjects never touch frame edges.
- Make foreground detection resilient to textured/carbon-fiber mats, dark-on-dark slabs, and localized glare patches.
- Automatically deskew tilted rectangular subjects (slabs, notes, proof sets, flips) before cropping.
- Warn users on localized specular glare and clipped subject edges during capture/upload.
- Provide an idempotent, dry-runnable backfill command to re-crop and deskew existing stored `ItemPhoto` assets safely.

**Non-Goals:**
- Changing collection grid cards to `object-cover` or introducing per-category card aspect ratios (cards remain `aspect-[4/3]` with `object-contain`).
- Generative inpainting or AI outpainting to reconstruct detail already missing from previously clipped or glare-obscured photos.
- Transparent background cutout/removal in the collection grid (rectangle crops only).

## Decisions

### 1. Uniform 6% Crop Padding & `object-contain` Preservation
- Set default `paddingRatio` / `AUTO_CROP_PADDING_RATIO` to `0.06` (6% of longest subject side, within the 5–8% range) in both `frontend/src/lib/autoCrop.ts` and `backend/apps/catalog/image_processing.py`.
- Keep `CollectionPage.tsx` using `object-contain p-2` so neither portrait slabs nor horizontal notes are ever clipped by the card container.
- *Alternative considered*: Switching cards to `object-cover` — rejected because slabs and notes have incompatible aspect ratios and would be clipped.

### 2. Texture-Resilient Foreground Segmentation
- **Client (`autoCrop.ts`)**: Pre-blur the 256px analysis buffer lightly (3×3 box/Gaussian pass) before border k-means and edge/saliency scoring so high-frequency carbon-fiber weave does not inflate background color variance or trigger false foreground edges.
- **Server (`image_processing.py`)**: Apply bilateral/Gaussian pre-smoothing before Canny edge detection and GrabCut/salient-bounds fallback, and reject candidate boxes whose interior variance/glare profile indicates a small specular highlight rather than the collectible itself.
- *Alternative considered*: Full ML segmentation (e.g., `rembg`/U2-Net) — rejected to avoid heavy runtime/memory footprint in K3S pods and keep processing fast on mobile/server.

### 3. Server-Side Automatic Deskew for Tilted Rectangular Subjects
- Update `process_item_image` in `backend/apps/catalog/image_processing.py` to inspect `detect_card_rectangle(img)` (which already computes `cv2.minAreaRect` center, size, and angle).
- When a high-confidence rectangular subject has a small tilt (`1.0° <= |tilt| <= 15.0°`) and non-square or clearly linear edges, rotate the image around its center using `BORDER_REPLICATE` (or median border color) to straighten it upright *before* running `detect_subject_crop_box` on the straightened image.
- Restrict auto-deskew to rectangular subjects (not circular coins) and angles `<= 15°` so upright or intentionally portrait/landscape items are never rotated 90° by mistake.
- *Alternative considered*: Client-side deskew in `autoCrop.ts` — deferred in favor of server-side OpenCV rotation so both camera captures and file uploads get identical, high-precision straightening without risking mobile Safari canvas memory limits.

### 4. Localized Specular Glare & Clipped-Edge Warnings
- **Server (`analyze_image_quality_and_forensics`)**: Add a localized specular glare metric over the central 70% subject region (fraction of pixels with near-white luminance `L >= 242` and low saturation `S <= 30`). Flag when localized glare exceeds a threshold (e.g., `> 0.08`) even if overall image brightness is normal. Also check whether the detected subject touches `>= 2` frame edges (`subject_clipped`) and include a non-blocking warning.
- **Client (`ScanAddPage.tsx` + `autoCrop.ts` / `cameraMetrics.ts`)**: Surface `subject_clipped` from `autoCropImageFile` as a framing hint on staged photos, and run lightweight glare scoring on staged photos to show a non-blocking glare warning badge recommending angled lighting.

### 5. Idempotent Backfill Management Command (`recrop_collection_photos`)
- Add `backend/apps/catalog/management/commands/recrop_collection_photos.py` supporting `--dry-run`, `--workspace`, `--item-id`, `--backup-dir`, and `--limit`.
- For each `ItemPhoto`, run deskew + `detect_subject_crop_box` (with `padding_ratio=0.06`). Only rewrite the image if a confident tighter crop or deskew is produced (avoiding re-encoding already-tight photos), back up the original file to `--backup-dir` (defaulting to a safe backup path when applying), and update `photo.width` and `photo.height`.

## Risks / Trade-offs

- **Previously clipped or glare-ruined photos**: Stored photos that were already cropped too tightly (e.g., *Walking Liberty*) or obscured by glare (*Armenia Noah's Ark*) cannot regain missing pixels via re-cropping. → *Mitigation*: Backfill skips photos where no safer/tighter crop is found and logs them in the summary report for manual retake.
- **False deskew on patterned backgrounds**: A strong background line could skew `minAreaRect`. → *Mitigation*: Require minimum area ratio, aspect/fill validation, and cap auto-deskew to `1.0°–15.0°`.
- **Re-encoding quality loss during backfill**: Re-saving JPEGs slightly degrades quality. → *Mitigation*: Skip photos whose dimensions/framing change by `< 5%` and save at high JPEG quality (`92`).

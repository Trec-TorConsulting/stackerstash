# Design: Clean Geometric Subject Extraction & GrabCut Safety Guard

## Architecture & Pipeline Order

### 1. Updated `process_item_image` Pipeline (`backend/apps/catalog/image_processing.py`)
1. **EXIF Transpose & Resize** (`MAX_IMAGE_DIMENSION`).
2. **Geometric Subject Detection (before pixel-level GrabCut)**:
   - If `shape_hint == "coin"`:
     - First try `detect_circular_coin(img)` (centered loose coin / round).
     - If no centered circle is found (e.g., small coin inside an assay card, 2x2 flip, or proof set), try `detect_rectangular_subject` on the original image -> if a strong rectangle (`extent >= 0.78`, `area_ratio` in `[0.08, 0.90]`) is found, extract with `extract_rectangular_cutout`.
   - If `shape_hint` is `None`, `"rect"`, `"bar"`, `"note"`, or `"slab"`:
     - Try `detect_rectangular_subject` on the original image (using edge/LAB contrast against the border) before pixel-level GrabCut.
3. **GrabCut Safety Guard**:
   - When `_remove_background_grabcut` runs as a fallback, verify that the resulting alpha mask has:
     - Single largest connected component covering `>= 75%` of total foreground pixels (no fragmented islands).
     - Bounding-box fill ratio `>= 0.45` and foreground area `>= 8%` of the frame.
   - If the guard fails, return the original RGB/RGBA image (with optional enhancement/orientation) rather than a chewed-up cutout.

### 2. Target Collectible Categories to Validate
- **Assay Cards** (dark/colorful card with embedded capsule, e.g. Pumpkin Head Platinum)
- **Graded Slabs** (PCGS/NGC/ANACS clear/white plastic holders)
- **Loose Coins** (raw silver/gold/copper on light or dark desk)
- **Goldbacks & Banknotes** (metallic foil + white/wood surfaces)
- **Proof Sets** (multi-coin rectangular lenses/boxes)
- **2x2 Flips / Flippers** (cardboard or Mylar flips with staples/handwriting)

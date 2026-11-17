# Proposal: Clean Geometric Subject Extraction & GrabCut Safety Guard

## Problem Statement
Real-world photos of coins in assay cards, graded slabs, proof sets, 2x2 flips, and banknotes often contain mixed backgrounds (e.g., white desk + dark desk edge) and high-contrast artwork or bright metallic capsules. Currently, `process_item_image` in `backend/apps/catalog/image_processing.py` runs pixel-level GrabCut (`_remove_background_grabcut`) before checking for geometric rectangles when `shape_hint` is `"coin"` or `None`. When the border contains both dark and light regions, GrabCut learns both as background and erases dark artwork and bright coins—producing jagged, half-deleted cutouts (as seen on `03b540c4-fff1-4400-a291-8627ea4e264a`).

## Proposed Solution
1. **Geometric-First Extraction**:
   - Check for a clean rectangular subject (assay card, slab, bar, note, 2x2 flip, proof set) on the original image using edge/LAB contour fitting (`detect_rectangular_subject` + `extract_rectangular_cutout`) *before* falling back to pixel-level GrabCut, even when `shape_hint` is `"coin"` or `None`.
   - Keep `detect_circular_coin` + `extract_coin_cutout` for true centered loose coins.
2. **GrabCut Sanity & Fallback Guard**:
   - Validate any GrabCut foreground mask (minimum contiguous area, bounding-box fill ratio/extent, non-fragmentation) before applying it.
   - If GrabCut produces a fragmented or overly eroded mask, fall back to a clean tight crop or preserve the original un-erased image.
3. **Real-World Fixture Validation**:
   - Validate and tune across real-world raw phone photos of assay cards, graded slabs, loose coins, Goldbacks/banknotes, proof sets, and 2x2 flips.

# Delta Spec: Clean Geometric Subject Extraction

## Requirements

### Requirement: Geometric-First Card, Slab, Flip & Proof Set Extraction
- `process_item_image` SHALL attempt geometric rectangular subject detection before pixel-level GrabCut when no centered circular coin is detected, regardless of whether `shape_hint` is `"coin"` or `None`.
- Rectangular subjects (assay cards, slabs, bars, notes, 2x2 flips, proof sets) SHALL be extracted with clean straight/rounded geometric edges rather than pixel-level GrabCut erosion.

### Requirement: GrabCut Fragmentation & Erosion Guard
- Any fallback to `_remove_background_grabcut` SHALL validate mask contiguity and fill ratio before discarding pixels.
- If GrabCut erodes or fragments the subject, `process_item_image` SHALL preserve the original un-erased image instead of saving a damaged cutout.

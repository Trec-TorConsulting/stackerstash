# Proposal

## Why

A visual audit of the live collection at `stackerstash.com/collection` revealed severe visual inconsistency across item cards: many photos on dark or carbon-fiber mats are completely uncropped (leaving 30–70% empty desk/mat), several items are cropped wrong or clipped (e.g., *2023 Armenia Noah's Ark* obscured by glare in a thin strip, *2025 Arizona 100 Goldback* clipped top/bottom, *1 Ounce Copper Walking Liberty Round* touching the frame edge), and multiple slabs/notes are noticeably tilted. Improving auto-crop, adding automatic deskew and glare/clipping warnings, and backfilling existing stored images will make the collection grid visually uniform while keeping `object-contain` so no item is ever clipped by the UI.

## What Changes

- **Consistent Padded Auto-Crop (Client & Server)**: Update subject detection and crop padding in both client-side `autoCrop` and server-side `image_processing` so every detected coin, round, slab, note, or bar is framed with ~5–8% breathing room (preventing rims/borders from touching edges) while resisting false crops on patterned carbon-fiber mats, dark-on-dark slabs, and glare patches.
- **Automatic Deskew / Straightening**: Detect subject tilt (for rectangular slabs, notes, proof sets, and flips) and apply small-angle rotation straightening before cropping so skewed items render square and upright.
- **Capture & Upload Glare / Clipped-Edge Warnings**: Surface non-blocking, actionable warnings when uploaded or captured images exhibit heavy specular glare over the subject or clipped subject edges, so users can retake before persisting obscured photos.
- **One-Time Backfill / Re-Crop for Existing Collection Photos**: Provide a safe, idempotent backend management command (with dry-run and backup/rollback safety) to re-run improved deskew + padded auto-crop on existing stored `ItemPhoto` assets that were left uncropped or mis-cropped, updating stored `width`/`height` metadata.
- **Preserve `object-contain` Grid Framing**: Keep `object-contain` in `CollectionPage` cards so properly cropped & deskewed images display cleanly without UI-level edge clipping.

## Capabilities

### New Capabilities
<!-- None — this change extends existing image quality and capture capabilities -->

### Modified Capabilities
- `image-authenticity-and-quality-gate`: Tighten and standardize subject cropping with 5–8% padding on textured/dark surfaces, add automatic deskew for tilted rectangular items, add upload-time glare/clipped-edge warnings, and add a backfill re-crop workflow for existing stored photos.
- `guided-camera-capture`: Surface clear capture-time warnings when heavy specular glare or clipped subject edges are detected on captured frames.

## Impact

- **Frontend**: `frontend/src/lib/autoCrop.ts`, `frontend/src/lib/cameraMetrics.ts`, `frontend/src/pages/ScanAddPage.tsx`, and unit tests (`autoCrop.test.ts`, `autoCropIntake.test.tsx`).
- **Backend**: `backend/apps/catalog/image_processing.py`, `backend/apps/catalog/api.py`, new Django management command under `backend/apps/catalog/management/commands/`, and backend tests (`test_image_processing.py`, `test_image_verification.py`).
- **Database / Media**: Existing `ItemPhoto` image files and `width`/`height` fields updated by the one-time backfill command.

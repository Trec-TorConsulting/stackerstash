# Proposal

## Why

Currently, taking a photo or uploading an image in `ScanAddPage` only pre-fills form fields via AI identification—it does not guide the user to capture a sharp, centered CoinSnap-style photo, does not verify that an image is a real physical item (rather than a photo of a screen, screenshot, or synthetic/edited image), does not enforce front-and-back coverage for uploaded coins/notes, and does not automatically run the full appraisal and title-normalization pipeline across Camera, Upload, and CSV imports. Unifying all intake paths behind guided capture, authenticity/quality verification, and automatic background appraisal ensures every item enters Stackers Stash with museum-grade photos, trustworthy provenance, uniform naming, and immediate valuation.

## What Changes

- **CoinSnap-Style Guided Camera Capture**: Add a live `getUserMedia` camera viewfinder in `ScanAddPage.tsx` with a responsive alignment reticle (circular for coins/rounds, rectangular for banknotes/slabs/bars), optical/digital zoom controls, real-time sharpness/lighting/centering feedback, and a guided **Front (Obverse) → Back (Reverse)** capture sequence (with graceful fallback to file input if camera permissions are unavailable).
- **Image Authenticity & Quality Verification Gate**:
  - **Camera Path**: Runs background removal & tight crop (`process_item_image`), checks sharpness/exposure/resolution, and runs AI + heuristic checks to verify a physical item is present (rejecting/flagging "pic-of-a-pic", monitor pixels/moiré, and stock/printed photos).
  - **Upload Path**: Requires both **Front (Obverse)** and **Back (Reverse)** images for `COIN` and `PAPER` categories (allowing single photo for `BAR`, `SLAB`, `OTHER`), and performs deeper forensic checks (EXIF/metadata anomalies, screenshot aspect/UI chrome detection, screen moiré, synthetic/AI-generated artifact detection, duplicate/stock indicators, and blur/glare).
  - **Warn & Flag Override**: When a check fails, the UI presents a clear, actionable warning explaining why and flags the photo/item (`photo_verification_status`, `photo_verification_notes`), while allowing user override for legitimate edge cases (e.g., vintage auction photos).
- **Unified Post-Intake Pipeline (Camera, Upload & CSV)**: Standardize all intake paths so that creating an item via Camera, Upload, or CSV/Bulk Import automatically normalizes the item's title, persists verified/flagged photo metadata, and queues a background `AppraisalJob` (melt + specs + guides + comps + multimodal AI + raw grade).

## Capabilities

### New Capabilities
- `guided-camera-capture`: Live PWA camera viewfinder with alignment reticle, zoom, real-time framing/sharpness/lighting guidance, and Front-then-Back capture flow.
- `image-authenticity-and-quality-gate`: Automated background removal, quality scoring, physical-presence / anti-pic-of-a-pic verification, deeper upload forensics, category-aware Front+Back enforcement, and warn-and-flag override tracking.
- `unified-intake-pipeline`: Uniform post-intake orchestration across Camera Capture, File Upload, and CSV/Bulk Import—normalizing titles and automatically launching background `AppraisalJob` runs.

### Modified Capabilities
- (None — existing specs require no requirement changes.)

## Impact

- **Backend**: `backend/apps/catalog/models.py` (`photo_verification_status`, `photo_verification_notes`, `intake_source` on `CollectionItem`/`ItemPhoto`), `backend/apps/catalog/image_processing.py` (blur/exposure/moiré/EXIF heuristics), `backend/apps/vision/services.py` (physical-presence & pic-of-a-pic AI check + deeper upload forensics), `backend/apps/catalog/api.py` & `importer.py` (auto-enqueue `AppraisalJob` + title normalization on item creation/CSV import), plus migrations and tests.
- **Frontend (PWA)**: New `GuidedCameraModal.tsx` / `CameraViewfinder.tsx`, updated `ScanAddPage.tsx` (unified Camera + Upload Front/Back flow with verification warnings & override), `ImportWizardModal.tsx` (status notice for queued background appraisals), and `ItemDetailPage.tsx` (photo verification badge).


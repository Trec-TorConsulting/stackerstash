# Tasks

## 1. Schema, Migrations & Intake Provenance

- [x] 1.1 Add `intake_source`, `photo_verification_status`, and `photo_verification_notes` to `CollectionItem`, and `verification_status` / `verification_notes` to `ItemPhoto` in `backend/apps/catalog/models.py`; generate/apply migrations and verify `python manage.py check` passes.
- [x] 1.2 Expose `intake_source`, `photo_verification_status`, `photo_verification_notes`, and optional `appraisal_job_id` in `ItemOut` / `ItemIn` in `backend/apps/catalog/api.py`, and verify with catalog tests (`pytest`).

## 2. Image Quality, Forensics & Authenticity Verification Gate

- [x] 2.1 Implement `analyze_image_quality_and_forensics(image_bytes, mode)` in `backend/apps/catalog/image_processing.py` (resolution, blur/sharpness, exposure, EXIF software/screenshot markers, and screen moiré heuristics) with unit tests (`pytest`).
- [x] 2.2 Extend `identify_images` in `backend/apps/vision/services.py` and `POST /api/v1/vision/identify` to accept `intake_mode` (`camera` | `upload`), run Tier 1 + Tier 2 physical-presence / anti-pic-of-a-pic / front-back consistency checks, and return `verification_status` and `verification_warnings`; verify with mocked unit tests (`pytest`).

## 3. Unified Post-Intake Pipeline (Camera, Upload & CSV)

- [x] 3.1 Update item creation in `backend/apps/catalog/api.py` and CSV import confirmation in `backend/apps/catalog/importer.py` to: (a) normalize titles via `_clean_item_title` on save, (b) record `intake_source` and `photo_verification_status`, and (c) automatically enqueue `AppraisalJob` (throttled `max_workers=2` batch thread for CSV imports).
- [x] 3.2 Add backend integration tests verifying title cleanup, verification status persistence/override, and automatic background appraisal queuing across Camera, Upload, and CSV intake (`pytest`).

## 4. CoinSnap-Style Guided Camera & Unified Scan/Upload UI

- [x] 4.1 Build `GuidedCameraModal.tsx` under `frontend/src/components/` (`getUserMedia` viewfinder, adaptive circular/rectangular reticle, 1x–3x zoom, live sharpness/exposure feedback, Front -> Back guided sequence, and native capture fallback).
- [x] 4.2 Update `frontend/src/pages/ScanAddPage.tsx` to integrate `GuidedCameraModal`, enforce Front + Back photos for `COIN` and `PAPER` on the Upload path, display image verification warnings with an explicit "Proceed Anyway" override, and redirect to `ItemDetailPage` with active `appraisal_job_id` polling.
- [x] 4.3 Update `ImportWizardModal.tsx` (show queued background appraisal notice after CSV import) and `ItemDetailPage.tsx` (display photo verification badge when `FLAGGED` or `OVERRIDDEN`), and add Vitest tests for `GuidedCameraModal`, Front+Back upload validation, and warn-and-override flow (`npm test`).

## 5. Documentation & End-to-End Verification

- [x] 5.1 Update `docs/USER_GUIDE.md` to document Guided Camera Capture, Upload Front+Back & Authenticity Verification, and unified auto-appraisal across Camera, Upload, and CSV imports.
- [x] 5.2 Run full backend test suite (`pytest`), frontend test suite (`npm test`), and production build (`npm run build`) to confirm end-to-end readiness.


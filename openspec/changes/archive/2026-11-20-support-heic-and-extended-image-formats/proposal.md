# Proposal: Support HEIC and Extended Image Formats

## Why

Users frequently take photos of their coins, paper currency, graded slabs, and bullion using Apple iPhones and modern smartphones, which capture in `.heic` and `.heif` format by default. Additionally, archival scans and desktop images often come in TIFF, BMP, WebP, or AVIF formats. Supporting HEIC and extended image formats allows users to upload their photos seamlessly from any device without manual format conversion.

## What Changes

- Add client-side HEIC/HEIF conversion via dynamically imported `heic2any` in the frontend so browsers without native HEIC support (Chrome, Edge, Firefox) can preview, auto-crop, and evaluate glare on HEIC photos.
- Update file input pickers across Scan & Add, Item Detail, and Guided Camera to explicitly allow `.heic`, `.heif`, `.hif`, `.avif`, `.webp`, `.png`, `.jpg`, `.jpeg`, `.bmp`, `.tiff`, and `.gif`.
- Make file filtering resilient against generic `application/octet-stream` MIME types assigned to HEIC/TIFF files by some operating systems.
- Register `pillow_heif` across backend catalog and vision apps so server-side ingest, auto-crop, forensics, and Vision AI identification can open and process HEIC/HEIF images natively.
- Enhance MIME type inference in vision services to recognize HEIC/HEIF, AVIF, TIFF, BMP, and GIF magic bytes from file headers.

## Capabilities

### Modified Capabilities

- `unified-intake-pipeline`: Add multi-format image support and automatic HEIC normalization across camera capture, file upload, and vision appraisal intake flows.

## Impact

- Frontend: `imageUtils.ts`, `ScanAddPage.tsx`, `ItemDetailPage.tsx`, `GuidedCameraModal.tsx`, `autoCrop.ts`, `cameraMetrics.ts`, and `heic2any` dependency.
- Backend: `apps/catalog/apps.py`, `apps/vision/apps.py`, `image_processing.py`, `apps/vision/services.py`, `apps/vision/api.py`.

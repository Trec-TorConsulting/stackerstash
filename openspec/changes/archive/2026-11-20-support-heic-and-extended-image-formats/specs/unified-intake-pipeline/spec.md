# Delta Specification: unified-intake-pipeline

## Added Requirements

### Requirement: Extended image format and HEIC intake support
The system SHALL accept and process collectible photos in modern smartphone and desktop formats, including HEIC/HEIF (`.heic`, `.heif`, `.hif`), AVIF (`.avif`), TIFF (`.tif`, `.tiff`), BMP (`.bmp`), WebP (`.webp`), PNG, GIF, and JPEG.

#### Scenario: Ingesting HEIC photo in Chrome or Edge
- **WHEN** a user picks, drops, or pastes a `.heic` or `.heif` image file in a browser without native HEIC decoding
- **THEN** the client converts the file into an upright JPEG so preview, viewfinder auto-crop, and glare evaluation work immediately without broken image errors.

#### Scenario: Server-side intake of raw HEIC or archival scans
- **WHEN** a client or API client uploads a `.heic`, `.tiff`, or `.bmp` file to the catalog photo endpoint or vision identification endpoint
- **THEN** the backend decodes the image using `pillow_heif` or PIL, strips metadata, and normalizes it into optimized WebP for vault storage.

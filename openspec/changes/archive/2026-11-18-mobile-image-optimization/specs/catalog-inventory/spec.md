# Spec Delta: catalog-inventory

## ADDED Requirements

### Requirement: WebP-first server image storage and dimension cap
The system SHALL encode processed item photos without meaningful alpha transparency as lossy WebP (quality `82`) and cap the maximum output dimension at `1600` pixels on the longest edge, preserving PNG/WebP alpha only when transparency is present.

#### Scenario: Opaque photo uploaded as PNG or high-bitrate JPEG
- **WHEN** a user uploads or imports an opaque PNG or high-resolution JPEG photo
- **THEN** the system resizes the image so its longest edge is at most `1600` pixels and stores the processed image as WebP

#### Scenario: Transparent cutout preserves alpha
- **WHEN** background removal or rotation produces an image with meaningful alpha transparency
- **THEN** the system preserves the alpha channel in the stored output

### Requirement: Photo thumbnail derivative for list and gallery views
The system SHALL generate a WebP thumbnail derivative (maximum `480` pixels on the longest edge, quality `78`) whenever an item photo is uploaded, imported, or rotated, and expose `thumbnail_url` on photo responses and `primary_thumbnail_url` on item list/detail responses.

#### Scenario: Gallery and dashboard render thumbnails
- **WHEN** the collection gallery or dashboard renders item cards
- **THEN** each card requests `primary_thumbnail_url` (falling back to `primary_photo_url` if null) with lazy loading instead of the full-resolution photo

#### Scenario: Item photo rotation updates thumbnail
- **WHEN** a user rotates an item photo via the rotate endpoint
- **THEN** the system regenerates the thumbnail from the rotated image, deletes the superseded image and thumbnail files from storage, and returns the updated `thumbnail_url`

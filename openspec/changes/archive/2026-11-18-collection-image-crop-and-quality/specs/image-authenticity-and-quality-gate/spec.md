# Spec Delta: image-authenticity-and-quality-gate

## MODIFIED Requirements

### Requirement: Automatic background removal and detail enhancement
The system SHALL process every newly captured or uploaded item image through EXIF normalization, automatic deskew (for tilted rectangular subjects), consistent padded subject cropping (~5–8% breathing room around the detected subject perimeter), and detail enhancement before persistence, while preserving `object-contain` display in collection grid cards so subjects are never clipped by the UI.

#### Scenario: Processing a coin photo on neutral surface
- **WHEN** a user captures or uploads a coin photo
- **THEN** the server removes the surrounding background, crops tightly with 5–8% padding around the coin perimeter, and stores the cleaned image

#### Scenario: Processing a coin or slab photo on a textured or dark mat
- **WHEN** a user captures or uploads a photo of a coin, round, slab, note, or bar on a patterned (e.g., carbon-fiber) or dark mat
- **THEN** both client-side auto-crop and server-side processing isolate the foreground collectible without latching onto background mat texture, crop with 5–8% padding around the subject so rims/borders do not touch the frame edge, and store the cleaned image

#### Scenario: Processing a slightly tilted rectangular slab, note, or proof set
- **WHEN** a user captures or uploads a rectangular collectible (slab, note, proof set, or 2x2 flip) tilted by a small angle (e.g., 1°–15°)
- **THEN** the processing pipeline detects the dominant rectangle orientation, deskews the image upright before cropping, and stores a squared-up result without clipping corners

### Requirement: Deeper forensic checks for uploaded images
The system SHALL run extended verification on uploaded files—checking resolution, blur, localized specular glare over the subject, clipped subject edges, EXIF/software-edit indicators, synthetic/AI-generated artifacts, and Front/Back consistency.

#### Scenario: Uploading an edited or low-resolution screenshot
- **WHEN** a user uploads a low-resolution or software-edited screenshot of an auction listing
- **THEN** the upload verification returns `FLAGGED` with specific reasons (e.g., low resolution, screenshot/editing markers)

#### Scenario: Uploading an image with heavy localized specular glare
- **WHEN** a user uploads a photo where a bright specular reflection obscures a significant portion of the subject (even if overall image brightness is normal)
- **THEN** the verification gate flags the image with a clear glare warning (e.g., suggesting tilting the item or diffusing lighting) and allows the user to retake or override

#### Scenario: Uploading an image with clipped subject edges
- **WHEN** a user uploads a photo where the detected subject runs off or is clipped against two or more frame edges
- **THEN** the verification gate surfaces a non-blocking clipped-edge warning so the user can reframe or proceed intentionally

## ADDED Requirements

### Requirement: Idempotent backfill re-crop for existing collection photos
The system SHALL provide a management command to audit and re-process existing stored `ItemPhoto` assets using the improved deskew and padded auto-crop pipeline, updating stored image files and `width`/`height` metadata while supporting `--dry-run` and safe rollback/backup.

#### Scenario: Dry-run backfill audit on existing collection
- **WHEN** an operator runs the backfill command with `--dry-run`
- **THEN** the command reports which `ItemPhoto` records would be deskewed or tightened, plus any records skipped due to low confidence or already-tight framing, without modifying files or database rows

#### Scenario: Applying backfill re-crop to uncropped collection photos
- **WHEN** an operator runs the backfill command against stored collection photos
- **THEN** uncropped photos on textured/dark mats are deskewed and cropped with 5–8% padding, their `width` and `height` database fields are updated, and a backup of original files is retained or recoverable

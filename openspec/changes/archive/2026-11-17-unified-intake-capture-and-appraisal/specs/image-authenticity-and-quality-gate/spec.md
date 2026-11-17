# Spec Delta

## Purpose

Processes captured and uploaded item photos with background removal, quality scoring, physical-presence / anti-pic-of-a-pic verification, deeper upload forensics, and category-aware Front+Back enforcement.

## ADDED Requirements

### Requirement: Automatic background removal and detail enhancement
The system SHALL process every newly captured or uploaded item image through background removal, tight subject cropping, and detail enhancement before persistence.

#### Scenario: Processing a coin photo on neutral surface
- **WHEN** a user captures or uploads a coin photo
- **THEN** the server removes the surrounding background, crops tightly to the coin perimeter, and stores the cleaned image

### Requirement: Physical presence and anti-pic-of-a-pic verification
The system SHALL evaluate captured and uploaded images using heuristic and AI vision checks to detect photos of screens (moiré/pixel grids, bezel/UI chrome), printed photos, or non-physical depictions.

#### Scenario: User photographs a coin displayed on a laptop monitor
- **WHEN** a photo containing screen moiré patterns or monitor bezels is submitted
- **THEN** the verification gate flags `PIC_OF_PIC` with a clear warning explaining that a physical item was not confirmed

### Requirement: Deeper forensic checks for uploaded images
The system SHALL run extended verification on uploaded files—checking resolution, blur/glare, EXIF/software-edit indicators, synthetic/AI-generated artifacts, and Front/Back consistency.

#### Scenario: Uploading an edited or low-resolution screenshot
- **WHEN** a user uploads a low-resolution or software-edited screenshot of an auction listing
- **THEN** the upload verification returns `FLAGGED` with specific reasons (e.g., low resolution, screenshot/editing markers)

### Requirement: Category-aware Front and Back upload requirement
The system SHALL require both **Front (Obverse)** and **Back (Reverse)** images when uploading `COIN` or `PAPER` items, while permitting single-image uploads for `BAR`, `SLAB`, and `OTHER` categories.

#### Scenario: Uploading only one photo for a Coin
- **WHEN** a user selects the Upload path for a `COIN` or `PAPER` item with only one photo attached
- **THEN** the UI prompts for the missing Reverse (Back) photo before running identification and appraisal

### Requirement: Warn-and-flag override for failed checks
The system SHALL warn the user with specific findings when an image fails authenticity or quality checks, allow explicit user override to proceed, and persist `photo_verification_status` (`VERIFIED`, `FLAGGED`, `OVERRIDDEN`) on the item/photo.

#### Scenario: User overrides a verification warning for a legitimate vintage photo
- **WHEN** the verification gate flags an uploaded photo and the user clicks "Proceed Anyway"
- **THEN** the item is saved with `photo_verification_status = OVERRIDDEN` and displays an unverified-photo badge on `ItemDetailPage`


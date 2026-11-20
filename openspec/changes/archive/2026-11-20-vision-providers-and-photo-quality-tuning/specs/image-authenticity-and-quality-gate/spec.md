# Spec Delta: image-authenticity-and-quality-gate

## MODIFIED Requirements

### Requirement: Deeper forensic checks for uploaded images
The system SHALL run extended verification on uploaded files—checking resolution, blur, localized specular glare over the subject, clipped subject edges, EXIF/software-edit indicators, synthetic/AI-generated artifacts, and Front/Back consistency, while avoiding false-positive clipping flags when the subject is confirmed safely within frame borders.

#### Scenario: Uploading an edited or low-resolution screenshot
- **WHEN** a user uploads a low-resolution or software-edited screenshot of an auction listing
- **THEN** the upload verification returns `FLAGGED` with specific reasons (e.g., low resolution, screenshot/editing markers)

#### Scenario: Uploading an image with heavy localized specular glare
- **WHEN** a user uploads a photo where a bright specular reflection obscures a significant portion of the subject (even if overall image brightness is normal)
- **THEN** the verification gate flags the image with a clear glare warning (e.g., suggesting tilting the item or diffusing lighting) and allows the user to retake or override

#### Scenario: Uploading an image with clipped subject edges
- **WHEN** a user uploads a photo where the detected subject runs off or is clipped against two or more frame edges
- **THEN** the verification gate surfaces a non-blocking clipped-edge warning so the user can reframe or proceed intentionally

#### Scenario: Centered subject with textured background
- **WHEN** a user captures or uploads a photo where the collectible is centered safely within the frame on a textured surface (e.g. wood grain, fabric, paper) or uneven lighting
- **THEN** the verification gate verifies subject bounding box clearance and does NOT flag the photo with a clipped-edges quality warning

#### Scenario: Subject truly clipped near frame edges
- **WHEN** a user captures or uploads an image where the subject extends past the frame borders or touches edge pixels without clearance
- **THEN** the verification gate flags `clipped_edges` and advises the user to reframe with a small border

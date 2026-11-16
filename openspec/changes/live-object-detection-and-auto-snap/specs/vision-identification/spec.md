# Spec Delta

## MODIFIED Requirements

### Requirement: Camera and photo upload intake
The system SHALL allow users on mobile and desktop browsers to capture photos directly via the device camera or upload image files to initiate item identification, automatically detecting the framed subject's bounding box and shape (`coin`, `slab`, or `note`) in the live viewfinder without requiring upfront item-type preselection, and ensuring captured images are cropped to the subject framing and normalized to upright EXIF orientation before identification and upload.

#### Scenario: Capture obverse and reverse for identification
- **WHEN** a user captures or uploads one or more images in the intake flow and triggers identification
- **THEN** the system normalizes image orientation and dimensions, stores the images as draft item media, and returns structured candidate metadata for user review before saving

#### Scenario: Dynamic bounding-box detection without preselecting item type
- **WHEN** a user opens the guided camera in default Auto-Detect mode and holds the camera over a coin, bullion bar, graded slab, paper banknote, or Goldback
- **THEN** the viewfinder detects the foreground subject's bounding box and shape class (`coin`, `slab`, or `note`) in real time and adapts the on-screen target reticle around the item without requiring the user to preselect a category

#### Scenario: Default CoinSnap-style auto-snap on locked perfect shot
- **WHEN** Auto-Capture is active (enabled by default) and the detected subject remains centered, properly sized, unclipped, sharp, properly exposed, glare-free, and steady across consecutive evaluation ticks
- **THEN** the viewfinder displays lock-on progress, automatically triggers high-resolution capture with visual shutter feedback, crops around the detected subject region, and initializes the interactive review step with the detected aspect preset (`coin`, `slab`, or `note`)

# Spec Delta

## MODIFIED Requirements

### Requirement: Camera and photo upload intake
The system SHALL allow users on mobile and desktop browsers to capture photos directly via the device camera or upload image files to initiate item identification, ensuring captured images match the visible viewfinder framing and are normalized to upright EXIF orientation before identification and upload.

#### Scenario: Capture obverse and reverse for identification
- **WHEN** a user captures or uploads one or more images in the intake flow and triggers identification
- **THEN** the system normalizes image orientation and dimensions, stores the images as draft item media, and returns structured candidate metadata for user review before saving

#### Scenario: Viewfinder-aligned high-resolution capture
- **WHEN** a user frames an item inside the guided camera viewfinder and captures a photo
- **THEN** the resulting image matches the visible zoomed viewfinder crop rather than uncropped outer sensor margins

#### Scenario: Upright EXIF orientation on mobile capture and upload
- **WHEN** a user captures or selects a portrait or rotated photo via native mobile camera or file picker
- **THEN** the system decodes and bakes EXIF orientation into upright pixel dimensions before previewing, identifying, and uploading the photo

## ADDED Requirements

### Requirement: Real-time capture quality, glare, and auto-capture guidance
The system SHALL evaluate live viewfinder frames within the target guide area for sharpness, exposure, stability, and specular glare, and SHALL provide an optional Auto-Capture mode that triggers capture when all quality gates are satisfied.

#### Scenario: Specular glare warning on reflective coins or slabs
- **WHEN** live viewfinder analysis detects concentrated saturated highlights over the framed subject
- **THEN** the system displays a glare warning advising the user to tilt the item or diffuse lighting and pauses auto-capture until glare clears

#### Scenario: Auto-capture when steady and sharp
- **WHEN** Auto-Capture is enabled and the framed subject remains sharp, properly exposed, glare-free, and steady for consecutive evaluation frames
- **THEN** the system automatically captures the photo without requiring a manual shutter tap

### Requirement: Interactive Front and Back crop and rotate review
The system SHALL present an interactive crop, zoom, and 90-degree rotation review step for each captured Front (Obverse) and Back (Reverse) image before confirming, and SHALL allow re-cropping, rotating, or retaking any draft photo prior to saving.

#### Scenario: Review and adjust Front photo before capturing Back
- **WHEN** the user captures the Front (Obverse) photo in guided camera mode
- **THEN** the system displays an interactive review view allowing the user to pan, pinch/zoom to the subject, rotate in 90-degree increments, or retake before advancing to the Back (Reverse) step

#### Scenario: Re-crop or rotate draft photos on the scan page
- **WHEN** a user reviews draft Obverse or Reverse thumbnails on the scan intake page
- **THEN** the user can open the interactive crop and rotate editor on any draft photo before saving the item

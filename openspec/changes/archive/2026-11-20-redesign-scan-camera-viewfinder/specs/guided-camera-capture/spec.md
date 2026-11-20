# Spec Delta: guided-camera-capture

## ADDED Requirements

### Requirement: Unobstructed camera viewfinder presentation and explicit activation
The intake camera experience SHALL initialize video streaming only upon explicit user activation, provide an unobstructed live video preview without opaque darkening overlays or overlapping primary action controls, and support dedicated full-screen guided modal scanning.

#### Scenario: User explicitly activates camera from intake
- **WHEN** a user navigates to the Scan & Add intake interface
- **THEN** camera video streaming remains inactive until the user clicks an activation action, preventing unprompted browser permission requests

#### Scenario: Unobstructed live viewfinder preview
- **WHEN** the live camera preview is active in the intake interface
- **THEN** alignment guides render with transparent corner brackets without an opaque outer shadow vignette, and capture and close controls render outside the live video frame

#### Scenario: Launching full-screen guided camera modal from intake
- **WHEN** a user initiates a guided camera scan from the intake interface
- **THEN** the system launches a full-screen guided capture modal with category-adaptive reticles, real-time framing, zoom, flash/torch controls, and dual-side capture guidance

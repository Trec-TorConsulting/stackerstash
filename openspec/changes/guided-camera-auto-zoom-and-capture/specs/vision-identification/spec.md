# Spec Delta

## ADDED Requirements

### Requirement: Hands-free auto-capture on steady, well-framed shots
The system SHALL provide an optional hands-free Auto-Capture mode in the guided camera viewfinder that automatically captures a photo once consecutive live frames are well-lit, sharp, and physically steady, with clear countdown feedback and a flip delay between obverse and reverse steps.

#### Scenario: Auto-capture fires after consecutive steady good frames
- **WHEN** Auto-Capture is enabled and the live viewfinder detects consecutive well-lit, sharp, and stable frames meeting the lock-on threshold
- **THEN** the system displays a clear hold-steady indicator and automatically captures the current frame without requiring a manual shutter tap

#### Scenario: Cooldown before arming reverse auto-capture
- **WHEN** the front (obverse) photo is captured and the modal advances to Step 2 (Back / Reverse)
- **THEN** Auto-Capture pauses briefly so the user has time to flip the item before evaluating frames for the second shot

#### Scenario: User can toggle Auto-Capture off for manual shutter
- **WHEN** the user disables Auto-Capture in the camera controls
- **THEN** the system never fires the shutter automatically and waits for the user's manual capture tap

### Requirement: Smart auto-zoom framing with manual override
The system SHALL provide an optional Auto-Zoom mode that detects when a centered item is too small inside the reticle and smoothly zooms in (via hardware camera zoom when supported or reticle-centered digital crop otherwise), while allowing immediate manual zoom override.

#### Scenario: Auto-zoom steps in when subject is small in the reticle
- **WHEN** Auto-Zoom is enabled and live frame analysis indicates the subject's detail is concentrated in a small inner region relative to the full reticle
- **THEN** the system smoothly increases zoom within a safe upper bound so the item fills more of the captured frame

#### Scenario: Manual zoom slider overrides auto-zoom
- **WHEN** the user adjusts the zoom slider manually while Auto-Zoom is active
- **THEN** the system yields to the user's chosen zoom level and disables Auto-Zoom for the current session so it does not fight manual adjustment


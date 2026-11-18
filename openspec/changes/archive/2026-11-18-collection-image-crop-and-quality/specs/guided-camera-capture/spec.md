# Spec Delta: guided-camera-capture

## ADDED Requirements

### Requirement: Capture-time glare and clipped-edge warnings
The guided camera and intake staging flow SHALL evaluate captured or staged frames for localized specular glare over the subject and clipped subject edges, surfacing a clear non-blocking warning and retake prompt when detected.

#### Scenario: Heavy glare detected on a captured or staged photo
- **WHEN** a user captures or stages a photo with severe specular glare obscuring the coin, capsule, or slab surface
- **THEN** the UI displays a glare warning badge/banner on the staged photo recommending a retake with angled lighting, while still allowing the user to proceed if desired

#### Scenario: Clipped subject detected on a captured or staged photo
- **WHEN** auto-crop analysis detects that the subject is clipped against the frame border
- **THEN** the UI keeps the original frame uncropped and displays a concise framing hint ("Subject near edge — reframe for full border") so the user can retake before saving

# Spec Delta

## ADDED Requirements

### Requirement: Hardware still capture with continuous autofocus
When the browser supports the MediaStream Image Capture capability, the guided camera SHALL request continuous autofocus on the active video track (when supported by hardware capabilities) and trigger a full-resolution hardware still capture (`takePhoto`) on shutter press rather than grabbing a lower-resolution video preview frame.

#### Scenario: Hardware still capture on supported browsers
- **WHEN** a user taps Capture in the guided camera on a browser supporting `ImageCapture.takePhoto()`
- **THEN** the system captures a full-resolution still photo from the camera sensor, applies any active zoom crop and max-dimension normalization, and advances to the next step or completes capture

#### Scenario: Continuous autofocus requested when supported
- **WHEN** the guided camera opens a video stream whose track capabilities include continuous `focusMode`
- **THEN** the system applies continuous autofocus constraints to the video track without throwing on devices that omit focus controls

### Requirement: Instant burst best-frame fallback
When hardware `ImageCapture.takePhoto()` is unavailable or fails (such as on iOS Safari), the guided camera SHALL capture a rapid short burst of frames on shutter press and automatically select the sharpest frame based on edge contrast, rather than requiring the user to hold still before tapping Capture.

#### Scenario: Burst best-frame selection on fallback browsers
- **WHEN** a user taps Capture on a browser without `ImageCapture.takePhoto()` support
- **THEN** the system samples a short burst of consecutive video frames, scores each frame's sharpness, and outputs the sharpest frame as the captured image

### Requirement: Non-blocking advisory framing feedback and dual-step native capture
The guided camera's live quality indicator SHALL provide non-blocking advisory feedback (lighting, glare, and framing) without preventing or delaying shutter capture, and the native device camera trigger SHALL remain available for both front (obverse) and back (reverse) capture steps.

#### Scenario: Capture enabled regardless of stability state
- **WHEN** the camera stream is ready while the user's hand is slightly moving
- **THEN** the Capture button remains enabled and responsive without forcing the user to wait for a stability lock

#### Scenario: Native camera capture available on back step
- **WHEN** the user completes the front photo and advances to the back (reverse) step
- **THEN** the user can trigger the device's native camera input for the back photo in addition to the live viewfinder shutter


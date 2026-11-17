# Spec Delta

## Purpose

Provides live collectible placement detection, visual bounding-box feedback, and reliable Auto-Snap capture in the guided camera viewfinder.

## ADDED Requirements

### Requirement: Live subject bounding-box feedback
The guided camera viewfinder SHALL display a live smoothed bounding-box overlay around the detected collectible item whenever a foreground subject is detected.

#### Scenario: Subject detected in viewfinder
- **WHEN** the live camera preview detects a collectible item inside the frame
- **THEN** the viewfinder renders a bounding-box indicator positioned over the detected subject and updates its visual state when framing is locked

#### Scenario: No subject detected
- **WHEN** the live camera preview detects no foreground subject
- **THEN** no live subject bounding box is rendered and the advisory pill prompts the user to place an item in frame

### Requirement: Smoothed subject tracking across frames
The guided camera SHALL smooth the detected subject bounding box across consecutive evaluation ticks and detect subject motion between ticks.

#### Scenario: Minor frame-to-frame jitter
- **WHEN** the detected subject bounding box shifts slightly between consecutive 200ms ticks
- **THEN** the smoothed bounding box dampens the jitter and does not falsely treat the subject as moving

### Requirement: Robust foreground detection on textured or shadowed surfaces
The subject detector SHALL isolate foreground collectibles even when a portion of the frame border contains shadows, surface texture, or fingers.

#### Scenario: Uneven border lighting or hand near edge
- **WHEN** a coin, bar, slab, or note is centered over a textured mat or wood surface with a shadow or finger along one edge
- **THEN** the detector still identifies the centered collectible without losing the subject or falsely clipping the entire frame

### Requirement: Reliable Auto-Snap for shiny collectibles
The guided camera SHALL enable Auto-Snap by default in auto mode and trigger automatic capture when framing is locked and steady, tolerating minor specular highlights and a brief single-tick flicker.

#### Scenario: Steady locked item triggers Auto-Snap
- **WHEN** Auto-Snap is enabled and a collectible remains locked and steady without severe glare across the lock window
- **THEN** the camera automatically captures the frame without requiring a manual shutter press

#### Scenario: Single-tick metric flicker during lock
- **WHEN** Auto-Snap lock progress is advancing and a single evaluation tick briefly drops steadiness or sharpness
- **THEN** lock progress pauses or steps back gracefully rather than immediately resetting to zero

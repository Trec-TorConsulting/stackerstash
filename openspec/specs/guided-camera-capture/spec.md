# guided-camera-capture Specification

## Purpose
Provides a CoinSnap-style live camera viewfinder with alignment reticles, zoom controls, real-time framing/sharpness/lighting guidance, and a guided Front-to-Back capture sequence.

## Requirements

### Requirement: Live alignment reticle and zoom controls
The PWA SHALL provide a live camera viewfinder using `getUserMedia` with a category-adaptive alignment reticle (circular for coins/rounds, rectangular for paper currency/slabs/bars) and zoom controls (1x–3x optical or digital fallback).

#### Scenario: Opening guided camera for a coin
- **WHEN** a user selects "Take Photo" on Scan & Add
- **THEN** the live viewfinder opens with a centered circular reticle, zoom slider/presets, and torch toggle (when supported by device hardware)

### Requirement: Real-time framing, sharpness, and lighting guidance
The viewfinder SHALL analyze video frames client-side before capture and display live guidance pills for subject centering, focus sharpness, and lighting exposure.

#### Scenario: Camera detects blur or low light before shutter
- **WHEN** the live preview frame is excessively blurry or underexposed
- **THEN** the viewfinder displays a non-intrusive hint (e.g., "Hold steady — focus blurry" or "Move to brighter light") and highlights the reticle amber until quality improves

### Requirement: Guided Front and Back capture flow
The camera flow SHALL guide the user to capture **Front (Obverse)** first, display an auto-cropped local preview when enabled, and immediately prompt for **Back (Reverse)** while allowing single-photo completion for bars or slabs, retaining the normalized uncropped capture for authoritative server-side vault trimming unless the user manually crops or undoes auto-crop.

#### Scenario: Capturing Front and Back of a raw coin
- **WHEN** the user captures the Front (Obverse) photo with auto-crop enabled
- **THEN** the camera locks a preview thumbnail, advances the prompt to "Now capture Back (Reverse)", and retains the normalized uncropped original for upload with `auto_crop=true`

### Requirement: Graceful fallback when camera API is unavailable
The system SHALL fall back to native `<input type="file" capture="environment">` when `getUserMedia` is denied or unsupported by the browser.

#### Scenario: User denies camera permission
- **WHEN** the browser rejects `getUserMedia` permission
- **THEN** the UI displays a concise fallback message and offers the native camera/file picker without blocking intake

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

### Requirement: Capture-time glare and clipped-edge warnings
The guided camera and intake staging flow SHALL evaluate captured or staged frames for localized specular glare over the subject and clipped subject edges, surfacing a clear non-blocking warning and retake prompt when detected.

#### Scenario: Heavy glare detected on a captured or staged photo
- **WHEN** a user captures or stages a photo with severe specular glare obscuring the coin, capsule, or slab surface
- **THEN** the UI displays a glare warning badge/banner on the staged photo recommending a retake with angled lighting, while still allowing the user to proceed if desired

#### Scenario: Clipped subject detected on a captured or staged photo
- **WHEN** auto-crop analysis detects that the subject is clipped against the frame border
- **THEN** the UI keeps the original frame uncropped and displays a concise framing hint ("Subject near edge — reframe for full border") so the user can retake before saving

### Requirement: Mobile-optimized client upload encoding and dimension cap
The client capture, auto-crop, and upload normalization pipeline SHALL cap output dimensions at `1600` pixels on the longest edge and encode uploads at `0.82–0.84` quality (using `image/webp` when supported by the browser canvas, with `image/jpeg` fallback).

#### Scenario: Guided camera capture produces compact upload
- **WHEN** the guided camera captures a frame
- **THEN** the resulting upload file is bounded to at most `1600` pixels on its longest edge and encoded at `0.82–0.84` quality

#### Scenario: Client auto-crop respects mobile dimension and quality bounds
- **WHEN** client-side auto-crop crops a high-resolution photo from the camera or file picker
- **THEN** the cropped output is capped at `1600` pixels on its longest edge and encoded at `0.82–0.84` quality

#### Scenario: Upload normalization compresses medium-sized picker photos
- **WHEN** a user selects a JPEG, PNG, or WebP photo larger than `350,000` bytes
- **THEN** the client normalizes and compresses it to at most `1600` pixels at `0.82–0.84` quality before upload

### Requirement: Preview-only client auto-crop with server-authoritative upload
When auto-crop is enabled during intake, the client SHALL treat client-side edge-detection cropping as a non-destructive local preview and AI identification input while uploading the normalized uncropped original with `auto_crop=true` (sequentially with `OBVERSE` before `REVERSE` per item), and SHALL send `auto_crop=false` only when the user manually crops/rotates, clicks Undo Auto, or disables auto-crop.

#### Scenario: Client auto-crop succeeds during intake staging
- **WHEN** the user captures or selects an item photo with auto-crop enabled and does not manually adjust or undo the crop
- **THEN** the staging UI displays the client auto-cropped preview (and uses it for AI identification), while saving the item uploads the normalized uncropped original with `auto_crop=true` so the server performs category-aware trimming, deskewing, and Obverse/Reverse size alignment

#### Scenario: Batch cataloging preserves preview identification and sequential server symmetry
- **WHEN** the user runs Batch Catalog on paired items with auto-crop enabled
- **THEN** AI identification runs on the staged preview images, and photo uploads send each photo's normalized uncropped original with `auto_crop=true` sequentially (`OBVERSE` before `REVERSE` per item) so server-side sibling size alignment runs

#### Scenario: User opens manual crop/rotate on a preview-cropped photo
- **WHEN** the user opens the manual crop/rotate editor on a staged photo that had a client auto-crop preview applied and confirms custom framing
- **THEN** the editor loads the uncropped original (when available) so any edge clipped in the preview can be recovered, and saving uploads the user-framed image with `auto_crop=false`

#### Scenario: User clicks Undo Auto on a preview-cropped photo
- **WHEN** the user clicks Undo Auto on a staged photo
- **THEN** the client restores the uncropped original for preview and uploads it with `auto_crop=false` so the server respects the user's explicit request to keep the full frame uncropped

#### Scenario: User disables auto-crop
- **WHEN** the user toggles auto-crop off during intake
- **THEN** the client skips client-side auto-crop preview and uploads the normalized uncropped image with `auto_crop=false`

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

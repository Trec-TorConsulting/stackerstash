# Spec Delta

## Purpose

Provides a CoinSnap-style live camera viewfinder with alignment reticles, zoom controls, real-time framing/sharpness/lighting guidance, and a guided Front-to-Back capture sequence.

## ADDED Requirements

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
The camera flow SHALL guide the user to capture **Front (Obverse)** first, auto-crop to the reticle, and immediately prompt for **Back (Reverse)** while allowing single-photo completion for bars or slabs.

#### Scenario: Capturing Front and Back of a raw coin
- **WHEN** the user captures the Front (Obverse) photo
- **THEN** the camera locks a preview thumbnail, advances the prompt to "Now capture Back (Reverse)", and attaches both labeled images to the intake form

### Requirement: Graceful fallback when camera API is unavailable
The system SHALL fall back to native `<input type="file" capture="environment">` when `getUserMedia` is denied or unsupported by the browser.

#### Scenario: User denies camera permission
- **WHEN** the browser rejects `getUserMedia` permission
- **THEN** the UI displays a concise fallback message and offers the native camera/file picker without blocking intake


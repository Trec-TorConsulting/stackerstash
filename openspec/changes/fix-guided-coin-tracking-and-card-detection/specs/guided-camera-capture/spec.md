# Spec Delta: guided-camera-capture

## MODIFIED Requirements

### Requirement: Live alignment reticle and zoom controls
The PWA SHALL provide a live camera viewfinder using `getUserMedia` with category-adaptive alignment reticles (circular for coins/rounds, 5:7 rounded rectangle for trading cards, vertical rectangle for slabs/bars, and wide rectangle for paper currency) and zoom controls (1x–3x optical or digital fallback).

#### Scenario: Opening guided camera for a coin
- **WHEN** a user selects "Take Photo" or "Guided Scan" for a coin
- **THEN** the live viewfinder opens with a centered circular reticle, zoom slider/presets, and torch toggle (when supported by device hardware)

#### Scenario: Selecting trading card reticle mode
- **WHEN** a user switches the reticle mode to Card or opens guided capture for a trading card
- **THEN** the live viewfinder renders a vertical rounded-rectangle reticle with approximately 5:7 (2.5" x 3.5") aspect ratio

### Requirement: Live subject bounding-box feedback
The guided camera viewfinder SHALL evaluate frames client-side and display a live smoothed bounding-box overlay accurately aligned to the rendered video viewport without lateral displacement or margin drift.

#### Scenario: Subject detected in viewfinder
- **WHEN** the live camera preview detects a collectible item inside the frame
- **THEN** the viewfinder renders a bounding-box indicator positioned over the detected subject matching the visible video crop and updates its visual state when framing is locked

#### Scenario: Coin tracking closes in on centered coin
- **WHEN** a circular coin is centered in the camera frame with uneven background shadows or holding fingers along the margin
- **THEN** the live subject bounding box centers over the coin and closes in around its rim rather than drifting or sticking to the frame's right margin

#### Scenario: No subject detected
- **WHEN** the live camera preview detects no foreground subject
- **THEN** no live subject bounding box is rendered and the advisory pill prompts the user to place an item in frame

### Requirement: Robust foreground detection on textured or shadowed surfaces
The subject detector SHALL isolate foreground collectibles using 2D connected-component saliency analysis, morphological hole filling to capture flat/reflective coin fields, border margin exclusion, and center-distance weighting to eliminate perimeter shadows and hand interference.

#### Scenario: Uneven border lighting or hand near edge
- **WHEN** a coin, bar, slab, card, or note is centered over a textured mat or wood surface with a shadow or finger along one edge
- **THEN** the detector still identifies the centered collectible without losing the subject, splitting circular rims into disjoint slivers, or falsely clipping the entire frame

#### Scenario: Coin with reflective or smooth central field
- **WHEN** a shiny bullion round or coin with a reflective flat field is placed in frame
- **THEN** hole-filling and connected component analysis treat the coin as a unified circular subject rather than fragmented edge pieces

## ADDED Requirements

### Requirement: First-class trading card shape detection and framing
The guided camera and live frame evaluation engine SHALL classify detected items matching standard trading card physical aspect ratios (0.64–0.78 or 1.28–1.56) and corner radii as `card`, display a dedicated "Detected: Trading Card" indicator, and support auto-capture lock.

#### Scenario: Auto-detecting a trading card in viewfinder
- **WHEN** a user holds a standard sports card or TCG card inside the Auto-Detect viewfinder
- **THEN** the system classifies the shape as `card`, displays "Detected: Trading Card", and frames the item with the card reticle

### Requirement: Accessible modal exit and capture cancellation
The guided camera modal SHALL provide accessible ways to exit and cancel capture at any point without taking a photo, including a prominent thumb-reachable "Cancel" action in the primary controls area, keyboard `Escape` dismissal, and top-right close action.

#### Scenario: User cancels capture from the bottom control bar
- **WHEN** a user opens guided camera and clicks or taps the "Cancel" button in the bottom control bar
- **THEN** the camera stream stops immediately, the modal closes, and the user returns to the intake form without capturing or staging photos

#### Scenario: User presses Escape key on desktop
- **WHEN** the guided camera modal is open and the user presses the `Escape` key on the keyboard
- **THEN** the camera stream stops and the modal closes cleanly

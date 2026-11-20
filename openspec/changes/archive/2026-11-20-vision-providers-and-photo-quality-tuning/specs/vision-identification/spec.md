# Spec Delta: vision-identification

## MODIFIED Requirements

### Requirement: Camera and photo upload intake
The system SHALL allow users on mobile and desktop browsers to capture photos directly via the device camera or upload image files to initiate item identification, avoiding duplicate identification requests while capturing a Front and Back pair, ensuring captured images are cropped to the subject framing and normalized to upright EXIF orientation before identification and upload, supporting resilient fallback across multiple Vision AI providers (Gemini, Groq, OpenRouter, Ollama), and allowing self-hosted Ollama deployments on cluster service DNS when allowlisted.

#### Scenario: Capture obverse and reverse for identification
- **WHEN** a user captures or uploads one or more images in the intake flow and triggers identification
- **THEN** the system normalizes image orientation and dimensions, stores the images as draft item media, and returns structured candidate metadata for user review before saving

#### Scenario: Viewfinder-aligned high-resolution capture
- **WHEN** a user frames an item inside the guided camera viewfinder and captures a photo
- **THEN** the resulting image matches the visible zoomed viewfinder crop rather than uncropped outer sensor margins

#### Scenario: Upright EXIF orientation on mobile capture and upload
- **WHEN** a user captures or selects a portrait or rotated photo via native mobile camera or file picker
- **THEN** the system decodes and bakes EXIF orientation into upright pixel dimensions before previewing, identifying, and uploading the photo

#### Scenario: Dynamic bounding-box detection without preselecting item type
- **WHEN** a user opens the guided camera in default Auto-Detect mode and holds the camera over a coin, bullion bar, graded slab, paper banknote, or Goldback
- **THEN** the viewfinder detects the foreground subject's bounding box and shape class (`coin`, `slab`, or `note`) in real time and adapts the on-screen target reticle around the item without requiring the user to preselect a category

#### Scenario: Default CoinSnap-style auto-snap on locked perfect shot
- **WHEN** Auto-Capture is active (enabled by default) and the detected subject remains centered, properly sized, unclipped, sharp, properly exposed, glare-free, and steady across consecutive evaluation ticks
- **THEN** the viewfinder displays lock-on progress, automatically triggers high-resolution capture with visual shutter feedback, crops around the detected subject region, and initializes the interactive review step with the detected aspect preset (`coin`, `slab`, or `note`)

#### Scenario: Wait for reverse photo in camera Front-and-Back flow
- **WHEN** a user takes a Front (`OBVERSE`) photo using the camera intake button
- **THEN** the system stages and auto-crops the Front photo locally without immediately calling Vision AI, prompting for **Snap Back** and automatically running identification once the Back (`REVERSE`) photo is captured (unless the user explicitly clicks **Identify with AI** for a single-sided item)

#### Scenario: Gemini 429 quota exhaustion with Groq fallback
- **WHEN** Gemini vision returns an HTTP 429 quota exhaustion error and Groq is configured
- **THEN** the identification pipeline cascades to supported Groq vision models (`llama-3.2-11b-vision-preview` / `llama-3.2-90b-vision-preview`) and successfully identifies the collectible

#### Scenario: Local cluster Ollama intake
- **WHEN** a user or environment configures Ollama URL using an allowlisted cluster hostname (e.g. `http://ollama.ollama.svc.cluster.local:11434`)
- **THEN** URL validation accepts the allowlisted cluster service URL without triggering SSRF suffix rejections

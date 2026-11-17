# Spec Delta

## MODIFIED Requirements

### Requirement: Camera and photo upload intake
The system SHALL allow users on mobile and desktop browsers to capture photos directly via the device camera or upload image files to initiate item identification, avoiding duplicate identification requests while capturing a Front and Back pair, and ensuring captured images are cropped to the subject framing and normalized to upright EXIF orientation before identification and upload.

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

### Requirement: Multimodal Vision AI identification with fallback
The system SHALL identify items using a local-first cascade—checking image hash caches, decoding barcodes/QR codes, running local OCR, and matching the static reference catalog before invoking a text-only LLM tier on rich OCR text or escalating to Vision AI only when local and text tiers cannot resolve the item.

#### Scenario: Identify a Geiger silver bar or paper bill via Vision AI
- **WHEN** a user submits a photo of a Geiger silver slab or US/foreign paper banknote that requires Vision AI escalation
- **THEN** the system returns structured JSON fields (category, metal/weight or denomination/series, refiner/issuer, confidence score, and any unverified condition estimate clearly separated from certified grades) pre-filled into the item form

#### Scenario: Cascade across Gemini models on HTTP 429 quota error
- **WHEN** the primary Gemini model returns HTTP 429 or a quota-exhausted error
- **THEN** the system automatically retries the request against the next configured Gemini model in the cascade before falling back to secondary providers

#### Scenario: Resolve item locally via barcode, OCR, and static catalog without AI
- **WHEN** submitted photo(s) contain readable slab text, Goldback markings, or bullion inscriptions that match the static reference catalog
- **THEN** the system returns structured candidate metadata in under one second using zero AI tokens and labels the provider as local/OCR

#### Scenario: Text-only LLM tier when OCR extracts text without a static match
- **WHEN** local OCR extracts substantial text from the image(s) that does not match a static catalog entry
- **THEN** the system sends only the extracted OCR text (without images) to the configured LLM before considering Vision AI

#### Scenario: Compact Vision AI escalation with fallback
- **WHEN** local, OCR, and text-only tiers cannot confidently identify the item
- **THEN** the system sends a compact composite image to Gemini Vision (falling back to Groq, OpenRouter, or Ollama) and returns structured JSON fields or a `MANUAL_FALLBACK` response if all providers fail

#### Scenario: Fallback to Ollama when Gemini fails
- **WHEN** Gemini returns a rate-limit or network error and the workspace has an Ollama URL configured
- **THEN** the system retries identification against the Ollama vision model and labels the provider used

#### Scenario: Graceful manual entry when no AI provider is configured
- **WHEN** neither Gemini nor Ollama is configured or both fail
- **THEN** the system preserves the uploaded photos and lets the user complete and save the item manually without data loss

## ADDED Requirements

### Requirement: Fast basic bulk add mode
The system SHALL provide a Fast Bulk Mode for batch intake that identifies items using local auto-crop, barcode/QR decoding, OCR, and static reference catalog matching only, uploads photos in parallel, computes immediate spot-melt valuation, and skips or defers full AI appraisal.

#### Scenario: Fast bulk catalog of paired photos
- **WHEN** a user enables Fast Bulk Mode on a batch of Front/Back photo pairs and starts cataloging
- **THEN** the system identifies each pair via the local-only pipeline (zero Vision AI calls), creates each item with `auto_appraise=false`, uploads both photos in parallel, and applies live spot-melt valuation immediately

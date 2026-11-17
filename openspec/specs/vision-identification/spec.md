# vision-identification Specification

## Purpose
Provides mobile-first camera capture and photo upload workflows that identify coins, paper currency, bullion bars, rounds, and graded slabs using Vision AI and barcode/QR/OCR cert extraction.

## Requirements

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

### Requirement: Slab barcode, QR, and cert number extraction
The system SHALL detect and parse grading slab barcodes, QR codes, and printed certification numbers (PCGS, NGC, PMG, PCGS Banknote, CACG, ANACS) without inventing certification numbers.

#### Scenario: Scan or extract PCGS/NGC cert number
- **WHEN** an image contains a readable slab barcode, QR code, or cert label
- **THEN** the system extracts the exact grading service and certification number and surfaces a verification link

#### Scenario: Bounded identification deadline and OCR fallback guard
- **WHEN** upstream vision providers fail or cascade near the request budget
- **THEN** `identify_images` enforces a `48.0s` total deadline (safely below Gunicorn's `60s` production worker timeout), preprocesses local `RapidOCR` inputs at `800px` max dimension, and skips `RapidOCR` when fewer than `10.0s` remain—returning a structured `MANUAL_FALLBACK` response instead of a worker-timeout `500`

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

### Requirement: Gemini quota resilience and payload optimization
The system SHALL minimize Gemini image token consumption and avoid redundant quota-exhausted retries during both identification and AI appraisal.

#### Scenario: Appraisal photos are downscaled before sending to AI
- **WHEN** the system prepares stored item photos for multimodal AI appraisal
- **THEN** it normalizes orientation and downscales oversized images before encoding rather than transmitting raw full-resolution files

#### Scenario: Short-circuit ungrounded appraisal retry on HTTP 429
- **WHEN** a grounded Gemini AI appraisal request fails with HTTP 429
- **THEN** the system does not immediately issue a second ungrounded Gemini call to the same exhausted model and instead advances to the next fallback model or provider

### Requirement: Local OCR and text-only catalog fallback
The system SHALL run local in-process OCR when multimodal vision providers are unavailable or fail, extract structured numismatic/currency hints, and perform a text-only LLM parse or deterministic catalog/cert/melt lookup so readable items return populated metadata instead of an empty form.

#### Scenario: Extract slab or banknote text via local OCR and text-only lookup
- **WHEN** all multimodal vision providers fail or are unconfigured and the uploaded image contains readable slab, banknote, or coin text
- **THEN** the system extracts text locally via OCR, parses structured hints (year, denomination, grading service, cert number, serial number, metal/purity), enriches them via text-only AI or PCGS/Numista/catalog lookup, and returns a populated candidate labeled with the fallback provider

#### Scenario: Send OCR text without images to text-only fallback
- **WHEN** local OCR extracts text and a lightweight text-only AI provider (such as Gemini Flash-Lite text, Groq, OpenRouter, or Ollama) is available
- **THEN** the system sends only the extracted text prompt with no image payload to structure the candidate metadata

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

### Requirement: Real-time capture quality, glare, and auto-capture guidance
The system SHALL evaluate live viewfinder frames within the target guide area for sharpness, exposure, stability, and specular glare, and SHALL provide an optional Auto-Capture mode that triggers capture when all quality gates are satisfied.

#### Scenario: Specular glare warning on reflective coins or slabs
- **WHEN** live viewfinder analysis detects concentrated saturated highlights over the framed subject
- **THEN** the system displays a glare warning advising the user to tilt the item or diffuse lighting and pauses auto-capture until glare clears

#### Scenario: Auto-capture when steady and sharp
- **WHEN** Auto-Capture is enabled and the framed subject remains sharp, properly exposed, glare-free, and steady for consecutive evaluation frames
- **THEN** the system automatically captures the photo without requiring a manual shutter tap

### Requirement: Interactive Front and Back crop and rotate review
The system SHALL present an interactive crop, zoom, and 90-degree rotation review step for each captured Front (Obverse) and Back (Reverse) image before confirming, and SHALL allow re-cropping, rotating, or retaking any draft photo prior to saving.

#### Scenario: Review and adjust Front photo before capturing Back
- **WHEN** the user captures the Front (Obverse) photo in guided camera mode
- **THEN** the system displays an interactive review view allowing the user to pan, pinch/zoom to the subject, rotate in 90-degree increments, or retake before advancing to the Back (Reverse) step

#### Scenario: Re-crop or rotate draft photos on the scan page
- **WHEN** a user reviews draft Obverse or Reverse thumbnails on the scan intake page
- **THEN** the user can open the interactive crop and rotate editor on any draft photo before saving the item

### Requirement: Goldback denomination, weight, and taxonomy normalization
The system SHALL recognize Goldback Aurum 24K gold foil currency notes across all official denominations (`1/4`, `1/2`, `1`, `2`, `5`, `10`, `25`, `50`, `100`) and US state/local series, and SHALL deterministically normalize their category (`PAPER`), country (`United States`), metal (`GOLD`), purity (`0.9999`), weight unit (`OZ_T`), and exact troy-ounce gold weight (`denomination / 1000`).

#### Scenario: Identify a fractional or multi-unit Goldback note
- **WHEN** Vision AI or OCR identifies a Goldback note of denomination `1/4`, `1/2`, `1`, `2`, `5`, `10`, `25`, `50`, or `100`
- **THEN** the candidate normalizer sets `category` to `PAPER`, `country` to `United States`, `metal_type` to `GOLD`, `purity` to `0.9999`, `weight_unit` to `OZ_T`, and `weight_value` to `denomination / 1000` (e.g., `0.00025` for `1/4 Goldback` and `0.002` for `2 Goldback`), never confusing fractional Goldbacks with `1/4 oz` or `1/2 oz` bullion

### Requirement: Gemini vision model cascade avoids retired models
`GEMINI_VISION_MODELS` SHALL only include active Gemini vision models (`gemini-2.5-flash` and `gemini-2.5-flash-lite`) and SHALL NOT attempt retired models such as `gemini-2.0-flash`.

#### Scenario: Gemini rate limit falls back without 404 wasted call
- **WHEN** `gemini-2.5-flash` and `gemini-2.5-flash-lite` return 429 rate-limit responses
- **THEN** the Gemini cascade stops without issuing a request to `gemini-2.0-flash` and proceeds to the next provider in the fallback chain

### Requirement: Ollama vision parsing handles empty, NDJSON, and non-JSON payloads within bounded timeout
`_call_ollama_vision` SHALL enforce a bounded timeout (default `25.0` seconds) and parse either standard JSON responses or newline-delimited JSON (NDJSON) chunks, raising a descriptive `ValueError` when the body or extracted message content is empty or unparseable.

#### Scenario: Ollama returns NDJSON chunks
- **WHEN** Ollama responds with multiple newline-delimited JSON objects containing `message.content`
- **THEN** `_call_ollama_vision` concatenates the content chunks and extracts the JSON identification object

#### Scenario: Ollama returns empty body or non-JSON text
- **WHEN** Ollama responds with HTTP 200 and an empty body or unparseable text
- **THEN** `_call_ollama_vision` raises a descriptive `ValueError` without crashing the fallback chain

### Requirement: Vision identification respects request time budget and avoids Gunicorn worker timeout
`identify_images` SHALL track elapsed time across provider attempts so fallback providers do not starve local OCR, `_preprocess_image_for_ocr` SHALL downscale to `max_dimension=1200` and encode as JPEG (quality 85), and `backend/Dockerfile` SHALL configure Gunicorn with `--timeout 120`.

#### Scenario: Provider cascade falls back to local OCR within worker timeout
- **WHEN** cloud vision providers and Ollama fail or time out during an identification request
- **THEN** local OCR preprocessing and extraction complete within the Gunicorn worker timeout without `SIGKILL`

### Requirement: Ollama vision and appraisal fallback avoids grammar-lock empty responses
`_call_ollama_vision` and `estimate_item_value_with_ai` SHALL NOT force `"format": "json"` on Ollama `/api/chat` requests, SHALL use a `45.0` second timeout (bounded by the request deadline), and SHALL fall back to `message.thinking` if `message.content` and `response` are empty.

#### Scenario: Gemini 429 triggers Ollama basic identification
- **WHEN** Gemini returns `429 Too Many Requests` during `identify_images` and an Ollama URL is configured
- **THEN** `_call_ollama_vision` completes without `"format": "json"`, parses the JSON block from Ollama's response, and returns `quota_deferred: true` alongside the identified candidate

### Requirement: Deferred AI batch queue updates items when Gemini quota returns
`CollectionItem` SHALL track `ai_enrichment_pending`, `ai_enrichment_attempts`, `ai_enrichment_last_error`, and `ai_enqueued_at`. Items identified or appraised during a Gemini 429 fallback SHALL be marked `ai_enrichment_pending = True`, and a periodic Celery Beat task (`apps.valuation.tasks.process_deferred_ai_enrichment_task`) SHALL batch-process pending items when Gemini quota is available, stopping the batch early if Gemini still returns 429.

#### Scenario: Batch worker processes pending items and stops on 429
- **WHEN** `process_deferred_ai_enrichment_task` runs with pending items
- **THEN** it enriches and appraises items using Gemini and clears `ai_enrichment_pending`, or increments `ai_enrichment_attempts` and stops the current batch if Gemini returns 429

### Requirement: Fast basic bulk add mode
The system SHALL provide a Fast Bulk Mode for batch intake that identifies items using local auto-crop, barcode/QR decoding, OCR, and static reference catalog matching only, uploads photos in parallel, computes immediate spot-melt valuation, and skips or defers full AI appraisal.

#### Scenario: Fast bulk catalog of paired photos
- **WHEN** a user enables Fast Bulk Mode on a batch of Front/Back photo pairs and starts cataloging
- **THEN** the system identifies each pair via the local-only pipeline (zero Vision AI calls), creates each item with `auto_appraise=false`, uploads both photos in parallel, and applies live spot-melt valuation immediately

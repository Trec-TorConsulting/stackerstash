# vision-identification Specification

## Purpose
Provides mobile-first camera capture and photo upload workflows that identify coins, paper currency, bullion bars, rounds, and graded slabs using Vision AI and barcode/QR/OCR cert extraction.

## Requirements

### Requirement: Camera and photo upload intake
The system SHALL allow users on mobile and desktop browsers to capture photos directly via the device camera or upload image files to initiate item identification.

#### Scenario: Capture obverse and reverse for identification
- **WHEN** a user captures or uploads one or more images in the intake flow and triggers identification
- **THEN** the system stores the uploaded image(s) as draft item media and returns structured candidate metadata for user review before saving

### Requirement: Multimodal Vision AI identification with fallback
The system SHALL identify the item category, title, country/mint, year, denomination, metal type, weight, purity, grading service, certification/serial number, AI confidence score, and an optional non-certified condition estimate using Gemini Vision when configured, falling back to a configured self-hosted Ollama vision endpoint if Gemini is unavailable or disabled.

#### Scenario: Identify a Geiger silver bar or paper bill via Vision AI
- **WHEN** a user submits a photo of a Geiger silver slab or US/foreign paper banknote
- **THEN** the system returns structured JSON fields (category, metal/weight or denomination/series, refiner/issuer, confidence score, and any unverified condition estimate clearly separated from certified grades) pre-filled into the item form

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

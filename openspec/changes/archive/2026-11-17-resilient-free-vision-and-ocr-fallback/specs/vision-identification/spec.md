# Spec Delta

## MODIFIED Requirements

### Requirement: Multimodal Vision AI identification with fallback
The system SHALL identify the item category, title, country/mint, year, denomination, metal type, weight, purity, grading service, certification/serial number, AI confidence score, and an optional non-certified condition estimate using Gemini Vision when configured, cascading across free-tier Gemini models on quota errors and falling back to configured free cloud vision providers (Groq, OpenRouter), self-hosted Ollama, or local OCR + deterministic/text-only lookup when primary vision providers are unavailable or exhausted.

#### Scenario: Identify a Geiger silver bar or paper bill via Vision AI
- **WHEN** a user submits a photo of a Geiger silver slab or US/foreign paper banknote
- **THEN** the system returns structured JSON fields (category, metal/weight or denomination/series, refiner/issuer, confidence score, and any unverified condition estimate clearly separated from certified grades) pre-filled into the item form

#### Scenario: Cascade across Gemini models on HTTP 429 quota error
- **WHEN** the primary Gemini model returns HTTP 429 or a quota-exhausted error
- **THEN** the system automatically retries the request against the next configured Gemini model in the cascade before falling back to secondary providers

#### Scenario: Fallback to Ollama when Gemini fails
- **WHEN** Gemini exhausts all cascade models or returns a network error and the workspace has Groq, OpenRouter, or an Ollama URL configured
- **THEN** the system retries identification against the next configured provider in priority order and labels the provider used

#### Scenario: Graceful manual entry when no AI provider is configured
- **WHEN** all configured AI providers fail or are unconfigured and local OCR extracts no usable numismatic or currency text
- **THEN** the system preserves the uploaded photos and lets the user complete and save the item manually without data loss

## ADDED Requirements

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

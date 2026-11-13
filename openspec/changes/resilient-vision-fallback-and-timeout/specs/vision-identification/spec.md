## MODIFIED Requirements

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

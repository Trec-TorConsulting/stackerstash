# quality-and-security-assurance Specification Delta

## MODIFIED Requirements

### Requirement: Strict raster image upload validation and size bounds
When uploading an item photo, the system SHALL enforce a maximum upload payload limit, verify that the uploaded bytes decode as a valid raster image (`JPEG`, `PNG`, `WebP`, `HEIC`/`HEIF`), reject malformed, HTML, SVG, or executable payloads with HTTP `400` without storing unverified files, and strip all EXIF, GPS location, XMP, and comment metadata from stored images and thumbnails at rest.

#### Scenario: Disguised HTML or SVG payload rejected on photo upload
- **WHEN** an authenticated user uploads an HTML script or SVG document renamed to `evil.jpg` to `/api/v1/catalog/items/{item_id}/photos`
- **THEN** the server rejects the upload with HTTP 400 and writes no file to media storage

#### Scenario: EXIF GPS coordinates and camera metadata stripped at rest
- **WHEN** an authenticated user uploads a photo containing EXIF GPS latitude/longitude coordinates or device serial metadata
- **THEN** the processed image and thumbnail saved to media storage contain zero EXIF GPS or camera metadata tags

### Requirement: Automated OWASP Top 10 security regression test suite
The backend test suite SHALL include an automated OWASP Top 10 security test suite verifying access control isolation (`A01`), encryption & secret redaction (`A02`), injection/traversal/formula safety (`A03`), input/quota bounds (`A04`), production misconfiguration guards (`A05`), authentication/JWT validation & password-change revocation (`A07`), integrity & serialization (`A08`), error/secret log hygiene (`A09`), and SSRF controls including `OLLAMA_URL` (`A10`).

#### Scenario: OWASP Top 10 suite validates cross-tenant, JWT, injection, and SSRF controls
- **WHEN** the security regression suite executes
- **THEN** cross-tenant access, unsigned/expired/tampered/revoked JWTs, inactive user tokens, SQLi/XSS/CSV-formula/path-traversal payloads, fail-closed missing production secrets, and SSRF targets (both CSV photo imports and `OLLAMA_URL`) are all blocked with expected HTTP `4xx` responses

## ADDED Requirements

### Requirement: SSRF protection and response sanitization for Ollama BYOK URLs
The system SHALL validate `OLLAMA_URL` credentials on save and before outbound requests in Vision AI and auto-sort, blocking non-HTTP(S) schemes, cloud metadata (`169.254.169.254`), link-local addresses, and internal cluster service domains (`*.svc`, `*.cluster.local`) unless explicitly allowlisted, and SHALL never echo raw upstream response bodies in error messages.

#### Scenario: Cloud metadata or cluster service URL rejected on Ollama credential save and execution
- **WHEN** a vault owner attempts to save `http://169.254.169.254/latest/meta-data` or `http://postgresql.postgresql.svc.cluster.local:5432` as `OLLAMA_URL` (or triggers identification with a disallowed host)
- **THEN** the system rejects the URL with HTTP 400 on save and refuses to send any outbound HTTP request during identification or auto-sort

#### Scenario: Non-JSON or error responses from Ollama do not leak raw upstream bodies
- **WHEN** a configured Ollama endpoint returns an HTTP error or non-JSON body during Vision AI identification
- **THEN** the recorded provider error reports only the sanitized status/reason without echoing raw upstream response content to the client

### Requirement: Vision and CSV import payload bounds and row error safety
The system SHALL enforce maximum file count and per-file byte limits on `/api/v1/vision/identify` and CSV import endpoints (`/import/csv`, `/import/preview`, `/import/mapped`), validate choice fields on `/import/csv`, and catch duplicate `cert_number` constraint conflicts as structured row errors instead of HTTP 500.

#### Scenario: Oversized file or excessive file count rejected on Vision identify or CSV import
- **WHEN** a client uploads more than 4 files or a file exceeding `10 MB` to `/api/v1/vision/identify` or uploads a CSV file exceeding `10 MB` to any CSV import endpoint
- **THEN** the server rejects the request with HTTP 400 before buffering unbounded payloads

#### Scenario: Duplicate cert_number in CSV import recorded as row error instead of HTTP 500
- **WHEN** an uploaded CSV contains a `cert_number` that already exists in the active workspace or repeats within the same CSV
- **THEN** the importer catches the conflict, records a row-level error in `errors`, and completes the response with HTTP 200 instead of raising an unhandled `IntegrityError`

### Requirement: Authentication and invitation endpoint rate limiting
The system SHALL enforce cache-backed rate limiting on authentication (`/auth/login`, `/auth/register`, `/auth/change-password`, `/auth/me` DELETE) and invitation preview/acceptance endpoints (`/auth/invites/{token}`) to prevent brute-force credential and token guessing.

#### Scenario: Repeated failed login or password verification throttled with HTTP 429
- **WHEN** a client exceeds the configured attempt threshold on `/api/v1/auth/login`, `/api/v1/auth/change-password`, or `/api/v1/auth/me` (DELETE) within the rate-limit window
- **THEN** the server rejects subsequent attempts during the cooldown window with HTTP 429

### Requirement: In-flight security headers, PostgreSQL TLS options, and production OpenAPI gating
The backend SHALL apply defensive security headers (`Cache-Control: no-store` on `/api/`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`) directly on backend responses, honor `sslmode` in `DATABASE_URL` / `DB_SSLMODE`, and disable unauthenticated `/api/v1/docs` and `/api/v1/openapi.json` when `DEBUG` is false.

#### Scenario: Authenticated API responses include no-store cache headers and production hides OpenAPI docs
- **WHEN** `DJANGO_DEBUG` is `false` and a client requests `/api/v1/catalog/items` or `/api/v1/docs`
- **THEN** API responses include `Cache-Control: no-store` and `Referrer-Policy: strict-origin-when-cross-origin`, and unauthenticated requests to `/api/v1/docs` or `/api/v1/openapi.json` return HTTP 404

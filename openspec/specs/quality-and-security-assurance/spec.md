# quality-and-security-assurance Specification

## Purpose
Establishes enforced `100%` line, statement, and function test coverage gates across backend and frontend codebases, closes OWASP Top 10 application vulnerabilities (SSRF, CSV formula injection, and strict image upload validation), and automates OWASP Top 10 regression tests alongside static and dependency security scanning.

## Requirements

### Requirement: Enforced 100 percent backend and frontend test coverage gates
The system SHALL configure automated code-coverage instrumentation across both the backend test suite and frontend test suite, failing test execution whenever statement, line, or function coverage drops below `100%` (excluding database migrations and framework entrypoint boilerplate).

#### Scenario: Backend test suite enforces 100 percent coverage
- **WHEN** the backend test runner runs with coverage enforcement enabled
- **THEN** all backend application modules and configuration code execute to `100%` line/statement coverage and any drop below `100%` fails the run

#### Scenario: Frontend test suite enforces 100 percent coverage
- **WHEN** the frontend test runner runs with coverage enforcement enabled
- **THEN** all pages, components, hooks, and client library utilities execute to `100%` line, statement, and function coverage and any drop below `100%` fails the run

### Requirement: Complete coverage of untested frontend pages, components, and client utilities
The frontend test suite SHALL include dedicated unit and component tests covering application routing, navigation shell, containers management, interactive crop/rotate editor, PWA install hook, footer, and API client error/header handling.

#### Scenario: Untested UI modules exercised across all user paths
- **WHEN** frontend tests execute for application routing, sidebar/mobile layout, containers CRUD, crop/rotate modal, PWA install prompt, footer, and API fetch error handling
- **THEN** all UI branches (including `401` token clearing, `403`/network errors, offline fallbacks, and responsive navigation) are asserted and pass

### Requirement: SSRF protection for remote CSV photo imports
When importing photos from remote URLs during CSV migration, the system SHALL block non-HTTP(S) schemes, disallow URLs resolving to loopback, private, link-local, or cloud-metadata IP addresses (including across HTTP redirects), and abort downloads exceeding `5 MB` before buffering unbounded bodies.

#### Scenario: Internal or cloud-metadata URL blocked during CSV photo import
- **WHEN** a CSV import row specifies a photo URL targeting `http://127.0.0.1/...`, `http://169.254.169.254/latest/meta-data/`, `http://10.0.0.5/...`, or `file:///etc/passwd`
- **THEN** the importer refuses the outbound request, skips attaching any photo, and records a non-fatal warning on the import result

#### Scenario: Oversized remote response rejected during streaming
- **WHEN** a remote image URL responds with more than `5 MB` of data
- **THEN** the importer aborts reading the stream without buffering the oversized payload and logs a warning

### Requirement: CSV formula injection neutralization on export
When exporting collection items as CSV, the system SHALL neutralize string cell values beginning with spreadsheet formula trigger characters (`=`, `+`, `-`, `@`, tab, or carriage return) while preserving numeric and empty values intact.

#### Scenario: Malicious formula payload neutralized in CSV export
- **WHEN** an item has a title or note such as `=cmd|' /C calc'!A0` or `+SUM(1,2)` and the user downloads the CSV export
- **THEN** the exported CSV cell is prefixed safely so spreadsheet applications treat it as literal text rather than an executable formula

### Requirement: Strict raster image upload validation and size bounds
When uploading an item photo, the system SHALL enforce a maximum upload payload limit and verify that the uploaded bytes decode as a valid raster image (`JPEG`, `PNG`, `WebP`, `HEIC`/`HEIF`), rejecting malformed, HTML, SVG, or executable payloads with HTTP `400` without storing unverified files.

#### Scenario: Disguised HTML or SVG payload rejected on photo upload
- **WHEN** an authenticated user uploads an HTML script or SVG document renamed to `evil.jpg` to `/api/v1/catalog/items/{item_id}/photos`
- **THEN** the server rejects the upload with HTTP 400 and writes no file to media storage

### Requirement: Automated OWASP Top 10 security regression test suite
The backend test suite SHALL include an automated OWASP Top 10 security test suite verifying access control isolation (`A01`), encryption & secret redaction (`A02`), injection/traversal/formula safety (`A03`), input/quota bounds (`A04`), production misconfiguration guards (`A05`), authentication/JWT validation (`A07`), integrity & serialization (`A08`), error/secret log hygiene (`A09`), and SSRF controls (`A10`).

#### Scenario: OWASP Top 10 suite validates cross-tenant, JWT, injection, and SSRF controls
- **WHEN** the security regression suite executes
- **THEN** cross-tenant access, unsigned/expired/tampered JWTs, inactive user tokens, SQLi/XSS/CSV-formula/path-traversal payloads, fail-closed missing production secrets, and SSRF targets are all blocked with expected HTTP `4xx` responses

### Requirement: Repeatable static and dependency security scanning
The project SHALL provide automated static security analysis, dependency vulnerability auditing, and production deployment configuration verification runnable via a single repeatable check command.

#### Scenario: Local security and coverage suite verifies zero high-severity issues
- **WHEN** an engineer runs the project security and coverage verification runner
- **THEN** static Python SAST checks, Python/Node dependency audits, Django deployment checks, and both `100%` coverage test suites execute and fail on any unaddressed violation or vulnerability

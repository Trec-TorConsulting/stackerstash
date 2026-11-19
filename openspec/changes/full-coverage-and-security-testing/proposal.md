# Proposal

## Why

Stacker Stash currently has zero automated code-coverage gates, zero static or dependency security scanners, several completely untested frontend surfaces (`Layout`, `ContainersPage`, `PhotoCropRotateView`, `SiteFooter`, `usePwaInstall`, `api.ts`, `App.tsx`), and verified OWASP Top 10 gaps (arbitrary remote URL SSRF in CSV photo imports, unsanitized CSV formula injection on export, and raw unverified fallback file writes on malformed image uploads). Enforcing `100%` line/statement/function coverage alongside automated OWASP Top 10 testing, security remediations, and static/dependency scanners makes quality and security regressions impossible to ship undetected.

## What Changes

- **100% Automated Coverage Gates (Backend & Frontend)**:
  - Add `pytest-cov` (`backend/pyproject.toml`) configured for `apps` and `config` (excluding `*/migrations/*`, `config/wsgi.py`, `manage.py`) with `--cov-fail-under=100` across statements/lines.
  - Add `@vitest/coverage-v8` (`frontend/package.json`, `frontend/vite.config.ts`) configured with `100%` thresholds (`lines: 100`, `statements: 100`, `functions: 100`) across `frontend/src/**` (excluding `src/main.tsx`, `src/vite-env.d.ts`, `src/test-setup.ts`, `src/__tests__/**`).
- **Complete System-Wide Test Suites**: Add and expand unit, API, and component tests so every backend app (`accounts`, `catalog`, `valuation`, `vision`, `config`, management commands) and every frontend page, component, hook, and utility (`App.tsx`, `Layout.tsx`, `ContainersPage.tsx`, `CollectionPage.tsx`, `DashboardPage.tsx`, `ItemDetailPage.tsx`, `SettingsPage.tsx`, `AdminPortalPage.tsx`, `AuthPage.tsx`, `PhotoCropRotateView.tsx`, `SiteFooter.tsx`, `usePwaInstall.ts`, `api.ts`, etc.) meets the `100%` gate.
- **OWASP Top 10 Remediations & Automated Security Suite (`test_security_owasp.py`)**:
  - **A10 SSRF Guard (`backend/apps/catalog/importer.py`)**: Validate remote photo import URLs before fetching and across redirects—blocking non-HTTP(S) schemes, loopback, RFC 1918 private networks, link-local/cloud metadata (`169.254.169.254`), and streaming oversized responses past `MAX_PHOTO_BYTES`.
  - **A03 CSV Formula Injection Guard (`backend/apps/catalog/api.py`)**: Sanitize exported string cells starting with `=`, `+`, `-`, `@`, `\t`, or `\r` in `export_items_csv`.
  - **A01/A03/A04 Strict Upload Validation (`backend/apps/catalog/api.py`)**: Enforce maximum upload size and strict Pillow raster verification on `upload_item_photo`, returning `400` on invalid/disguised files (HTML/SVG/executables) instead of falling back to saving raw unverified bytes.
  - Add `backend/tests/test_security_owasp.py` exercising all OWASP Top 10 categories (`A01`–`A10`), including tenant isolation, crypto/JWT checks, SQLi/XSS/traversal/CSV injection, input bounds, prod misconfiguration checks, auth brute-force/inactive-user checks, secret redaction, and SSRF.
- **Static & Dependency Security Scanners**: Add `bandit` and `pip-audit` to `backend/pyproject.toml`, enable Ruff `S` (flake8-bandit) security lint rules, integrate `npm audit` and `manage.py check --deploy` validation, and provide a single repeatable verification runner (`scripts/security_and_coverage.sh`).
- **Out of Scope**: GitHub Actions CI workflows (`.github/workflows/`) and Playwright browser E2E suites remain outside this change.

## Capabilities

### New Capabilities
- `quality-and-security-assurance`: Enforced `100%` line/statement/function coverage gates across backend and frontend, OWASP Top 10 automated security testing and vulnerability remediations (SSRF, CSV injection, strict upload validation), and static/dependency security scanning (`ruff S`, `bandit`, `pip-audit`, `npm audit`, `check --deploy`).

### Modified Capabilities
<!-- None; all test coverage gates, OWASP security regressions, and scanner rules live cohesively in quality-and-security-assurance. -->

## Impact

- **Backend**: `backend/pyproject.toml`, `backend/apps/catalog/importer.py`, `backend/apps/catalog/api.py`, `backend/tests/test_security_owasp.py` (new), and expanded coverage tests across `backend/tests/test_*.py`.
- **Frontend**: `frontend/package.json`, `frontend/package-lock.json`, `frontend/vite.config.ts`, `frontend/src/__tests__/*.test.ts(x)` (new and expanded test files covering all untested pages/components/hooks/lib modules).
- **Scripts & Docs**: `scripts/security_and_coverage.sh` (new), `README.md`.

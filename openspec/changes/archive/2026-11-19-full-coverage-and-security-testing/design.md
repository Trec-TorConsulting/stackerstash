# Design

## Context

See `proposal.md` for motivation and gaps found during inspection:
- `backend/pyproject.toml` has `pytest`, `pytest-django`, `respx`, and `ruff`, with no coverage thresholds or security scanners (`bandit`, `pip-audit`, Ruff `S`).
- `frontend/package.json` and `frontend/vite.config.ts` configure `vitest`, with no `@vitest/coverage-v8` thresholds and 7+ untested frontend modules (`App.tsx`, `Layout.tsx`, `ContainersPage.tsx`, `PhotoCropRotateView.tsx`, `SiteFooter.tsx`, `usePwaInstall.ts`, `api.ts`).
- Inspection of `backend/apps/catalog/importer.py` (`_download_and_validate_photo`) and `backend/apps/catalog/api.py` (`export_items_csv`, `upload_item_photo`) revealed real OWASP Top 10 issues: unvalidated remote HTTP SSRF, unescaped CSV formula cells, and raw fallback file saving when image processing raises an exception.

## Goals / Non-Goals

**Goals:**
- Enforce `100%` line/statement/function coverage gates in both `pytest` (`--cov-fail-under=100`) and `vitest` (`thresholds: { lines: 100, statements: 100, functions: 100 }`).
- Remediate verified SSRF, CSV formula injection, and fallback upload bypass vulnerabilities alongside an automated `test_security_owasp.py` suite.
- Provide repeatable local security scans (`ruff` with `S` rules, `bandit`, `pip-audit`, `npm audit`, `manage.py check --deploy`) via a single shell runner script.

**Non-Goals:**
- GitHub Actions workflows (`.github/workflows/`) or Playwright browser E2E suites.
- Modifying runtime behavior outside the three targeted OWASP security remediations and testability improvements.

## Decisions

### 1. Backend Coverage Configuration (`pytest-cov`)
- **Choice**: Add `pytest-cov>=6.0.0` to `backend/pyproject.toml` `[dependency-groups] dev` and configure `[tool.coverage.run]` (`source = ["apps", "config"]`, `branch = false`, `omit = ["*/migrations/*", "config/wsgi.py", "manage.py"]`) and `[tool.coverage.report]` (`fail_under = 100`, `show_missing = true`, `exclude_lines = ["pragma: no cover", "if TYPE_CHECKING:"]`). Add `--cov=apps --cov=config --cov-report=term-missing --cov-fail-under=100` to `[tool.pytest.ini_options] addopts` (or via dedicated `pytest` invocation/script — keeping `addopts` clean or setting `[tool.coverage]` so `pytest --cov` enforces `100%` every run!).
- **Rationale**: Requiring `100%` statement/line coverage while permitting targeted `# pragma: no cover` ONLY where platform-unreachable defensive branches exist (if any, reviewed strictly in PR) avoids fragile fake tests while enforcing true `100%` coverage across every module.

### 2. Frontend Coverage Configuration (`@vitest/coverage-v8`)
- **Choice**: Add `@vitest/coverage-v8@^2.1.8` (matching `vitest: ^2.1.8`) to `frontend/package.json` and configure `test.coverage` in `frontend/vite.config.ts`:
  - `provider: "v8"`, `all: true`, `include: ["src/**/*.{ts,tsx}"]`, `exclude: ["src/main.tsx", "src/vite-env.d.ts", "src/test-setup.ts", "src/__tests__/**"]`
  - `thresholds: { lines: 100, statements: 100, functions: 100 }`
  - Add `"test:coverage": "vitest run --coverage"` (and/or enable coverage in `npm test` cleanly).
- **Rationale**: Ensures every page, component, hook, and lib utility (`App.tsx`, `Layout.tsx`, `ContainersPage.tsx`, `PhotoCropRotateView.tsx`, `SiteFooter.tsx`, `usePwaInstall.ts`, `api.ts`, etc.) has `100%` lines, statements, and functions covered in jsdom.

### 3. OWASP Top 10 Remediations
- **SSRF Guard in `backend/apps/catalog/importer.py`**:
  - Add `_validate_public_http_url(url: str) -> str`: verify scheme in `{"http", "https"}`, reject credentials in URL, resolve hostname via `socket.getaddrinfo`, and verify every resolved IP (`ipaddress.ip_address`) satisfies `ip.is_global and not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved)`.
  - Disable blind auto-redirects (`follow_redirects=False` or validate each redirect hop up to max 3 hops with `_validate_public_http_url`) and stream chunks via `client.stream("GET", url)` aborting immediately once bytes exceed `MAX_PHOTO_BYTES` (`5 MB`).
- **CSV Formula Neutralization in `backend/apps/catalog/api.py`**:
  - Add `_csv_safe_cell(value: Any) -> Any`: if `isinstance(value, str)` and `value` starts with `("=", "+", "-", "@", "\t", "\r")`, return `f"'{value}"` (excluding pure negative numbers like `"-12.50"` if numeric, or formatting negative currency numbers cleanly while neutralizing formula expressions like `"-1+1"`, `"=..."`, `"+cmd..."`, `"@SUM..."`!).
- **Strict Image Upload Validation in `backend/apps/catalog/api.py`**:
  - Enforce `MAX_UPLOAD_BYTES = 20 * 1024 * 1024` (`HTTP 413` / `400` if exceeded).
  - Verify `raw_bytes` decodes cleanly with Pillow (`Image.open(io.BytesIO(raw_bytes)).verify()`, checking format in `{"JPEG", "PNG", "WEBP", "GIF", "HEIF", "HEIC", "MPO", "TIFF", "BMP"}`) BEFORE attempting `process_item_image` or fallback storage — raising `HttpError(400, "Uploaded file must be a valid image.")` on invalid/HTML/SVG payloads rather than falling back to saving raw unverified bytes.

### 4. OWASP Security Regression Suite & Scanner Runner
- **Choice**:
  - Create `backend/tests/test_security_owasp.py` organizing tests explicitly by `A01`–`A10` (`A01` cross-tenant access & admin checks; `A02` Fernet encryption & no plaintext secret leakage; `A03` SQLi/XSS/CSV-formula/path-traversal; `A04` negative values, invalid categories, oversized image rejections; `A05` `DEBUG=False` fail-closed secret checks & CORS checks; `A06` dependency audit manifest presence; `A07` expired/tampered/inactive JWT & login enumeration parity; `A08` invalid JSON mapping & signed media integrity; `A09` log/response secret redaction; `A10` SSRF loopback/RFC1918/metadata/redirect blocking).
  - Add `bandit>=1.8.0` and `pip-audit>=2.7.0` to `backend/pyproject.toml` dev dependencies, enable Ruff `S` rules (ignoring false-positive test assertions like `S101` in `tests/**` via `[tool.ruff.lint.per-file-ignores]`), and create `scripts/security_and_coverage.sh` running:
    1. `cd backend && .venv/bin/ruff check .`
    2. `cd backend && .venv/bin/bandit -r apps config -q`
    3. `cd backend && .venv/bin/pip-audit`
    4. `cd backend && DJANGO_DEBUG=false DJANGO_SECRET_KEY=... FIELD_ENCRYPTION_KEY=... .venv/bin/python manage.py check --deploy --fail-level WARNING` (or checking expected warnings cleanly)
    5. `cd backend && .venv/bin/pytest --cov=apps --cov=config --cov-report=term-missing --cov-fail-under=100`
    6. `cd frontend && npm audit --audit-level=high`
    7. `cd frontend && npx tsc --noEmit && npm run test:coverage`

## Risks / Trade-offs

- **Risk: `pip-audit` or `npm audit` fails offline or hits upstream CVE lag** → Mitigation: Document exact scanner flags and allow `--strict` vs offline cache / ignore-vuln policy only with documented justification, while running live in verification.
- **Risk: Reaching 100% coverage across external HTTP provider error branches (`providers.py`, `vision/services.py`) and browser camera APIs (`GuidedCameraModal.tsx`, `autoCrop.ts`)** → Mitigation: Use `respx` HTTP mocks in pytest and `jsdom` canvas/media mocks in Vitest to deterministically exercise timeout, 429, fallback, and edge branches rather than relying on live APIs.
- **Risk: Negative numeric strings in CSV export (`unrealized_gain_loss` or `weight`) mistaken for formula injection** → Mitigation: In `_csv_safe_cell`, allow valid signed decimal numbers matching `^-?\d+(\.\d+)?$` (or prefix formulas/non-numeric strings starting with `=`, `+`, `-`, `@`, `\t`, `\r`) so negative dollar amounts aren't mangled while `-1+1` / `=cmd` are neutralized.

# Tasks

## 1. Authentication, Password Validation, JWT Revocation & Rate Limiting

- [x] 1.1 Enforce Django's `AUTH_PASSWORD_VALIDATORS` (`validate_password`) on `POST /api/v1/auth/register` and `POST /api/v1/auth/change-password`, and verify in `backend/tests/test_accounts.py` that common or numeric-only passwords return HTTP 400
- [x] 1.2 Embed a password-hash fingerprint (`pwd`) in `issue_access_token` and validate it in `WorkspaceAuth.authenticate` (returning a fresh `access_token` from `/auth/change-password`), and verify in `backend/tests/test_security_owasp.py` that tokens issued prior to a password change are rejected with HTTP 401
- [x] 1.3 Implement a Django cache-backed rate limiter helper and apply it to `/api/v1/auth/login`, `/api/v1/auth/register`, `/api/v1/auth/change-password`, `/api/v1/auth/me` (DELETE), and `/api/v1/auth/invites/{token}`, verifying in `backend/tests/test_security_owasp.py` that repeated attempts beyond the threshold return HTTP 429

## 2. Workspace-Bound Media Path Signing & At-Rest EXIF/GPS Stripping

- [x] 2.1 Add `media_key_version = models.PositiveIntegerField(default=1)` to `Workspace` with a migration, increment it in `remove_workspace_member` and `leave_workspace`, and verify the migration applies cleanly with `python manage.py migrate`
- [x] 2.2 Update `backend/config/media_signing.py` and `serve_media` in `backend/config/urls.py` to use a domain-separated HMAC key, a 1-hour rolling bucket (`_BUCKET_SECONDS = 3600`), workspace existence and `media_key_version` verification, and private security headers (`Cache-Control: private, max-age=3600, no-transform`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; img-src 'self'`, `Referrer-Policy: same-origin`), verifying in `backend/tests/test_security_owasp.py` and `backend/tests/test_shared_vaults.py` that removing a member or deleting a workspace invalidates prior signed URLs
- [x] 2.3 Strip all EXIF, GPS, XMP, and comment metadata in `_encode_processed_image` and `generate_image_thumbnail` in `backend/apps/catalog/image_processing.py`, and verify with a unit test in `backend/tests/test_image_processing.py` that uploaded photos containing EXIF GPS tags save zero EXIF metadata to disk

## 3. Shared-Vault Invitation Privacy, Role Protection & Secret Redaction

- [x] 3.1 Harden `GET /api/v1/auth/invites/{token}` (`preview_invite`) to return HTTP 410 for `REVOKED`, `DECLINED`, `ACCEPTED`, or expired invitations and mask email addresses on pending previews, redact `token` and `invite_path` on non-pending invites in `list_workspace_invites`, and reject `accept_invite` with HTTP 409 if the caller is already a vault member, verifying all cases in `backend/tests/test_shared_vaults.py`
- [x] 3.2 Sanitize all provider exception strings via `_sanitize_error_message` before storing in `ValuationHistory.raw_payload["errors"]`, `AppraisalJob.error_message`, and `CollectionItem.ai_enrichment_last_error`, and verify in `backend/tests/test_security_owasp.py` that simulated provider errors containing `key=` or `Bearer` tokens are scrubbed at rest and in API responses

## 4. `OLLAMA_URL` SSRF Protection, Upload/Import Bounds & Server-Side Vault Isolation

- [x] 4.1 Implement `validate_ollama_url` (blocking non-HTTP(S) schemes, cloud metadata `169.254.169.254`, link-local/loopback/private IPs unless allowlisted in `OLLAMA_ALLOWED_HOSTS`, and internal Kubernetes domains `*.svc` / `*.cluster.local`) and enforce it on `PUT /api/v1/settings/credentials/OLLAMA_URL`, `apps/vision/services.py`, and `apps/catalog/auto_sort.py` while sanitizing non-JSON Ollama error responses, verifying in `backend/tests/test_security_owasp.py`
- [x] 4.2 Enforce file count (`<= 4`) and per-file size (`<= 10 MB`) bounds on `POST /api/v1/vision/identify` and `<= 10 MB` CSV file size bounds on `/catalog/items/import/csv`, `/import/preview`, and `/import/mapped`, normalize choice fields and catch duplicate `cert_number` `IntegrityError` as row errors on CSV import, and verify in `backend/tests/test_catalog.py` and `backend/tests/test_importer.py`
- [x] 4.3 Add a nullable `workspace` foreign key to `CertLookupCache` (with migration), hash free-text `NUMISTA` query keys with full SHA-256, and scope BYOK cache lookups/writes by `workspace`, verifying in `backend/tests/test_vision_cache.py` that Vault A's BYOK/free-text cache entries cannot be read or poisoned by Vault B
- [x] 4.4 Scope `POST /api/v1/valuation/spots/refresh` item melt recalculations strictly to `request.workspace` with a cache cooldown on upstream `gold-api.com` fetches (keeping background Celery beat global), and verify in `backend/tests/test_valuation_and_vision.py` that refreshing spots in Vault A does not mutate Vault B's items

## 5. In-Flight Transport, Security Headers, PostgreSQL TLS & K3s Gateway Routing

- [x] 5.1 Update `_build_databases()` in `backend/config/settings.py` to parse `sslmode` from `DATABASE_URL` query parameters or `DB_SSLMODE`, disable unauthenticated `/api/v1/docs` and `/api/v1/openapi.json` when `DEBUG=False`, and add backend security headers middleware (`Cache-Control: no-store` on `/api/`, `Referrer-Policy`, `X-Content-Type-Options`), verifying in `backend/tests/test_config.py`
- [x] 5.2 Update `deploy/chart/templates/httproute.yaml` (and document the matching rule for `~/Projects/Personal/HomeLab-Redo/stackerstash/templates/httproute.yaml`) so `/super-admin` routes to `stackerstash-backend` and `/admin` routes to `stackerstash-frontend`, verifying template rendering

## 6. Client-Side Offline Cache, React Query & Service Worker Vault Isolation

- [x] 6.1 Partition `frontend/src/lib/offlineCache.ts` keys by `${workspaceId}:${itemId}`, add `clearOfflineCache()`, and update `frontend/src/pages/ItemDetailPage.tsx` so HTTP `401`, `403`, and `404` responses rethrow immediately without falling back to IndexedDB snapshots, verifying in `frontend/src/__tests__/itemDetail.test.tsx` and `frontend/src/__tests__/vaults.test.tsx`
- [x] 6.2 Update `frontend/src/App.tsx` (`refreshUserSession` and `handleLogout`) and `frontend/vite.config.ts` to purge IndexedDB (`clearOfflineCache()`) and both Workbox runtime caches (`api-items-valuation-cache` and `item-media-cache`) on vault switch and logout, verifying in `frontend/src/__tests__/app.test.tsx` and `frontend/src/__tests__/sharedVaults.test.tsx`

## 7. Full Security & 100% Coverage Verification

- [x] 7.1 Run `scripts/security_and_coverage.sh` (secret scan, ruff, bandit, pip-audit, `manage.py check --deploy`, backend pytest at 100% coverage, npm audit, frontend tsc + vitest at 100% coverage, and production build) and verify all 9 gates pass with zero errors

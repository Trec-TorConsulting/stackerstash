# Proposal

## Why

A deep security review of Stackers Stash across data in flight, data at rest, authorization boundaries ("only who is allowed to see what is granted"), and multi-vault isolation ("no cross-talk unless a shared vault") identified several defense-in-depth gaps across client offline storage, signed media paths, BYOK credential SSRF surfaces, server-side caches, invitation previews, JWT revocation, and ingress/transport configuration. Closing these gaps ensures strict cryptographic and logical isolation between vaults, prevents revoked collaborators or secondary users on shared devices from accessing unauthorized vault data or media, and hardens both local and production K3s paths in flight and at rest.

## What Changes

- **Client-Side Vault & Session Cache Isolation (At-Rest Browser Storage)**:
  - Partition IndexedDB (`stackerstash-offline`) snapshots and in-memory fallback maps by `(userId, workspaceId, itemId)` instead of bare `item.id`.
  - Never fall back to offline IndexedDB snapshots when the API returns authorization or existence errors (`401`, `403`, `404`); only use offline fallback on network/connectivity failures.
  - Scope React Query keys by active `workspaceId` and require Workbox runtime cache keys (`api-items-valuation-cache` and `item-media-cache`) to partition by workspace and be purged completely on both vault switch and user logout.
- **Vault-Verified, Short-Lived, Domain-Separated Media Path Signing & EXIF/GPS Stripping**:
  - Domain-separate the media HMAC signing key from raw `SECRET_KEY`, reduce signed media URL validity from a 7-to-14-day rolling window to a short-lived rolling bucket (e.g., 1 hour / 24 hours max), and bind the signature to the workspace path (`workspaces/<workspace_id>/...`) and a per-workspace media revocation/version salt so deleted vaults or revoked access invalidate signed paths.
  - Serve `/media/*` with strict response headers (`Cache-Control: private, no-transform`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; img-src 'self'`, `Referrer-Policy: same-origin`).
  - Explicitly strip all EXIF, GPS location coordinates, XMP, and comment metadata when re-encoding uploaded item photos and thumbnails at rest.
- **Strict Role & Invitation Privacy Enforcement**:
  - **BREAKING** (for revoked/expired invite previews): `GET /api/v1/auth/invites/{token}` will return HTTP `410 Gone` for `REVOKED`, `DECLINED`, `ACCEPTED`, or expired invitations instead of returning HTTP `200` with vault and owner email metadata, and will mask email addresses on unauthenticated pending invite previews.
  - Prevent `POST /api/v1/auth/invites/{token}/accept` from overwriting an existing vault member's role if they are already a member (`409 Conflict`).
  - Redact raw `token` and `invite_path` on non-pending invitations in `GET /api/v1/auth/workspaces/{workspace_id}/invites`.
  - Sanitize all upstream provider exception messages (`_sanitize_error_message`) before storing them in `ValuationHistory.raw_payload["errors"]`, `AppraisalJob.error_message`, and `CollectionItem.ai_enrichment_last_error` so shared-vault `VIEWER`s and `EDITOR`s can never observe leaked BYOK API keys or internal URLs.
- **Server-Side Cross-Vault Isolation (Caches & Spot Refresh)**:
  - Scope `CertLookupCache` lookups and writes for free-text/BYOK queries (such as `NUMISTA` title queries) by `workspace` (and full SHA-256 query digest rather than a 64-char prefix) so one vault's custom item titles or private BYOK lookups cannot poison or leak into another vault.
  - Scope `POST /api/v1/valuation/spots/refresh` item melt recalculations strictly to `request.workspace` (with upstream fetch cooldown/throttling) so a user refreshing spot prices in one vault never locks or mutates `CollectionItem` rows in other vaults.
- **SSRF Hardening for `OLLAMA_URL` & Upload/Import Bounds**:
  - Validate `OLLAMA_URL` on credential save and before outbound requests in `apps/vision/services.py` and `apps/catalog/auto_sort.py` to block cloud metadata (`169.254.169.254`), non-HTTP(S) schemes, link-local addresses, and internal cluster service hosts (`*.svc`, `*.cluster.local`), and sanitize Ollama error messages so raw upstream HTTP response bodies are never echoed to clients.
  - Enforce maximum payload size and file-count bounds on `POST /api/v1/vision/identify` and CSV import endpoints (`/catalog/items/import/csv`, `/import/preview`, `/import/mapped`), validate enum choice fields on `/import/csv`, and catch duplicate `cert_number` `IntegrityError` cleanly as row errors instead of HTTP 500.
- **Authentication, JWT Revocation, Rate Limiting & In-Flight Transport Hardening**:
  - Enforce Django's `AUTH_PASSWORD_VALIDATORS` (`validate_password`) on `/api/v1/auth/register` and `/api/v1/auth/change-password`.
  - Embed a password-hash fingerprint (`pwd`) in JWT access tokens and verify it in `WorkspaceAuth` so password changes immediately invalidate all prior tokens in flight.
  - Add cache-backed rate limiting on authentication (`/auth/login`, `/auth/register`, `/auth/change-password`, `/auth/me` DELETE) and invitation preview/acceptance endpoints.
  - Parse `sslmode` (and `DB_SSLMODE`) in `_build_databases()` for encrypted PostgreSQL connections in flight, disable unauthenticated `/api/v1/docs` when `DEBUG=False`, add backend security headers (`Cache-Control: no-store` on `/api/`, `Referrer-Policy`), and align Kubernetes Gateway `HTTPRoute` rules so `/super-admin` routes to the backend while `/admin` routes to the frontend SPA.

## Capabilities

### New Capabilities
<!-- None: all security gaps map cleanly to existing capability boundaries. -->

### Modified Capabilities
- `identity-tenancy`: Enforce `validate_password` on registration and password changes, bind JWT validity to the user's current password hash for immediate revocation on password change, enforce short-lived workspace-bound signed media paths, and strictly partition and purge client-side IndexedDB, React Query, and Workbox caches across vault switches and logouts.
- `vault-sharing-and-roles`: Reject unauthenticated previews of revoked, declined, accepted, or expired invitations with HTTP 410, mask emails in public invite previews, prevent invite acceptance from overwriting an existing member's role, redact tokens on non-pending invites, and sanitize provider errors in valuation history and appraisal jobs against BYOK secret leakage to shared-vault collaborators.
- `quality-and-security-assurance`: Add `OLLAMA_URL` SSRF protection and response sanitization, enforce upload size/count and choice/uniqueness validation on Vision AI and CSV import endpoints, strip EXIF/GPS metadata from stored photos at rest, enforce auth/invite rate limiting, disable production OpenAPI docs, add backend `/api` and `/media` security headers, and support PostgreSQL `sslmode` in flight.
- `server-reference-cache`: Prevent cross-vault cache poisoning and BYOK data bleed in `CertLookupCache` by scoping free-text/BYOK numismatic cache entries per workspace with full SHA-256 query keys.
- `valuation-analytics`: Scope user-triggered `POST /api/v1/valuation/spots/refresh` item recalculations to the caller's active vault (`request.workspace`) with upstream fetch cooldowns so one vault never locks or mutates another vault's items.
- `k3s-deployment`: Align Gateway `HTTPRoute` path rules so `/super-admin` routes to `stackerstash-backend` and `/admin` routes to `stackerstash-frontend`.

## Impact

- **Backend**:
  - `backend/config/settings.py`, `backend/config/urls.py`, `backend/config/api.py`, `backend/config/media_signing.py`
  - `backend/apps/accounts/auth.py`, `backend/apps/accounts/api.py`, `backend/apps/accounts/models.py`
  - `backend/apps/catalog/api.py`, `backend/apps/catalog/importer.py`, `backend/apps/catalog/image_processing.py`, `backend/apps/catalog/auto_sort.py`
  - `backend/apps/valuation/api.py`, `backend/apps/valuation/services.py`, `backend/apps/valuation/providers.py`, `backend/apps/valuation/tasks.py`
  - `backend/apps/vision/api.py`, `backend/apps/vision/services.py`, `backend/apps/vision/cache.py`, `backend/apps/vision/models.py`
  - `backend/tests/test_security_owasp.py` and related test modules
- **Frontend**:
  - `frontend/src/lib/offlineCache.ts`, `frontend/src/lib/api.ts`, `frontend/src/App.tsx`, `frontend/src/pages/ItemDetailPage.tsx`, `frontend/vite.config.ts`
- **Deployment / Charts**:
  - `deploy/chart/templates/httproute.yaml` (and documented production chart alignment for `~/Projects/Personal/HomeLab-Redo/stackerstash/templates/httproute.yaml`)

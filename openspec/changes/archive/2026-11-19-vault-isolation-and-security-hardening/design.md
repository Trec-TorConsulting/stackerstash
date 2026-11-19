# Design

## Context

See `proposal.md - Why` for motivation. Stackers Stash uses a single database (`Workspace` foreign keys on `CollectionItem`, `Container`, `ItemPhoto`, `ProviderCredential`, `AppraisalJob`, `IdentificationJob`, `ImageIdentificationCache`), a shared media filesystem (`MEDIA_ROOT/workspaces/<workspace_id>/items/<item_id>/<uuid>.<ext>`), a React + TanStack Query + VitePWA (Workbox + IndexedDB) frontend, and a K3s Gateway `HTTPRoute` in production (`~/Projects/Personal/HomeLab-Redo/stackerstash`). Both backend (`pytest --cov-fail-under=100`) and frontend (`vitest` 100% lines/statements/functions) enforce 100% coverage gates.

## Goals / Non-Goals

**Goals:**
- Prevent any cross-vault or cross-user data bleed in client storage (IndexedDB, React Query, Workbox caches) and server caches (`CertLookupCache`, `refresh_spot_prices`).
- Ensure revoked collaborators or deleted vaults immediately invalidate previously issued signed media URLs, and strip EXIF/GPS metadata from all stored photos at rest.
- Block SSRF and response body exfiltration through `OLLAMA_URL` BYOK credentials and enforce strict size/count bounds on Vision AI and CSV import endpoints.
- Enforce `AUTH_PASSWORD_VALIDATORS`, immediate JWT invalidation on password change, rate limiting on auth/invite endpoints, and redaction of BYOK secrets in stored valuation/appraisal errors.
- Harden in-flight transport: PostgreSQL `sslmode` parsing, backend security headers on `/api/` and `/media/`, production OpenAPI doc disabling, and Gateway `HTTPRoute` `/admin` vs `/super-admin` alignment.

**Non-Goals:**
- Per-vault physical database sharding or OS-level block-device encryption changes (handled by Longhorn/storage layer and the Dedicated Server tier).
- Changing the frontend authentication transport from Bearer JWT to cookie-based sessions.

## Decisions

### 1. Client-Side Vault & Session Isolation (IndexedDB, Workbox, React Query)
- **Decision**:
  - In `frontend/src/lib/offlineCache.ts`, key all snapshots by `${workspaceId}:${item.id}` (using `getActiveWorkspaceId() || "none"`), store `workspaceId` inside `CachedItemSnapshot`, and add `clearOfflineCache()` to wipe both `memoryFallback` and the `item-snapshots` IndexedDB object store.
  - In `frontend/src/pages/ItemDetailPage.tsx`, check `if (err instanceof ApiError && [401, 403, 404].includes(err.status)) throw err;` before consulting `getCachedItemSnapshot`, ensuring authorization or cross-vault not-found responses never render stale offline data.
  - Include the active workspace ID in React Query keys or ensure `refreshUserSession` and `handleLogout` in `frontend/src/App.tsx` await `clearOfflineCache()` and delete both `"api-items-valuation-cache"` and `"item-media-cache"` Workbox caches.
- **Rationale**: Keying by `workspaceId` plus clearing on vault switch/logout prevents both same-user cross-vault bleed and multi-user shared-browser leakage without breaking offline coin-show access for the active vault.
- **Alternatives Considered**: Encrypting IndexedDB with a WebCrypto key derived from the JWT; rejected as unnecessary complexity once keys are partitioned by workspace and cleared on logout/vault switch.

### 2. Domain-Separated, Workspace-Epoch-Bound Media URL Signing & EXIF Stripping
- **Decision**:
  - Derive a dedicated media HMAC key via `hmac.new(settings.SECRET_KEY.encode(), b"stackerstash.media.v2", hashlib.sha256).digest()`.
  - Reduce `_BUCKET_SECONDS` in `backend/config/media_signing.py` from 7 days to 1 hour (`3600` seconds, max 2-hour rolling lifetime).
  - Add an integer `media_key_version` field (default `1`) on `Workspace` (incremented whenever a member is removed via `remove_workspace_member` or leaves via `leave_workspace`).
  - When `rel_path` matches `workspaces/<workspace_id>/...`, include the workspace's `media_key_version` (resolved or cached) in the HMAC verification check inside `serve_media` / `verify_signed_media_path`, rejecting deleted workspaces or stale epochs with HTTP `403`/`404`.
  - Add response headers on `serve_media`: `Cache-Control: private, max-age=3600, no-transform`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; img-src 'self'`, and `Referrer-Policy: same-origin`.
  - In `backend/apps/catalog/image_processing.py` (`_encode_processed_image` and `generate_image_thumbnail`), construct a clean pixel-only `Image` (or strip `img.info`) before `.save()` so EXIF GPS/device tags never persist at rest.
- **Rationale**: Requiring `Authorization: Bearer` headers on `<img src>` tags breaks standard browser image loading; binding short-lived signed URLs to `Workspace.media_key_version` preserves `<img src>` compatibility while guaranteeing immediate revocation when a collaborator is removed or a vault is deleted.

### 3. `OLLAMA_URL` SSRF Validation & Upstream Error Sanitization
- **Decision**:
  - Create a shared validator `validate_ollama_url(url: str) -> str` in `apps/accounts/models.py` (or `apps/catalog/importer.py`) that enforces `http`/`https` schemes, blocks credentials in URLs, blocks cloud metadata (`169.254.169.254`, `fd00:ec2::254`), blocks link-local/unspecified/multicast IPs, and blocks internal Kubernetes DNS suffixes (`.svc`, `.cluster.local`, `.internal`) and non-public IPs unless `settings.OLLAMA_ALLOW_PRIVATE_HOSTS` / `OLLAMA_ALLOWED_HOSTS` explicitly permits the host in local dev.
  - Invoke `validate_ollama_url` during `PUT /api/v1/settings/credentials/OLLAMA_URL`, `_post_ollama_chat`, and `_classify_with_local_ollama`.
  - Sanitize all exceptions in `apps/valuation/services.py` (`appraise_item`), `apps/valuation/tasks.py` (`process_deferred_ai_enrichment_task`), and `apps/vision/services.py` (`_post_ollama_chat`, `_parse_ollama_response`) via `_sanitize_error_message` and never include raw non-JSON body text from Ollama in `provider_errors`.
- **Rationale**: Closes the authenticated SSRF and response-exfiltration vector against internal cluster services (Postgres, Redis, kube-apiserver, cloud metadata) while still allowing legitimate self-hosted Ollama usage when explicitly permitted by the operator.

### 4. Server-Side Cross-Vault Isolation (`CertLookupCache` & `refresh_spot_prices`)
- **Decision**:
  - Add a nullable `workspace = models.ForeignKey(Workspace, null=True, blank=True, on_delete=models.CASCADE)` to `CertLookupCache` (with uniqueness on `(workspace, grading_service, cert_number)`) and hash free-text query keys (`NUMISTA`) with full SHA-256 (`hashlib.sha256(query.encode()).hexdigest()`), passing `workspace` into `lookup_cert_cache` / `store_cert_cache` when BYOK credentials are used.
  - Update `refresh_spot_prices(workspace: Workspace | None = None)` in `apps/valuation/services.py`: when called from `POST /api/v1/valuation/spots/refresh`, pass `workspace=request.workspace` so only the caller's active vault items are recalculated, and cache the upstream `gold-api.com` fetch for 60 seconds in Django cache to prevent cross-tenant DB lock contention and upstream rate-limit exhaustion. Keep `workspace=None` for the background Celery beat task.
- **Rationale**: Eliminates cross-vault cache poisoning, BYOK response leakage, and cross-tenant row locking on spot price refresh.

### 5. Invitation Privacy, JWT Password-Hash Binding, Rate Limiting & In-Flight Hardening
- **Decision**:
  - In `issue_access_token(user)`, include `"pwd": hashlib.sha256(user.password.encode()).hexdigest()[:16]` in the JWT payload and verify it in `WorkspaceAuth.authenticate` against `user.password` so any password change immediately invalidates all prior tokens.
  - Call `django.contrib.auth.password_validation.validate_password(password, user=...)` in `register` and `change_password`.
  - Add a lightweight Django cache-based rate limiter helper `enforce_rate_limit(request, scope, limit, window_seconds)` applied to `/auth/login`, `/auth/register`, `/auth/change-password`, `/auth/me` (DELETE), and `/auth/invites/{token}`.
  - In `preview_invite` (`GET /api/v1/auth/invites/{token}`), return `HttpError(410, ...)` if `inv.status != PENDING` or `inv.is_expired`, and mask `email`, `owner_email`, and `invited_by_email` (e.g. `a***@example.com`). In `accept_invite`, raise `HttpError(409, ...)` if `WorkspaceMembership.objects.filter(workspace=inv.workspace, user=request.user).exists()`. In `_serialize_invite`, blank out `token` and `invite_path` unless `inv.status == PENDING and not inv.is_expired`.
  - Add a small security-headers middleware in `backend/config/` that attaches `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, and (for `/api/` paths) `Cache-Control: no-store`.
  - Set `docs_url="/docs" if settings.DEBUG else None` and `openapi_url="/openapi.json" if settings.DEBUG else None` on `NinjaAPI`.
  - Parse `parse_qs(parsed.query)` in `_build_databases()` to pass `sslmode` (or `os.getenv("DB_SSLMODE")`) into `OPTIONS` for PostgreSQL.
  - Update `deploy/chart/templates/httproute.yaml` (and document the corresponding change for `~/Projects/Personal/HomeLab-Redo/stackerstash/templates/httproute.yaml`) to match `/super-admin` on the backend rule instead of `/admin`.

## Risks / Trade-offs

- **[Risk] Self-hosted Ollama on private LAN IPs blocked by default SSRF check** → Mitigation: Provide an operator environment setting `OLLAMA_ALLOWED_HOSTS` (comma-separated hostnames/IPs) that explicitly allowlists trusted Ollama hosts while keeping cloud metadata (`169.254.169.254`) and Kubernetes internal domains (`*.svc`, `*.cluster.local`) unconditionally blocked.
- **[Risk] Changing password logs out the current browser session if token is not refreshed** → Mitigation: Return a fresh `access_token` from `POST /api/v1/auth/change-password` (or update the stored token in the frontend) so the user who changed their password stays signed in while all other sessions are revoked.
- **[Risk] Public invite landing page (`/invite/:token`) shows masked email addresses** → Mitigation: Masking (`p***@example.com`) still lets the recipient recognize which email account to sign in with while preventing unauthenticated Pll harvesting.

## Migration Plan

1. Apply additive Django migrations for `Workspace.media_key_version` and `CertLookupCache.workspace`.
2. Deploy backend and frontend images with updated signing, cache isolation, SSRF validation, rate limiting, and security headers.
3. Update the `HTTPRoute` path rule from `/admin` to `/super-admin` during Helm release rollout.

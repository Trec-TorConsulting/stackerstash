# identity-tenancy Specification Delta

## MODIFIED Requirements

### Requirement: User registration and authentication
The system SHALL allow users to register, authenticate, and maintain authenticated sessions across mobile PWA and desktop browsers while enforcing configured password validators and binding JWT access tokens to the user's current password hash so password changes immediately invalidate prior tokens.

#### Scenario: User signs up and logs in
- **WHEN** a new user submits valid registration credentials and logs in
- **THEN** the system creates a dedicated default workspace for that user and issues an authenticated session

#### Scenario: Invalid credentials rejected
- **WHEN** a user submits an incorrect password or unknown email
- **THEN** the system rejects the request with HTTP 401 and does not leak account existence

#### Scenario: Common or numeric-only password rejected on registration and password change
- **WHEN** a user attempts to register or change their password using a common password (such as `"password123"`) or a purely numeric password (such as `"12345678"`)
- **THEN** the system evaluates Django's configured `AUTH_PASSWORD_VALIDATORS` and rejects the request with HTTP 400 and a descriptive validation message

#### Scenario: Password change immediately revokes prior JWT access tokens
- **WHEN** an authenticated user changes their password via `POST /api/v1/auth/change-password`
- **THEN** any JWT access token issued before the password change fails authentication with HTTP 401 on subsequent API requests, and the password-change response (or re-login) provides a fresh valid token

### Requirement: Workspace tenant isolation
The system SHALL isolate all collection items, containers, photos, valuations, and background identification or appraisal jobs strictly to the authenticated user's active vault (`Workspace`), while allowing BYOK provider credentials to resolve with primary-vault inheritance and per-vault overrides.

#### Scenario: Cross-tenant access blocked
- **WHEN** an authenticated user requests an item, container, or photo belonging to another user's workspace
- **THEN** the system denies access and returns HTTP 404 or 403 without exposing any record metadata

#### Scenario: Isolation across a user's own vaults
- **WHEN** a user owns Vault A and Vault B and creates items, containers, or slab certification numbers in Vault A
- **THEN** Vault B displays zero items or containers from Vault A and permits cataloging items with distinct or matching cert numbers independently within Vault B

### Requirement: Active vault switching via request header
The system SHALL resolve the active vault from the `X-Workspace-Id` request header (falling back to the user's default vault when omitted), scope client caches per active vault, and handle invalid or unauthorized vault headers without invalidating the user's session.

#### Scenario: Switch active vault on API requests
- **WHEN** a client sends an authenticated request with `X-Workspace-Id` set to a vault the user belongs to
- **THEN** `/auth/me`, `/settings/*`, `/catalog/*`, `/valuation/*`, `/analytics/*`, and `/vision/*` execute strictly against that vault

#### Scenario: Stale or unauthorized X-Workspace-Id header handled safely
- **WHEN** a client sends a malformed UUID, deleted vault ID, or unowned vault ID in `X-Workspace-Id` alongside a valid bearer token
- **THEN** the system rejects the request with HTTP 400 (malformed ID) or HTTP 403 (unauthorized/unavailable vault) instead of HTTP 500 or HTTP 401, keeping the user's JWT session valid and allowing the client to fall back to the default vault

#### Scenario: Client cache isolation when switching vaults
- **WHEN** a user switches active vaults in the web or PWA client
- **THEN** the client persists the selected vault ID, clears/invalidates active React Query caches, and partitions offline Workbox/IndexedDB responses by active vault ID so items or metrics from the previous vault never bleed into the newly selected vault

#### Scenario: Offline IndexedDB cache never serves unauthorized or cross-vault items on 403 or 404
- **WHEN** a user switches from Vault A to Vault B (or loses access to a shared vault) and requests an item ID that existed in Vault A, causing the API to return HTTP 403 or HTTP 404
- **THEN** the client does not fall back to the IndexedDB snapshot from Vault A and surfaces the not-found/unauthorized error

#### Scenario: Logout purges all client-side vault and media caches
- **WHEN** a user logs out of the web or PWA client
- **THEN** the client clears the auth token, active workspace ID, React Query memory cache, IndexedDB offline item snapshots (`stackerstash-offline`), and Workbox runtime caches (`api-items-valuation-cache` and `item-media-cache`)

## ADDED Requirements

### Requirement: Domain-separated workspace-bound media path signing
The system SHALL sign uploaded media URLs with a domain-separated HMAC key derived from `SECRET_KEY`, bound to a short-lived expiry window (at most 24 hours) and the target workspace's active media epoch so revoked memberships or deleted workspaces invalidate previously signed media URLs.

#### Scenario: Valid signed media request served with private security headers
- **WHEN** a client requests a signed media path `/media/s/{exp}/{sig}/workspaces/{workspace_id}/items/{item_id}/{file}` with a valid signature for an existing workspace
- **THEN** the server serves the file with `Cache-Control: private, no-transform`, `X-Content-Type-Options: nosniff`, and `Content-Security-Policy: default-src 'none'; img-src 'self'`

#### Scenario: Signed media URL invalidated when member is removed or workspace is deleted
- **WHEN** a collaborator is removed from a shared vault (or leaves the vault, or the vault is deleted), advancing or removing the workspace media epoch
- **THEN** any previously issued signed media URL for that workspace fails verification with HTTP 403 or HTTP 404

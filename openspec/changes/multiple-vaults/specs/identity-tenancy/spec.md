## MODIFIED Requirements

### Requirement: Workspace tenant isolation
The system SHALL isolate all collection items, containers, photos, valuations, and background identification or appraisal jobs strictly to the authenticated user's active vault (`Workspace`), while allowing BYOK provider credentials to resolve with primary-vault inheritance and per-vault overrides.

#### Scenario: Cross-tenant access blocked
- **WHEN** an authenticated user requests an item, container, or photo belonging to another user's workspace
- **THEN** the system denies access and returns HTTP 404 or 403 without exposing any record metadata

#### Scenario: Isolation across a user's own vaults
- **WHEN** a user owns Vault A and Vault B and creates items, containers, or slab certification numbers in Vault A
- **THEN** Vault B displays zero items or containers from Vault A and permits cataloging items with distinct or matching cert numbers independently within Vault B

### Requirement: Encrypted BYOK API key vault
The system SHALL allow each vault owner to store, update, and delete personal API credentials (Gemini, Groq, OpenRouter, PCGS, Greysheet, Numista, NumisMedia, eBay, PriceCharting, PSA, Pokémon TCG, TCGplayer, Collectr, Ollama URL/Model) encrypted at rest and never returned in plaintext after save, automatically falling back to the owner's default vault credential when a secondary vault has no per-vault override.

#### Scenario: Save and mask provider key
- **WHEN** a user saves a Gemini, Groq, OpenRouter, or PCGS API key in settings for the active vault
- **THEN** the system encrypts the credential at rest for that vault and returns only a masked suffix with override provenance in subsequent settings responses

#### Scenario: Secondary vault inherits default vault key
- **WHEN** a user has a Gemini or PCGS key saved on their default vault and switches to a newly created secondary vault with no local key configured
- **THEN** Vision AI, appraisals, deferred AI enrichment, and Ollama auto-sort automatically use the default vault's decrypted credential and Settings displays the key as inherited from the default vault

#### Scenario: Per-vault override and safe override removal
- **WHEN** a user saves a different API key on a secondary vault and later deletes that key on the secondary vault
- **THEN** the secondary vault uses its override key while configured, and deleting the override removes only the secondary vault's record so the secondary vault reverts to inheriting the default vault's key without deleting it

#### Scenario: Clear provider key
- **WHEN** a user removes a stored provider credential from their default vault
- **THEN** the system deletes the encrypted secret from the default vault and stops using that provider for the default vault and any secondary vaults that do not define their own override

### Requirement: Operator admin portal
The system SHALL provide a role-restricted administrative portal for operators to inspect user accounts (with cross-vault aggregated item, container, and market-value totals), workspaces, background job health, and system configuration.

#### Scenario: Non-staff user blocked from admin portal
- **WHEN** a standard collector user navigates to the admin portal
- **THEN** the system denies access and requires staff/superuser privileges

#### Scenario: User row aggregates metrics across multiple vaults
- **WHEN** an operator views the admin users list for a collector who owns 3 vaults with items in multiple vaults
- **THEN** the user summary reports `workspace_count` = 3, identifies their default `primary_workspace`, and aggregates `item_count`, `container_count`, and `total_market_value` across all vaults the user belongs to

## ADDED Requirements

### Requirement: Multi-vault creation and listing
The system SHALL allow authenticated users to create additional isolated vaults (`Workspace` records with name, optional description, currency, and auto-sort preference) and list all vaults they belong to, automatically marking the signup vault as default.

#### Scenario: Create a secondary vault
- **WHEN** an authenticated user submits `POST /api/v1/auth/workspaces` with a valid vault name (such as `"IRA Bullion"`) and optional description
- **THEN** the system creates a new workspace owned by that user with a unique slug, `is_default = false`, and owner membership, returning HTTP 201

#### Scenario: Empty or whitespace-only vault name rejected
- **WHEN** an authenticated user submits `POST /api/v1/auth/workspaces` or `PATCH /api/v1/auth/workspaces/{workspace_id}` with an empty or whitespace-only name
- **THEN** the system rejects the request with HTTP 400 and makes no database changes

#### Scenario: List user vaults with summary metrics
- **WHEN** an authenticated user requests `GET /api/v1/auth/workspaces`
- **THEN** the system returns all vaults where the user has membership, ordered with the default vault first, including `id`, `name`, `slug`, `description`, `default_currency`, `auto_sort_enabled`, `is_default`, `item_count`, and `total_market_value`

### Requirement: Vault editing, default assignment, and safe deletion
The system SHALL allow vault owners to edit vault metadata, designate any owned vault as their default vault, and delete a vault while preserving non-overridden credentials on default transfer and preventing deletion of the user's final remaining vault.

#### Scenario: Designate another vault as default
- **WHEN** an authenticated owner invokes `POST /api/v1/auth/workspaces/{workspace_id}/set-default` on a secondary vault
- **THEN** the system sets `is_default = false` on the user's prior default vault, persists `is_default = true` on the target vault, and resolves future fallback BYOK credentials from the new default vault

#### Scenario: Delete a secondary vault
- **WHEN** an authenticated owner deletes a non-default vault via `DELETE /api/v1/auth/workspaces/{workspace_id}` while owning at least one other vault
- **THEN** the system removes the vault and its scoped items, containers, photos, and overrides, and returns HTTP 204

#### Scenario: Delete the current default vault while another owned vault exists
- **WHEN** an authenticated owner deletes their default vault while another owned vault exists
- **THEN** the system promotes the earliest remaining owned vault to `is_default = true`, migrates any provider credentials from the deleted default vault that the new default vault does not already override, and then deletes the old vault

#### Scenario: Prevent deleting the last remaining vault
- **WHEN** an authenticated user attempts to delete their only remaining vault
- **THEN** the system rejects the request with HTTP 400 so every user retains at least one vault

#### Scenario: Block modifying or deleting another user's vault
- **WHEN** an authenticated user attempts to update, set default, or delete a vault they do not own
- **THEN** the system rejects the request with HTTP 403 or 404 without modifying the target vault

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

### Requirement: Navigation vault switcher and settings management UI
The system SHALL provide a persistent active-vault switcher (including quick vault creation) in both desktop and mobile navigation, and a dedicated My Vaults management section in Settings.

#### Scenario: Switch vault from desktop sidebar or mobile header
- **WHEN** a signed-in user selects a different vault from the Vault Switcher in the sidebar or mobile top bar
- **THEN** the client updates the active `X-Workspace-Id`, displays the selected vault name, and immediately refreshes Dashboard, Vault, Containers, Scan/Add, and Settings data for that vault

#### Scenario: Create and manage vaults in Settings
- **WHEN** a signed-in user opens Settings and uses the My Vaults section
- **THEN** they can create a new vault, edit any owned vault's name, description, currency, and auto-sort setting, set a default vault, and delete a non-last vault after confirming the destructive action

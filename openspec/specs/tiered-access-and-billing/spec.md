# tiered-access-and-billing Specification

## Purpose
Defines Stacker Stash's four-tier SaaS entitlement matrix (`Free`, `$9.99`, `$19.99`, `$99.99`), owned-vault and active-item quota enforcement, Stripe subscription billing, Global Admin overrides, self-hosted bypass configuration, and `$99.99` Dedicated Server provisioning tracking.

## Requirements

### Requirement: Four-tier subscription entitlement catalog
The system SHALL define four plan tiers—`FREE` (`$0/mo`, `1` owned vault, `100` active items), `PLUS` (`$9.99/mo`, `10` owned vaults, unlimited items), `UNLIMITED` (`$19.99/mo`, unlimited vaults, unlimited items), and `DEDICATED` (`$99.99/mo`, dedicated server with unlimited vaults and unlimited items)—defaulting new accounts to `FREE` and keeping CSV import, BYOK AI, and Shared Vaults available across all tiers.

#### Scenario: New user defaults to Free tier
- **WHEN** a new user registers and authenticates
- **THEN** `GET /api/v1/billing/status` (and `/api/v1/auth/me`) reports effective tier `FREE` with `max_vaults = 1`, `max_items = 100`, and current usage counters

#### Scenario: Public plans catalog returns all four tiers
- **WHEN** a client requests `GET /api/v1/billing/plans`
- **THEN** the system returns HTTP 200 with structured pricing, vault limits, item limits, and dedicated-server flags for `FREE`, `PLUS`, `UNLIMITED`, and `DEDICATED`

#### Scenario: Core features remain unlocked across all tiers
- **WHEN** an authenticated `FREE` user runs CSV import, BYOK Vision AI, appraisals, or shares their single vault with collaborators
- **THEN** the system allows those actions provided vault and item quotas are not exceeded

### Requirement: Owned-vault quota enforcement
When tier enforcement is active, the system SHALL cap the number of vaults owned by a user according to their active tier (`1` on `FREE`, `10` on `PLUS`, unlimited on `UNLIMITED` and `DEDICATED`), returning HTTP `402` with structured quota details on overflow while excluding collaborator memberships on other users' vaults.

#### Scenario: Free user blocked from creating a second owned vault
- **WHEN** a `FREE` user who already owns `1` vault calls `POST /api/v1/auth/workspaces`
- **THEN** the system rejects the request with HTTP 402 and structured code `PLAN_LIMIT_REACHED` (`limit_type: "vaults"`)

#### Scenario: Plus user can create up to ten owned vaults
- **WHEN** a `PLUS` (`$9.99/mo`) user owns `9` vaults and creates a `10`th vault, then attempts an `11`th vault
- **THEN** the `10`th vault succeeds with HTTP 201 and the `11`th vault is rejected with HTTP 402

#### Scenario: Shared collaborator memberships do not count toward owned-vault quota
- **WHEN** a `FREE` user owns `1` personal vault and accepts invitations to `3` shared vaults as `EDITOR` or `VIEWER`
- **THEN** all `3` shared vault acceptances succeed without hitting the `1`-vault ownership limit

### Requirement: Active catalog-entry item quota enforcement
When tier enforcement is active, the system SHALL count non-`SOLD` catalog entries (`1` database entry = `1` item regardless of `quantity`) across all vaults owned by the vault owner and enforce the `100`-item cap on `FREE` accounts across item creation, CSV import, and reactivating `SOLD` items, preserving existing records without deletion on downgrade.

#### Scenario: Free vault allows 100 active entries including multi-unit lots
- **WHEN** a `FREE` user catalogs `100` active entries (including a quantity-`20` coin tube counted as `1` entry) and attempts to create a `101`st non-`SOLD` item
- **THEN** the first `100` entries succeed and the `101`st entry is rejected with HTTP 402 (`limit_type: "items"`)

#### Scenario: Sold items do not consume active quota unless reactivated
- **WHEN** a `FREE` user has `100` `IN_COLLECTION` items and `10` `SOLD` items, and attempts to change one `SOLD` item back to `IN_COLLECTION`
- **THEN** the system rejects the status change with HTTP 402 until an active slot is freed or the account upgrades

#### Scenario: CSV import stops at remaining quota
- **WHEN** a `FREE` user with `95` active items submits a mapped or raw CSV import containing `12` active rows
- **THEN** the importer creates the first `5` valid active items up to `100`, stops adding active rows beyond the cap, and reports row-level quota errors for the remaining rows (or returns HTTP 402 if `0` slots remain before import)

#### Scenario: Downgraded account retains existing items without data loss
- **WHEN** a paid account with `3` owned vaults and `250` active items reverts to `FREE`
- **THEN** all `3` vaults and `250` items remain viewable, editable, exportable, and appraisable, while creating new owned vaults or new active items is blocked with HTTP 402

#### Scenario: Shared vault enforces the vault owner's item quota
- **WHEN** a `PLUS` (`$9.99/mo`) owner shares a vault with a `FREE`-tier `EDITOR` who adds item `#105` to that shared vault
- **THEN** the item creation succeeds because the quota is evaluated against the vault owner's `PLUS` entitlement

### Requirement: Stripe subscription checkout, portal, and webhook lifecycle
The system SHALL integrate Stripe Checkout (`POST /api/v1/billing/checkout`), Stripe Customer Billing Portal (`POST /api/v1/billing/portal`), and signature-verified webhooks (`POST /api/v1/billing/webhook`) to activate, upgrade, renew, and cancel paid tiers.

#### Scenario: User initiates Checkout and webhook activates paid tier
- **WHEN** an authenticated user creates a Checkout session for `PLUS`, `UNLIMITED`, or `DEDICATED` and Stripe delivers a valid `checkout.session.completed` webhook event
- **THEN** the system records the Stripe customer/subscription IDs, updates the user's active tier and billing period, and immediately unlocks the new vault/item limits

#### Scenario: Subscription deletion reverts user to Free tier
- **WHEN** Stripe delivers a valid `customer.subscription.deleted` webhook event for an account without an active Global Admin override
- **THEN** the system transitions the account subscription back to `FREE`

#### Scenario: Invalid Stripe webhook signature rejected
- **WHEN** `POST /api/v1/billing/webhook` receives a payload with a missing or invalid `Stripe-Signature` header
- **THEN** the system rejects the request with HTTP 400 without modifying any subscription state

### Requirement: Self-hosted tier enforcement toggle and Global Admin overrides
The system SHALL provide a configuration flag (`BILLING_ENFORCE_TIERS`) to bypass quota paywalls on self-hosted instances and allow Global Admins to inspect user usage/tiers and assign or clear manual tier overrides.

#### Scenario: Self-hosted deployment disables quota paywalls
- **WHEN** `BILLING_ENFORCE_TIERS` is configured to `false`
- **THEN** `/api/v1/billing/status` reports `enforce_tiers: false` and users may create unlimited vaults and items without a Stripe subscription

#### Scenario: Global Admin assigns or clears a user tier override
- **WHEN** a Global Admin updates a collector's subscription tier to `UNLIMITED` or `DEDICATED` via `PATCH /api/v1/admin/users/{user_id}/subscription`
- **THEN** the system applies the override immediately (`source = ADMIN_OVERRIDE`) and preserves it across unrelated webhook events until cleared

### Requirement: Dedicated server plan tracking and provisioning workflow
When a user activates the `$99.99` `DEDICATED` tier (via Stripe Checkout or Global Admin override), the system SHALL immediately grant unlimited vaults and items, create or update a dedicated instance provisioning record (`REQUESTED`, `PROVISIONING`, `ACTIVE`, `SUSPENDED`), and allow Global Admins to publish the assigned dedicated server URL.

#### Scenario: Subscribing to Dedicated tier creates provisioning record
- **WHEN** a user completes checkout or receives a `DEDICATED` tier assignment
- **THEN** the system creates a `DedicatedServerInstance` record in `REQUESTED` status (if none exists) and surfaces its live provisioning status on the user's Billing view

#### Scenario: Global Admin marks dedicated server active with URL
- **WHEN** a Global Admin updates a dedicated instance to `ACTIVE` with `dedicated_url = "https://acme.stackerstash.com"` via `PATCH /api/v1/admin/dedicated-instances/{instance_id}`
- **THEN** the user's Billing view displays the `Active` status badge and an **Open Dedicated Server** link to that URL

### Requirement: Tiered pricing, billing dashboard, and quota-limit UX
The frontend SHALL display all four access tiers on the Marketing page, render current tier, usage progress, dedicated instance status, and Stripe upgrade/manage controls in Settings, and surface an upgrade prompt when an API action returns HTTP `402`.

#### Scenario: Marketing page displays four-tier pricing grid
- **WHEN** a visitor views the `#tiers` section of the Marketing page
- **THEN** all four tiers (`Free`, `$9.99/mo`, `$19.99/mo`, and `$99.99/mo Dedicated Servers`) are presented with accurate vault and item entitlements

#### Scenario: Settings Billing card shows live usage and upgrade actions
- **WHEN** a signed-in user opens Settings while `enforce_tiers` is `true`
- **THEN** the Plan & Billing section shows their current tier, owned vaults used vs. limit, active items used vs. limit, and buttons to upgrade via Stripe Checkout or open the Billing Portal

#### Scenario: Quota limit HTTP 402 triggers upgrade prompt
- **WHEN** a user hits the `1`-vault or `100`-item cap during vault creation, Scan/Add save, or CSV import
- **THEN** the UI presents a clear message explaining the tier cap alongside a direct link/action to upgrade in Settings Billing

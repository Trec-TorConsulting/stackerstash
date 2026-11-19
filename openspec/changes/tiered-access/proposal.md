# Proposal

## Why

As Stackers Stash expands from single-vault tracking into multiple vaults and shared collaboration on `stackerstash.com`, the platform needs commercial SaaS subscription tiers with enforceable vault and item quotas alongside a dedicated-server offering—while keeping self-hosted deployments configurable via an enforcement toggle and allowing operators to manage comped or enterprise tiers directly.

## What Changes

- **Four-Tier Subscription Model & Plan Catalog**: Introduce subscription entitlements (`AccountSubscription`) with four tiers:
  - **Free (`$0/mo`)**: `1` owned vault / `100` active catalog entries (non-`SOLD` `CollectionItem` rows).
  - **Plus (`$9.99/mo`)**: `10` owned vaults / unlimited items.
  - **Unlimited (`$19.99/mo`)**: unlimited owned vaults / unlimited items.
  - **Dedicated (`$99.99/mo`)**: dedicated server deployment with dedicated unlimited vaults / unlimited items.
- **Stripe Billing Integration & Self-Hosted Toggle**: Add `stripe` Checkout Session creation, Customer Billing Portal links, and signature-verified Stripe webhooks (`/api/v1/billing/webhook`) for activating, renewing, upgrading, and canceling paid tiers—plus a `BILLING_ENFORCE_TIERS` environment flag so self-hosted operators can run unmetered.
- **Vault & Item Quota Enforcement**: Enforce owned-vault limits on vault creation (`POST /api/v1/auth/workspaces`) and active non-`SOLD` catalog entry limits across item creation (`POST /api/v1/catalog/items`), CSV imports (`/import/csv`, `/import/mapped`), and re-activating `SOLD` items—evaluated against the vault owner's active tier and preserving read/edit access to existing items on downgrade without deleting user data. Feature access (CSV import, BYOK AI, and Shared Vaults) remains available across all tiers.
- **Dedicated Server Entitlement & Provisioning Registry (`$99.99/mo`)**: Automatically create and track a `DedicatedServerInstance` record (`REQUESTED` → `PROVISIONING` → `ACTIVE` → `SUSPENDED`) with target subdomain/URL and operator notes when a user subscribes or is upgraded to `DEDICATED`, granting unlimited vaults/items immediately and displaying the dedicated instance URL once active.
- **Global Admin Override & Billing/Marketing UI**: Allow Global Admins in `AdminPortalPage` (`admin_api.py`) to inspect user subscription usage, override any user's tier (`ADMIN_OVERRIDE`), and update `DedicatedServerInstance` status/URL; add a Billing & Plan section in `SettingsPage` (or `/billing`) with live quota meters and upgrade modals; and update `MarketingPage` `#tiers` to present all four tiers accurately.

## Capabilities

### New Capabilities
- `tiered-access-and-billing`: Four-tier SaaS entitlement matrix (`Free`, `$9.99`, `$19.99`, `$99.99`), owned-vault and active-item quota enforcement, Stripe Checkout/Portal/Webhook billing lifecycle, Global Admin tier overrides, self-hosted bypass toggle, and `$99.99` Dedicated Server provisioning status tracking.

### Modified Capabilities
<!-- None; all tiering, Stripe billing, quota enforcement, and dedicated-instance tracking live cleanly in tiered-access-and-billing. -->

## Impact

- **Backend**: `backend/pyproject.toml` (`stripe` dependency), `backend/config/settings.py` (`BILLING_ENFORCE_TIERS`, `STRIPE_*` config), `backend/config/api.py`, `backend/apps/accounts/models.py` (`AccountSubscription`, `DedicatedServerInstance`, `PlanTier` + migration, quota check helpers), `backend/apps/accounts/billing_api.py` (new billing/plans/checkout/portal/webhook router), `backend/apps/accounts/api.py` (vault creation quota check + plan summary on `/auth/me`), `backend/apps/accounts/admin.py`, `backend/apps/accounts/admin_api.py` (tier override & dedicated instance endpoints), `backend/apps/catalog/api.py` & `backend/apps/catalog/importer.py` (100-item quota enforcement).
- **Frontend**: `frontend/src/lib/api.ts`, `frontend/src/pages/SettingsPage.tsx` (Plan & Billing card, usage meters, Upgrade & Manage Subscription actions, Dedicated Server status card), `frontend/src/pages/MarketingPage.tsx` (4-tier pricing section), `frontend/src/pages/AdminPortalPage.tsx` (user tier management & Dedicated Instances tab), `frontend/src/pages/ScanAddPage.tsx`, `frontend/src/components/ImportWizardModal.tsx`, `frontend/src/components/VaultSwitcher.tsx` (friendly upgrade CTA when `402 PLAN_LIMIT_REACHED` occurs).
- **Tests & Docs**: `backend/tests/test_billing.py` (new), `backend/tests/test_admin_api.py`, `frontend/src/__tests__/billing.test.tsx` (new), `frontend/src/__tests__/app.test.tsx`, `.env.example`, `docs/USER_GUIDE.md`.

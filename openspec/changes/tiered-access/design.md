# Design

## Context

See `proposal.md` for motivation and scope. Relevant codebase constraints observed:
- `backend/pyproject.toml` has no Stripe SDK installed yet, and `.env.example` / `backend/config/settings.py` contain no billing or tier-enforcement settings.
- `MarketingPage.tsx` currently renders two static tier cards (`Collector Vault (Free)` and `Self-Hosted / Family Cluster`), and `frontend/src/__tests__/app.test.tsx` asserts `"Collector Vault (Free)"` appears on `MarketingPage`.
- Item creation (`catalog/api.py`: `create_item`, `update_item`, `bulk_update_items`, `import_items_csv`) and mapped CSV import (`catalog/importer.py`: `import_mapped_csv`) create or update `CollectionItem` rows without checking account quotas.
- `AdminPortalPage.tsx` and `backend/apps/accounts/admin_api.py` currently expose `overview`, `users`, and `workspaces`, with no subscription override or dedicated-instance management endpoints.
- `openspec/specs/k3s-deployment/spec.md` describes the HomeLab K3s production cluster; Dedicated Server provisioning is operator-assisted rather than automated inside the web app.

## Goals / Non-Goals

**Goals:**
- Define a deterministic entitlement engine supporting `FREE`, `PLUS` (`$9.99/mo`), `UNLIMITED` (`$19.99/mo`), and `DEDICATED` (`$99.99/mo`) plus a `BILLING_ENFORCE_TIERS` toggle for self-hosted deployments.
- Enforce quotas strictly against owned vaults (`Workspace.owner == user`) and active non-`SOLD` catalog entries across every creation/reactivation/import code path without ever deleting user data on downgrade.
- Support Stripe Checkout, Billing Portal, and signature-verified webhooks while preserving explicit Global Admin overrides.
- Provide clear upgrade UX on HTTP `402` responses without altering existing single-vault test fixtures.

**Non-Goals:**
- Automated Kubernetes/Helm provisioning from the Django backend.
- Annual billing intervals, metered AI token billing, or gating CSV import, BYOK AI, or Shared Vaults behind paid tiers.

## Decisions

### 1. Plan Catalog, `AccountSubscription`, and `DedicatedServerInstance` Models
- **Choice**:
  - Define `PlanTier` choices (`FREE`, `PLUS`, `UNLIMITED`, `DEDICATED`) and `PLAN_CATALOG` metadata in `backend/apps/accounts/models.py` (`FREE`: 1 owned vault / 100 active items; `PLUS`: 10 owned vaults / unlimited items; `UNLIMITED`: unlimited / unlimited; `DEDICATED`: unlimited / unlimited + dedicated server).
  - Add `AccountSubscription` (`OneToOneField(User, related_name="subscription")`) with `tier`, `source` (`DEFAULT`, `STRIPE`, `ADMIN_OVERRIDE`), `status` (`ACTIVE`, `TRIALING`, `PAST_DUE`, `CANCELED`, `INCOMPLETE`), `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id`, `current_period_end`, `cancel_at_period_end`, `admin_notes`, `created_at`, `updated_at`.
  - Add `DedicatedServerInstance` (`OneToOneField(User, related_name="dedicated_instance")`) with `status` (`REQUESTED`, `PROVISIONING`, `ACTIVE`, `SUSPENDED`), `requested_subdomain`, `dedicated_url`, `admin_notes`, `provisioned_at`, `created_at`, `updated_at`.
- **Rationale**: Keeping `AccountSubscription` lazy-created via `get_or_create_subscription(user)` ensures existing `User` test fixtures (`user_a`, `user_b`) and legacy DB rows default safely to `FREE` without fragile signal side effects.
- **Alternative considered**: Storing `tier` directly on `Workspace` — rejected because tier limits (`10` vaults, `100` items) are user-account entitlements spanning multiple vaults.

### 2. Quota Evaluation, Shared Vault Ownership & HTTP `402` Contract
- **Choice**:
  - When `settings.BILLING_ENFORCE_TIERS` is `False`, entitlement checks short-circuit as unlimited (`enforce_tiers = False`).
  - When `True`:
    - **Owned-vault quota**: `Workspace.objects.filter(owner=user).count() >= max_owned_vaults` blocks `POST /api/v1/auth/workspaces` with HTTP `402` (`{ detail, code: "PLAN_LIMIT_REACHED", limit_type: "vaults", current_usage, limit, current_tier }`). Collaborator memberships (`EDITOR`/`VIEWER`) in other users' vaults never consume the collaborator's owned-vault quota.
    - **Active-item quota**: Count non-`SOLD` catalog entries (`CollectionItem.objects.filter(workspace__owner=workspace.owner).exclude(status=SOLD).count()`). Enforced against `workspace.owner`'s tier in:
      1. `create_item` (when `payload.status != SOLD`),
      2. `update_item` (when transitioning `item.status == SOLD` -> non-`SOLD`),
      3. `bulk_update_items` (when transitioning `SOLD` items to non-`SOLD` and `count > remaining_slots`),
      4. `import_items_csv` and `import_mapped_csv` (rejecting with HTTP `402` if `remaining_slots == 0` when active rows are present, or importing active rows up to `remaining_slots` and reporting row-level quota errors on overflow rows while allowing `SOLD` rows).
- **Rationale**: Counting `CollectionItem` rows (excluding `SOLD`) directly matches the user's decision (a tube of 20 coins counts as 1 catalog entry) and checking `workspace.owner`'s tier prevents bypassing Free caps via Shared Vaults while allowing paid Owners' Free collaborators to catalog freely. Returning HTTP `402` avoids triggering `apiFetch`'s `401` auto-logout.

### 3. Stripe Integration & Webhook Precedence
- **Choice**:
  - Add `stripe>=11.0.0` to `backend/pyproject.toml` and settings (`BILLING_ENFORCE_TIERS`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_UNLIMITED`, `STRIPE_PRICE_DEDICATED`, `APP_BASE_URL`).
  - Implement `billing_router` (`backend/apps/accounts/billing_api.py`) mounted at `/api/v1/billing`:
    - `GET /plans` (no auth)
    - `GET /status` (`WorkspaceAuth` — returns tier, limits, usage, `enforce_tiers`, and `dedicated_instance`)
    - `POST /checkout` (`WorkspaceAuth` — creates Stripe Customer if missing and Checkout Session for `PLUS`/`UNLIMITED`/`DEDICATED`)
    - `POST /portal` (`WorkspaceAuth` — opens Stripe Customer Portal for existing `stripe_customer_id`)
    - `POST /webhook` (no auth — verifies `Stripe-Signature` using `request.body` and `STRIPE_WEBHOOK_SECRET`, returning `400` on invalid signature)
  - Webhook handler updates `AccountSubscription` on `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted`, and calls `ensure_dedicated_instance(user)` when tier is `DEDICATED`. If `sub.source == ADMIN_OVERRIDE`, webhooks ignore tier downgrades/changes unless the override is cleared by an admin.
- **Rationale**: Clean isolation in `billing_api.py` makes Stripe easy to mock in pytest while keeping `accounts/api.py` focused on auth and vaults.

### 4. Global Admin Overrides & Dedicated Instance Management
- **Choice**:
  - Extend `AdminUserOut` (`backend/apps/accounts/admin_api.py`) with `tier`, `subscription_source`, `owned_vault_count`, and `active_item_count`.
  - Add `PATCH /api/v1/admin/users/{user_id}/subscription` (assign `tier` + `source = ADMIN_OVERRIDE` or clear override back to `DEFAULT`/`STRIPE`) and `GET/PATCH /api/v1/admin/dedicated-instances` in `admin_api.py`.
  - Assigning `DEDICATED` automatically creates/retains `DedicatedServerInstance` (`REQUESTED`), which admins transition through `PROVISIONING` -> `ACTIVE` with `dedicated_url`.

### 5. Frontend Billing, Pricing & `402` Upgrade UX
- **Choice**:
  - Update `MarketingPage.tsx` `#tiers` to render the 4-tier pricing grid while retaining the `"Collector Vault (Free)"` heading text so existing tests remain intact.
  - Add **Plan & Billing** card to `SettingsPage.tsx` displaying active plan badge, Owned Vaults and Active Items usage bars, upgrade buttons (calling `/billing/checkout`), Manage Subscription (calling `/billing/portal`), Dedicated Server status/URL card, or a "Self-Hosted Mode (Unmetered)" badge when `enforce_tiers === false`.
  - Enhance `apiFetch` (`frontend/src/lib/api.ts`) to expose `code` / `limit_type` on `ApiError` (`402`) so `VaultSwitcher`, `ScanAddPage`, and `ImportWizardModal` display a clear quota-reached banner with a direct link to `/settings#billing`.
  - Add tier badge, quick Tier Override controls, and **Dedicated Servers** tab to `AdminPortalPage.tsx`.

## Risks / Trade-offs

- **Risk: Stripe API unavailable or unconfigured in local dev** → Mitigation: Return explicit `503` from `/billing/checkout` and `/billing/portal` when `STRIPE_SECRET_KEY` is blank, while `BILLING_ENFORCE_TIERS=false` or Admin Overrides work without Stripe keys.
- **Risk: Duplicate webhook delivery or out-of-order Stripe events** → Mitigation: Perform webhook subscription updates inside `@transaction.atomic`, use `get_or_create_subscription`, and verify `current_period_end` / subscription status cleanly.
- **Risk: Existing tests hit `100`-item or `1`-vault limit** → Mitigation: Existing backend/frontend test suites stay well below `1` owned vault and `100` items per test user; dedicated tests in `test_billing.py` verify quota enforcement and `BILLING_ENFORCE_TIERS=false`.

## Migration Plan

1. Add Django migration in `apps/accounts` creating `AccountSubscription` and `DedicatedServerInstance`.
2. Add optional `BILLING_ENFORCE_TIERS`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PRICE_*` keys to `.env.example` and `backend/config/settings.py` (with `BILLING_ENFORCE_TIERS` defaulting safely for local/production configs).
3. Deploy updated backend (with `stripe` installed in container) and frontend together.

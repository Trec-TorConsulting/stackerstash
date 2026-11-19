# Tasks

## 1. Subscription Models, Plan Catalog & Configuration

- [x] 1.1 Add `stripe>=11.0.0` to `backend/pyproject.toml` (and regenerate `backend/uv.lock` / verify install in `.venv`), and add `BILLING_ENFORCE_TIERS`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_UNLIMITED`, `STRIPE_PRICE_DEDICATED`, and `APP_BASE_URL` settings to `backend/config/settings.py` and `.env.example`. Verify settings load cleanly via `cd backend && .venv/bin/python manage.py check`.
- [x] 1.2 Add `PlanTier`, `PLAN_CATALOG`, `AccountSubscription`, `DedicatedServerInstance`, `get_or_create_subscription`, `ensure_dedicated_instance`, `get_user_entitlement_status`, `assert_can_create_vault`, and `assert_can_add_active_items` in `backend/apps/accounts/models.py`, register both models in `backend/apps/accounts/admin.py`, and generate the Django migration in `backend/apps/accounts/migrations/`. Add unit tests for tier catalog limits, active non-`SOLD` counting, and `BILLING_ENFORCE_TIERS=false` bypass in `backend/tests/test_billing.py` and verify with `.venv/bin/pytest tests/test_billing.py`.

## 2. Quota Enforcement Across Vaults, Catalog & Importer

- [x] 2.1 Add a `PlanLimitExceeded` exception handler returning HTTP `402` (`{ detail, code: "PLAN_LIMIT_REACHED", limit_type, current_usage, limit, current_tier }`) on `api` (`backend/config/api.py`), enforce `assert_can_create_vault` in `POST /api/v1/auth/workspaces` (`backend/apps/accounts/api.py`, ensuring collaborator memberships do not count toward owned vaults), and include lightweight `plan` summary fields on `/auth/me`. Add pytest coverage for `1`-vault (`FREE`), `10`-vault (`PLUS`), and unlimited (`UNLIMITED`/`DEDICATED`) limits in `backend/tests/test_billing.py` and verify with `.venv/bin/pytest tests/test_billing.py`.
- [x] 2.2 Enforce `assert_can_add_active_items` against `workspace.owner` across `create_item` (non-`SOLD`), `update_item` (`SOLD` -> non-`SOLD`), `bulk_update_items` (`SOLD` -> non-`SOLD`), and `import_items_csv` in `backend/apps/catalog/api.py` plus `import_mapped_csv` in `backend/apps/catalog/importer.py` (rejecting with HTTP `402` when `0` active slots remain or importing up to `remaining_slots` and recording row-level quota errors for excess rows, while always permitting existing item reads/edits/appraisals after downgrade). Add full pytest coverage (including multi-unit tube counting as `1` entry, `SOLD` exclusion, downgrade retention, and shared-vault owner quota) in `backend/tests/test_billing.py` and verify with `.venv/bin/pytest tests/test_billing.py`.

## 3. Stripe Billing Endpoints, Webhooks & Admin Overrides

- [x] 3.1 Implement `billing_router` (`backend/apps/accounts/billing_api.py`, mounted at `/api/v1/billing` in `backend/config/api.py`) with `GET /plans`, `GET /status`, `POST /checkout`, `POST /portal`, and signature-verified `POST /webhook` (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`), ensuring missing Stripe keys return `503`, invalid signatures return `400`, `DEDICATED` activation creates `DedicatedServerInstance`, and `ADMIN_OVERRIDE` subscriptions are preserved across webhook events. Add mocked Stripe unit tests in `backend/tests/test_billing.py` and run `.venv/bin/pytest tests/test_billing.py`.
- [x] 3.2 Extend `backend/apps/accounts/admin_api.py` with user tier/usage fields on `AdminUserOut`, `PATCH /api/v1/admin/users/{user_id}/subscription` (apply/clear `ADMIN_OVERRIDE`), and `GET /api/v1/admin/dedicated-instances` + `PATCH /api/v1/admin/dedicated-instances/{instance_id}` (`REQUESTED`/`PROVISIONING`/`ACTIVE`/`SUSPENDED`, `dedicated_url`, `admin_notes`). Add tests in `backend/tests/test_admin_api.py` and `backend/tests/test_billing.py`, and run `.venv/bin/pytest tests/test_admin_api.py tests/test_billing.py`.

## 4. Frontend Marketing Pricing, Billing Dashboard, Admin Controls & Quota UX

- [x] 4.1 Extend `frontend/src/lib/api.ts` with `PlanInfo`, `BillingStatus`, `DedicatedInstanceInfo`, structured `ApiError` (`status`, `code`, `limit_type`) handling for HTTP `402` responses, and `getPlans`, `getBillingStatus`, `createCheckoutSession`, `createPortalSession`, `adminUpdateUserSubscription`, `adminListDedicatedInstances`, and `adminUpdateDedicatedInstance` methods. Update `frontend/src/pages/MarketingPage.tsx` `#tiers` to showcase all four tiers (`Collector Vault (Free)`, `Plus $9.99/mo`, `Unlimited $19.99/mo`, `Dedicated Server $99.99/mo`) while preserving existing test assertions in `frontend/src/__tests__/app.test.tsx`. Verify with `cd frontend && npm test -- app`.
- [x] 4.2 Add the **Plan & Billing** section to `frontend/src/pages/SettingsPage.tsx` (current tier badge, Owned Vaults & Active Items meters, Self-Hosted Unmetered indicator when `enforce_tiers === false`, Stripe Checkout upgrade buttons for `PLUS`/`UNLIMITED`/`DEDICATED`, Manage Subscription portal button, and Dedicated Server status card with **Open Dedicated Server** link when `ACTIVE`), plus inline HTTP `402` upgrade prompts in `VaultSwitcher.tsx`, `ScanAddPage.tsx`, and `ImportWizardModal.tsx`. Add Vitest coverage in `frontend/src/__tests__/billing.test.tsx` and run `cd frontend && npm test -- billing`.
- [x] 4.3 Update `frontend/src/pages/AdminPortalPage.tsx` to display user tier badges and tier override controls in the Users tab plus a **Dedicated Servers** tab for managing `DedicatedServerInstance` status and `dedicated_url`. Add Vitest tests in `frontend/src/__tests__/billing.test.tsx` and run `cd frontend && npm test -- billing`.
- [x] 4.4 Document all four tiers, item/vault counting rules, Stripe Checkout/Billing Portal, Dedicated Server provisioning, and `BILLING_ENFORCE_TIERS` self-hosted configuration in `docs/USER_GUIDE.md`.

## 5. Full Regression Verification

- [x] 5.1 Run full backend tests (`cd backend && .venv/bin/pytest`), frontend typecheck & Vitest suite (`cd frontend && npx tsc --noEmit && npm test`), and production build (`cd frontend && npm run build`) and confirm zero errors across all suites.

## Workflow follow-up

- Create a feature branch, commit, push, open a PR, and merge into `main` per repository workflow.
- Run `/opsx-archive` on `tiered-access` after implementation and verification complete.

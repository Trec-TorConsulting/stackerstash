# Proposal

## Why

Collectors often separate distinct holdings—such as a personal bullion stack, an IRA metals account, a trading card collection, or a family/estate inventory—so each has its own dashboard KPIs, containers, exports, and cert-number uniqueness. Although Stacker Stash already models collections around `Workspace` (presented as a "Vault" in the UI) and accepts an `X-Workspace-Id` header in `WorkspaceAuth`, users currently have only a single auto-created vault with no API or UI to create, switch, rename, or delete vaults, and BYOK API credentials are queried strictly on the single workspace without fallback to the owner's primary vault.

## What Changes

- **Expose Workspaces as Multiple Vaults**: Add backend endpoints (`/api/v1/auth/workspaces` list/create, `/api/v1/auth/workspaces/{workspace_id}` update/delete, `/api/v1/auth/workspaces/{workspace_id}/set-default`) and include the user's accessible `workspaces` list plus active `workspace` metadata (`is_default`, `description`) in `/api/v1/auth/me`.
- **Active Vault Switching & Tenant Safety**: Persist the active vault ID in the frontend, attach `X-Workspace-Id` on every API call in `apiFetch`, scope/invalidate React Query and PWA runtime caches on vault switch, and harden `WorkspaceAuth` so malformed or stale/unauthorized `X-Workspace-Id` headers never cause unhandled 500 errors or wipe valid JWT sessions.
- **Persistent Vault Switcher & Vault Settings UI**: Add a Vault Switcher (with quick "New Vault" creation) in the desktop sidebar and mobile header (`Layout.tsx`), plus a **My Vaults** management section on `SettingsPage.tsx` for creating, editing (`name`, `description`, `default_currency`, `auto_sort_enabled`), setting a default vault, and deleting non-last vaults with confirmation.
- **BYOK Key Inheritance with Per-Vault Override**: Centralize encrypted `ProviderCredential` resolution so any vault automatically falls back to its owner's primary/default vault key when no vault-specific override exists—covering Vision AI, multi-source appraisals, deferred Gemini enrichment, and Ollama auto-sort—and update `SettingsPage.tsx` to display **Inherited** vs. **Vault Override** status cleanly.
- **Admin Portal Multi-Vault Aggregation**: Update `admin_api.py` user summaries so `item_count`, `container_count`, and `total_market_value` aggregate across all vaults a user belongs to rather than only their primary workspace.
- **Out of Scope**: Moving/transferring items between vaults, an aggregated "All Vaults" combined portfolio dashboard, and multi-user vault sharing/invitations with `EDITOR`/`VIEWER` role enforcement remain out of scope for this change.

## Capabilities

### New Capabilities
<!-- None; all multi-vault behaviors extend the existing identity-tenancy capability. -->

### Modified Capabilities
- `identity-tenancy`: Add user-owned multi-vault lifecycle management (list, create, update, set default, delete non-last vault), persistent active-vault switching via `X-Workspace-Id`, encrypted BYOK credential inheritance from the owner's primary vault with per-vault overrides, and multi-vault metric aggregation in the operator admin portal.

## Impact

- **Backend**: `backend/apps/accounts/models.py` (new `Workspace.is_default` and `Workspace.description` fields + migration + credential resolution helper), `backend/apps/accounts/auth.py`, `backend/apps/accounts/api.py`, `backend/apps/accounts/admin.py`, `backend/apps/accounts/admin_api.py`, `backend/apps/valuation/services.py`, `backend/apps/valuation/tasks.py`, `backend/apps/vision/services.py`, `backend/apps/catalog/auto_sort.py`, `backend/config/settings.py`.
- **Frontend**: `frontend/src/lib/api.ts`, `frontend/src/App.tsx`, `frontend/src/components/Layout.tsx`, `frontend/src/components/VaultSwitcher.tsx` (new), `frontend/src/pages/SettingsPage.tsx`, `frontend/vite.config.ts`.
- **Tests & Docs**: `backend/tests/test_accounts.py`, `backend/tests/test_admin_api.py`, `frontend/src/__tests__/app.test.tsx`, `frontend/src/__tests__/vaults.test.tsx`, `docs/USER_GUIDE.md`.

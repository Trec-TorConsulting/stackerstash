# Proposal

## Why

Collectors frequently want to share a vault with a spouse, family member, business partner, or estate advisor—giving collaborators either full cataloging privileges (`EDITOR`) or safe read-only visibility (`VIEWER`) while keeping vault administration, member permissions, and BYOK API keys restricted to the vault `OWNER`. Although `WorkspaceMembership` in `backend/apps/accounts/models.py` already defines `OWNER`, `EDITOR`, and `VIEWER` roles, Stacker Stash currently has no invitation workflow, membership management UI, or API/UI role enforcement.

## What Changes

- **Hybrid In-App & Invite-Link Onboarding (`WorkspaceInvitation`)**: Add a `WorkspaceInvitation` model (`workspace`, `email`, `role` constrained to `EDITOR` or `VIEWER`, cryptographic `token`, `status`, `invited_by`, `expires_at`) and API endpoints so Owners can invite collaborators by email without requiring SMTP infrastructure. Existing users see pending invites in-app to accept or decline immediately, and any invitee can open a shareable `/invite/:token` link to sign in or register and accept membership.
- **Member Lifecycle & Leave Vault**: Add API endpoints and UI controls for listing vault members, updating a collaborator's role between `EDITOR` and `VIEWER` (`OWNER` only), removing members or revoking pending invites (`OWNER` only), and allowing non-owner members (`EDITOR`/`VIEWER`) to leave a shared vault.
- **Backend Role Enforcement (`OWNER` / `EDITOR` / `VIEWER`)**: Attach the authenticated member's `WorkspaceMembership` and role in `WorkspaceAuth` and enforce role permissions across all routers:
  - `VIEWER`: read-only access across Dashboard analytics, Collection items, Containers, Valuations, Cert URLs, and Exports (plus global spot refresh); returns HTTP `403` on catalog/container/photo mutations, CSV import, Vision AI, item appraisals, vault settings, and BYOK endpoints.
  - `EDITOR`: full catalog, container, photo, CSV import, Vision AI, and appraisal capabilities; returns HTTP `403` on vault settings edits, BYOK credential read/write/delete, member/invite management, and vault deletion.
  - `OWNER`: full control over vault settings, BYOK credentials, members, invitations, and vault lifecycle.
- **Owner-Backed BYOK Execution Without Key Exposure**: When an `EDITOR` invokes Vision AI or item appraisals in a shared vault, backend services resolve credentials from the shared vault or fall back to the vault `OWNER`'s default vault keys—while `/settings/credentials*` strictly blocks non-owners (`403`) so masked key hints and secrets are never exposed to `EDITOR`s or `VIEWER`s.
- **Role-Aware Frontend UX**: Display shared-vault and role badges in the navigation/switcher, provide a `/invite/:token` landing flow and in-app Pending Invitations banner, hide or disable mutating controls for `VIEWER`s across `Layout`, `DashboardPage`, `CollectionPage`, `ContainersPage`, `ScanAddPage`, and `ItemDetailPage`, and render Members/Leave Vault management in `SettingsPage` while restricting BYOK & vault config panels to `OWNER`s.
- **Out of Scope**: Unauthenticated/public read-only share links, hiding purchase cost basis/P&L from `VIEWER`s, and collaborator activity audit logs remain out of scope for this change.

## Capabilities

### New Capabilities
- `vault-sharing-and-roles`: Hybrid in-app and link-based vault invitations, member role lifecycle (`OWNER`, `EDITOR`, `VIEWER`), strict API and UI RBAC enforcement, non-owner leave-vault workflow, and owner-backed BYOK execution without credential exposure.

### Modified Capabilities
<!-- None; all sharing and role-enforcement requirements live cleanly in the new vault-sharing-and-roles capability. -->

## Impact

- **Backend**: `backend/apps/accounts/models.py` (`WorkspaceInvitation` + migration), `backend/apps/accounts/auth.py` (membership role binding + role guard helpers), `backend/apps/accounts/api.py` (invite/member/leave endpoints, role metadata on `/auth/me` & `/auth/workspaces`, owner-only `/settings/*` guards), `backend/apps/accounts/admin.py`, `backend/apps/accounts/admin_api.py`, `backend/apps/catalog/api.py`, `backend/apps/valuation/api.py`, `backend/apps/vision/api.py`.
- **Frontend**: `frontend/src/lib/api.ts`, `frontend/src/App.tsx`, `frontend/src/components/Layout.tsx`, `frontend/src/components/VaultSwitcher.tsx`, `frontend/src/pages/InviteAcceptPage.tsx` (new), `frontend/src/pages/SettingsPage.tsx`, `frontend/src/pages/DashboardPage.tsx`, `frontend/src/pages/CollectionPage.tsx`, `frontend/src/pages/ContainersPage.tsx`, `frontend/src/pages/ScanAddPage.tsx`, `frontend/src/pages/ItemDetailPage.tsx`.
- **Tests & Docs**: `backend/tests/test_shared_vaults.py` (new), `backend/tests/test_admin_api.py`, `frontend/src/__tests__/sharedVaults.test.tsx` (new), `docs/USER_GUIDE.md`.

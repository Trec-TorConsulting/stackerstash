# Design

## Context

See `proposal.md` for motivation and scope. Relevant codebase constraints observed:
- `WorkspaceMembership` (`backend/apps/accounts/models.py`) already defines `Role` choices (`OWNER`, `EDITOR`, `VIEWER`) and `unique_together = ("workspace", "user")`, while `Workspace.owner` records a single canonical owner `User`.
- `WorkspaceAuth` (`backend/apps/accounts/auth.py`) resolves `request.workspace` from `X-Workspace-Id` or the user's primary membership, but does not yet expose the membership/role on `request` or enforce RBAC across `accounts`, `catalog`, `valuation`, or `vision` routers.
- `backend/config/settings.py` has no outbound SMTP configuration, making zero-SMTP hybrid in-app + copyable link onboarding essential for self-hosted deployments.
- `DashboardPage.tsx` automatically invokes `POST /api/v1/valuation/spots/refresh` on mount (`SpotPriceSnapshot` is global, not workspace-scoped).
- `CollectionPage.tsx` currently exports CSV using a plain `<a href="/api/v1/catalog/items/export/csv">`, which omits `Authorization` and `X-Workspace-Id` headers.
- `shared-vaults` complements `multiple-vaults`: both rely on `X-Workspace-Id` switching and `resolve_workspace_credential` fallback, while `shared-vaults` owns `WorkspaceInvitation`, member management, and `OWNER`/`EDITOR`/`VIEWER` RBAC in its own capability spec.

## Goals / Non-Goals

**Goals:**
- Support zero-SMTP collaborator onboarding via in-app pending invitations and shareable `/invite/:token` links.
- Enforce `OWNER`, `EDITOR`, and `VIEWER` permissions consistently at both API and UI boundaries.
- Allow `EDITOR`s to use Vision AI and appraisals backed by the shared vault's (or `OWNER`'s default vault's) BYOK keys without exposing credential hints or configuration endpoints.
- Maintain compatibility with existing test mocks where `UserWorkspace.role` may be omitted (defaulting UI capability checks to `"OWNER"` when `role` is absent).

**Non-Goals:**
- Public unauthenticated read-only links, hiding cost-basis/purchase prices from `VIEWER`s, multi-owner ownership transfer, or collaborator activity audit logs.

## Decisions

### 1. `WorkspaceInvitation` Model & Token Security
- **Choice**: Add `WorkspaceInvitation` to `backend/apps/accounts/models.py` with `id` (UUID), `workspace` (FK `Workspace`), `invited_by` (FK `User`), `email` (normalized lowercase `EmailField`, indexed), `role` (`EDITOR` or `VIEWER` only), `token` (`CharField(64)`, unique, generated via `secrets.token_urlsafe(32)`), `status` (`PENDING`, `ACCEPTED`, `DECLINED`, `REVOKED`), `expires_at` (`now + 7 days`), `accepted_by` (nullable FK `User`), `created_at`, and `responded_at`.
- **Rationale**: Requiring `invite.email` and enforcing `request.user.email.lower() == invite.email.lower()` on acceptance prevents leaked `/invite/:token` links from admitting unintended users, while single-use `PENDING -> ACCEPTED` state inside `@transaction.atomic` prevents replay.
- **Re-inviting same email**: Creating a new invite for an email that already has a `PENDING` invite in the same workspace automatically revokes the prior pending invite so owners can re-issue fresh links/roles cleanly.

### 2. Membership Role Binding & Router Enforcement
- **Choice**:
  - Update `backend/apps/accounts/auth.py` to resolve `WorkspaceMembership` (`select_related("workspace__owner")`), attach `request.workspace_membership` and `request.workspace_role` (preferring `OWNER` when `request.user.id == workspace.owner_id`), and expose `require_editor(request)` and `require_owner(request)` helpers that raise `HttpError(403, ...)`.
  - Apply `require_editor(request)` to all mutating endpoints in `catalog_router`, `POST /valuation/items/{item_id}/appraise` in `valuation_router`, and `POST /vision/identify` in `vision_router`. Leave `POST /valuation/spots/refresh` accessible to all workspace members (`OWNER`, `EDITOR`, `VIEWER`) since `SpotPriceSnapshot` is global and called on Dashboard mount.
  - Apply `require_owner(request)` to `PATCH /settings/workspace`, `GET/PUT/DELETE /settings/credentials*`, workspace metadata/deletion/default endpoints, and owner-only invite/member management routes.
- **Rationale**: Centralizing role resolution in `WorkspaceAuth` and enforcing via two explicit helper guards avoids scattered permission checks and guarantees `403` consistency across every endpoint.

### 3. Owner-Backed BYOK Resolution Without Exposure
- **Choice**: Keep Vision AI, Valuation, and Auto-Sort credential lookups keyed by `workspace` (with fallback to `workspace.owner`'s default workspace via `resolve_workspace_secret`), while returning `403` from `/settings/credentials*` for `EDITOR` and `VIEWER`.
- **Rationale**: Collaborators can catalog and appraise items using the shared vault's configured providers without reading masked key suffixes (`••••1234`), toggling providers, or overwriting the Owner's secrets.
- **Alternative considered**: Running `EDITOR` actions with the collaborator's own personal API keys — rejected per user preference because invited family/team members should not need their own paid Gemini/PCGS keys to help catalog a shared vault.

### 4. Hybrid Onboarding Routes & Authenticated CSV Export
- **Choice**:
  - Public preview `GET /api/v1/auth/invites/{token}` returns safe preview metadata (`vault_name`, `inviter_name`, `role`, `masked_email`, `status`, `expires_at`) so `/invite/:token` renders context before sign-in/signup.
  - `InviteAcceptPage.tsx` handles `/invite/:token`, routing unauthenticated users to `/login?next=/invite/:token` or `/register?next=/invite/:token&email=...` and returning them to accept immediately after auth.
  - Authenticated `Layout.tsx` fetches `GET /api/v1/auth/invites/pending` and displays an in-app Pending Invitations banner with one-click **Accept** / **Decline**.
  - `CollectionPage.tsx` replaces the raw `<a href="/api/v1/catalog/items/export/csv">` link with an authenticated `apiFetch` blob download (`api.exportCsv()`) so `Authorization` and `X-Workspace-Id` headers are attached when exporting a shared vault.

### 5. Role-Aware Frontend Gating & Compatibility
- **Choice**: Add optional `role?: "OWNER" | "EDITOR" | "VIEWER"`, `is_shared?: boolean`, and `owner_email?: string` on `UserWorkspace` in `frontend/src/lib/api.ts`, treating omitted `role` as `"OWNER"` in UI capability checks (`const role = user.workspace.role ?? "OWNER"`).
- **Rationale**: Keeps existing test suites (`app.test.tsx`, `autoSort.test.tsx`, `itemDetail.test.tsx`, `intake.test.tsx`, `valuation.test.tsx`) compiling and passing without requiring boilerplate updates across unrelated mocks.
- **UI gating**:
  - `VIEWER`: hides `Scan / Add` nav link and Dashboard CTA, hides Import CSV & bulk selection/mutation toolbar on `CollectionPage`, hides add/delete container controls on `ContainersPage`, renders a read-only notice on `/scan`, and hides edit/appraise/delete/photo-mutation buttons on `ItemDetailPage`.
  - `EDITOR`: keeps all cataloging/import/container/vision/appraisal UI; in `SettingsPage`, shows **Shared Vault Info**, **Members**, and **Leave Shared Vault** instead of Owner-only vault settings and BYOK key panels.
  - `OWNER`: sees full **Vault Sharing & Members** management card in `SettingsPage` alongside vault settings and BYOK credentials.

## Risks / Trade-offs

- **Risk: Invite link forwarded to wrong recipient** → Mitigation: Require exact case-insensitive email match (`request.user.email == invite.email`) on `accept`, 7-day expiry, single-use status transition, and instant Owner revocation.
- **Risk: Shared `VIEWER` sees stale cached mutations or triggers direct `/scan` route** → Mitigation: Backend enforces `403` on every mutating API; `/scan` shows a clear read-only message for `VIEWER`s; switching vaults clears React Query cache.
- **Risk: Owner removes an active member while they are browsing the shared vault** → Mitigation: Next API request returns `403`, and `apiFetch` clears `activeWorkspaceId` (when `X-Workspace-Id` differs from default) without wiping the user's JWT, recovering cleanly to their default vault.
- **Risk: Sequencing between `multiple-vaults` and `shared-vaults`** → Mitigation: If `shared-vaults` is implemented after `multiple-vaults`, it builds directly on `VaultSwitcher` and `GET /auth/workspaces`; if implemented first, `shared-vaults` ensures `GET /auth/workspaces` and a minimal workspace switcher exist for shared-vault switching so invitees can access shared vaults immediately.

## Migration Plan

1. Add Django migration in `apps/accounts` creating `WorkspaceInvitation`.
2. Deploy backend and frontend together; existing single-owner `WorkspaceMembership` records already have `role = "OWNER"` and require no backfill.

# Design

## Context

See `proposal.md` for motivation and scope. In Stacker Stash today:
- `Workspace` (`backend/apps/accounts/models.py`) is the multi-tenant isolation boundary for `Container`, `CollectionItem`, `ItemPhoto`, `AppraisalJob`, `IdentificationJob`, `ImageIdentificationCache`, and `ProviderCredential`, as well as `uniq_workspace_cert_number` and media paths (`workspaces/<workspace_id>/items/<item_id>/...`).
- `WorkspaceAuth` (`backend/apps/accounts/auth.py`) already checks `request.headers.get("X-Workspace-Id")` and calls `resolve_user_workspace(user, requested_ws_id)`, defaulting to the earliest `WorkspaceMembership`. However, it currently raises an unhandled UUID `ValidationError` on malformed IDs and returns `None` (`401 Unauthorized`) on unauthorized/deleted IDs, which triggers `setAuthToken(null)` in `frontend/src/lib/api.ts`.
- `ProviderCredential` is read directly on `workspace` across five modules: `accounts/api.py`, `valuation/services.py` (`_get_workspace_secret`), `valuation/tasks.py` (`process_deferred_ai_enrichment_task`), `vision/services.py` (`_get_secret`), and `catalog/auto_sort.py` (`_get_workspace_ollama_config`).
- `frontend/vite.config.ts` caches `/api/v1/catalog/items` and `/api/v1/valuation` responses in Workbox by URL without incorporating `X-Workspace-Id`.

## Goals / Non-Goals

**Goals:**
- Reuse `Workspace` as the user-facing "Vault" entity with zero breaking changes for existing single-vault accounts.
- Ensure consistent BYOK credential inheritance (vault override → owner's default vault fallback) across all API endpoints and background Celery tasks.
- Make active vault switching seamless and safe across React Query, `localStorage`, Workbox offline caching, and Django Ninja auth.
- Prevent accidental credential loss or orphaned media files when deleting a vault.

**Non-Goals:**
- Cross-vault item moving/copying workflows, combined "All Vaults" aggregate portfolio dashboards, and multi-user invitation/role enforcement (`EDITOR` / `VIEWER` permissions).
- Changing currency formatting beyond persisting per-vault `default_currency`.

## Decisions

### 1. Model `Workspace` as Vault with `is_default` and `description`
- **Choice**: Add `description = models.CharField(max_length=240, blank=True, default="")` and `is_default = models.BooleanField(default=False)` to `Workspace` in `backend/apps/accounts/models.py` (plus a data migration setting `is_default=True` on each existing user's earliest owned/member workspace).
- **Rationale**: Every domain model, cert-uniqueness constraint, and storage path already keys off `Workspace`. Keeping `Workspace` as the Vault model preserves strict data isolation per vault without adding parallel tenant foreign keys across four Django apps.
- **Alternative considered**: Adding a separate `Vault` sub-model inside `Workspace` — rejected because `uniq_workspace_cert_number`, `Container`, `WorkspaceSettings`, and `ProviderCredential` would either leak across vaults or require invasive schema rewrites.

### 2. Centralized BYOK Credential Resolution (`resolve_workspace_credential`)
- **Choice**: Add shared helpers in `backend/apps/accounts/models.py`:
  - `get_owner_default_workspace(user: User) -> Workspace | None`: returns the user's `is_default=True` owned workspace (or earliest workspace fallback).
  - `resolve_workspace_credential(workspace: Workspace, provider: str) -> tuple[ProviderCredential | None, bool]`: checks `(workspace, provider)` first (`is_inherited=False`); if absent and `default_ws` differs from `workspace`, checks `(default_ws, provider)` (`is_inherited=True`).
  - `resolve_workspace_secret(workspace: Workspace, provider: str) -> str`: decrypts the resolved credential or returns `""`.
- **Call sites updated**: `accounts/api.py` (`list_credentials` returning `is_inherited` and `inherited_from_workspace_name`), `valuation/services.py` (`_get_workspace_secret`), `valuation/tasks.py` (`process_deferred_ai_enrichment_task`), `vision/services.py` (`_get_secret`), and `catalog/auto_sort.py` (`_get_workspace_ollama_config`).
- **Rationale**: Putting fallback logic in one helper guarantees background Celery workers (`auto_sort`, `process_deferred_ai_enrichment_task`) behave identically to synchronous API requests, while `DELETE /settings/credentials/{provider}` only deletes the current vault's override row.
- **Alternative considered**: Moving `ProviderCredential` onto `User` — rejected because users could no longer override credentials per vault (e.g., separate API keys for a dedicated vault) and existing migrations/tests assume `(workspace, provider)`.

### 3. Vault CRUD Endpoints & Safe Deletion Lifecycle
- **Choice**: Add endpoints under `auth_router` (`backend/apps/accounts/api.py`, protected by `WorkspaceAuth` or `JwtUserAuth`):
  - `GET /api/v1/auth/workspaces`: list all accessible vaults (default first, then `created_at`), annotated with `item_count` and `total_market_value` via a single grouped `CollectionItem` aggregation.
  - `POST /api/v1/auth/workspaces`: create a new vault (`name`, optional `description`, `default_currency`, `auto_sort_enabled`) owned by `request.user` with `is_default=False` and `WorkspaceMembership(role=OWNER)`.
  - `PATCH /api/v1/auth/workspaces/{workspace_id}`: verify ownership (`workspace.owner_id == request.user.id`), validate non-empty trimmed `name` if provided, and update `name`, `description`, `default_currency`, `auto_sort_enabled`.
  - `POST /api/v1/auth/workspaces/{workspace_id}/set-default`: verify ownership, atomically set `is_default=False` on user's other owned workspaces and `is_default=True` on target.
  - `DELETE /api/v1/auth/workspaces/{workspace_id}`: verify ownership; reject with `400` if user has only 1 owned workspace (`Workspace.objects.filter(owner=request.user).count() <= 1`). Inside `@transaction.atomic`:
    1. If `workspace.is_default` is `True`, select the earliest remaining owned workspace as `new_default`, mark `new_default.is_default = True`, and copy any `ProviderCredential` rows from the deleted vault whose `provider` does not already exist on `new_default` (preserving encrypted values without re-encryption loss).
    2. Collect stored photo/thumbnail file paths (`ItemPhoto` in that workspace) and delete them from `default_storage` via `transaction.on_commit` after deleting `workspace`.
- **Rationale**: Prevents users from ever entering a zero-vault state, protects default BYOK keys when retiring an original starter vault, and prevents orphaned media files on disk.
- **Alternative considered**: Blocking deletion of the default vault unless manually reassigned first — rejected as unnecessary friction when safe automatic promotion handles it cleanly.

### 4. Hardened `X-Workspace-Id` Resolution & Client Cache Partitioning
- **Choice (Backend)**:
  - In `backend/apps/accounts/auth.py`, parse `X-Workspace-Id` via `uuid.UUID(requested_ws_id)`; on `ValueError`, raise `HttpError(400, "Invalid X-Workspace-Id header.")`.
  - When `requested_ws_id` is a valid UUID not matching any `WorkspaceMembership` for `user`, raise `HttpError(403, "Workspace access denied or vault unavailable.")` instead of returning `None` (which produced `401`).
  - Add `"x-workspace-id"` to `CORS_ALLOW_HEADERS` in `backend/config/settings.py`.
- **Choice (Frontend)**:
  - Persist active vault ID in `localStorage` (`stackerstash_workspace_id`) and attach `X-Workspace-Id` in `apiFetch` (`frontend/src/lib/api.ts`).
  - When `apiFetch` receives `403` and an explicit `X-Workspace-Id` header was sent for `/auth/me` or a stale vault, reset `activeWorkspaceId` to `null` (falling back to default vault) rather than clearing the JWT auth token.
  - On vault switch (`switchWorkspace(id)` in `App.tsx` / `VaultSwitcher.tsx`), cancel in-flight queries (`await queryClient.cancelQueries()`), clear React Query cache (`queryClient.clear()`), update `activeWorkspaceId` + `user` state, and reload active view queries cleanly.
  - In `frontend/vite.config.ts`, configure Workbox's `api-items-valuation-cache` with a `cacheKeyWillBeUsed` plugin that appends `?__ws=${request.headers.get("X-Workspace-Id") || "default"}` (or clear `api-items-valuation-cache` on switch) so offline `NetworkFirst` responses never bleed between vaults.
- **Alternative considered**: Passing `?workspace_id=` query parameter on every endpoint — rejected because `WorkspaceAuth` already uses `X-Workspace-Id` uniformly across all routers (`catalog`, `valuation`, `analytics`, `vision`, `settings`, `auth/me`).

### 5. Navigation Vault Switcher & Settings UI
- **Choice**:
  - Create a compact `VaultSwitcher` component rendered in the desktop sidebar (`Layout.tsx`, replacing the static `subtitle={user.workspace.name}`) and in the mobile top bar (`Layout.tsx`), displaying the active vault name, dropdown list of vaults with quick switching, and a "+ New Vault" modal/inline form.
  - Add a **My Vaults** section at the top of `SettingsPage.tsx` showing all user vaults (with `Default` / `Active` badges, item counts, total value), inline creation, editing (`name`, `description`, `default_currency`, `auto_sort_enabled`), **Set as Default**, and **Delete Vault** (disabled when only 1 vault exists, guarded by confirmation).
  - Update the **Settings & BYOK Vault** credentials list so inherited keys display a clear badge (`Inherited from <Default Vault Name>`) with a disabled/contextual note when removing an override vs. editing the primary vault.

### 6. Admin Portal Aggregation
- **Choice**: Update `_serialize_admin_user` in `backend/apps/accounts/admin_api.py` to prefer the user's `is_default=True` workspace for `primary_workspace` and aggregate `item_count`, `container_count`, and `total_market_value` across all workspace IDs in `WorkspaceMembership.objects.filter(user=user)`.

## Risks / Trade-offs

- **Risk: Stale React Query or Workbox response after switching vaults** → Mitigation: Call `queryClient.cancelQueries()` + `queryClient.clear()` during vault switch and partition Workbox `api-items-valuation-cache` keys by `X-Workspace-Id`.
- **Risk: Deleting a vault leaves media files on disk or breaks active UI route** → Mitigation: Delete `ItemPhoto` image/thumbnail storage blobs on commit, switch active vault to the user's default vault in frontend state, and navigate away from deleted item detail URLs (`/items/:id`) to `/`.
- **Risk: Stale `X-Workspace-Id` cached in another browser tab logs user out** → Mitigation: `WorkspaceAuth` returns `403` (not `401`) for inaccessible/deleted vault IDs; `apiFetch` only clears JWT on `401` and falls back to default vault on stale vault error.
- **Risk: Background Celery tasks skip AI enrichment or Ollama auto-sort on secondary vaults** → Mitigation: Route all 5 `ProviderCredential` readers (`valuation/services.py`, `valuation/tasks.py`, `vision/services.py`, `catalog/auto_sort.py`, `accounts/api.py`) through the single `resolve_workspace_credential` helper.

## Migration Plan

1. Generate Django migration `0007_workspace_description_is_default` in `apps/accounts` adding `description` and `is_default`, followed by a reversible `RunPython` step setting `is_default=True` on each existing user's earliest workspace (without breaking existing single-vault rows).
2. Deploy backward-compatible backend and frontend assets together; existing clients omitting `X-Workspace-Id` resolve seamlessly to the user's `is_default=True` workspace.

# Design

## Context

See `proposal.md` for audit findings and scope. Key codebase constraints verified during inspection:
- `backend/tests/test_catalog.py` asserts `photo_url.startswith("/media/")` (line 309), `thumbnail_url.endswith(".webp")` (line 919), and `api_client.get(photo_url) == 200` with `settings.DEBUG = False` (line 285–313).
- `frontend/vite.config.ts` caches `/media/` in Workbox using `CacheFirst` (`maxAgeSeconds: 30 days`), which relies on stable URL paths for repeated renders.
- `backend/tests/test_accounts.py` asserts `GET /readyz` returns `200` in test environments without a running Redis server.
- Production K3s pods terminate TLS at the cluster Gateway (`openspec/specs/k3s-deployment/spec.md`) and receive HTTP probe requests directly on port `8000`, so `SECURE_SSL_REDIRECT` must default `false` unless explicitly enabled while HSTS/cookie/content-type hardening apply when `not DEBUG`.
- Existing `ruff check .` reports 17 lint errors, and `pytest` emits deprecation warnings from Django Ninja `(status, body)` tuple returns and Pillow's `Image.getdata()`.

## Goals / Non-Goals

**Goals:**
- Achieve 100% CRUD parity between backend schemas and frontend UI across Accounts, Containers, Items, Photos, and Exports.
- Eliminate silent UI errors and single-click destructive deletions with `ErrorBoundary`, `ToastProvider`, `ConfirmDialog`, and query Retry banners.
- Secure `/media/` downloads via HMAC signatures without breaking `<img>` tags, Workbox `CacheFirst`, or existing `.webp`/`.startswith("/media/")` assertions.
- Leave `ruff check .`, `pytest`, `npx tsc --noEmit`, and `npm test` clean with zero lint errors and reduced framework deprecation noise.

**Non-Goals:**
- Implementing `multiple-vaults`, `shared-vaults`, `tiered-access`, or `scan-details-accordion` features (handled in their respective OpenSpec changes).
- Persisting `ComingSoonPage` waitlist submissions in the database.

## Decisions

### 1. Path-Embedded Coarse-Bucketed HMAC Media URLs
- **Choice**: Add `build_signed_media_url(relative_path: str) -> str` and `verify_signed_media_path(...)` in a small helper module (e.g. `backend/config/media_signing.py`). Signed URLs use the format `/media/s/<exp>/<sig>/<relative_path>` where `exp` is quantized to 7-day UTC epochs (`valid` for 7–14 days) and `sig` is `hmac.new(SECRET_KEY, f"{exp}:{rel_path}", sha256).hexdigest()[:32]`. `serve_media` (`backend/config/urls.py`) verifies the regex, `hmac.compare_digest`, `exp >= now`, and `Path(MEDIA_ROOT, rel_path).resolve().is_relative_to(MEDIA_ROOT_RESOLVED)`, returning `403` on missing/invalid/expired signatures and `404` on missing files or traversal.
- **Rationale**: Keeps URLs starting with `/media/` and ending with `.webp` (satisfying existing tests), avoids breaking `<img>` requests or Workbox `CacheFirst` (coarse 7-day buckets mean URLs remain stable during browsing and offline coin-show caching), and blocks unauthenticated guessing of `/media/workspaces/...`.

### 2. Self-Service Account CRUD
- **Choice**: Add `PATCH /api/v1/auth/me` (`display_name`), `POST /api/v1/auth/change-password` (`current_password`, `new_password` >= 8 chars), and `DELETE /api/v1/auth/me` (`password` confirmation, cleaning up item photos and owned workspaces where `user` is sole owner before deleting `User`) on `auth_router`, wired into a **Profile & Account Security** card in `SettingsPage.tsx`.
- **Rationale**: Completes User CRUD without adding external email-reset dependencies.

### 3. Container Cycle Guard, Deep Hierarchy & Edit UI
- **Choice**:
  - In `backend/apps/catalog/api.py`, extract `_build_container_tree(workspace)` so `list_containers` and `update_container` share identical roll-up computation (`update_container` returns accurate counts/children instead of zeroed stubs), and walk `parent` ancestors in `_assert_no_container_cycle` to reject multi-hop cycles with `400`.
  - In `frontend/src/pages/ContainersPage.tsx`, add recursive `flattenContainers` (unlimited depth), show `location_notes`, add inline **Edit** modal/form (excluding self + descendants from parent options), add **View Items** link (`/collection?container_id={id}`), and guard **Delete** with `ConfirmDialog` noting child containers will also be deleted.

### 4. Item Edit Parity, Duplication, Photo Management & Authenticated Exports
- **Choice**:
  - Expand `ItemDetailPage.tsx` `editForm` to include `purchase_price`, `sold_price`, `sold_date`, `metal_type`, `weight_value`, `weight_unit`, `purity`, `tags`, and trading card fields (`card_game`, `set_name`, `set_code`, `card_number`, `rarity`, `card_finish`, `card_edition`, `language`, `raw_condition` when `isCardItem` or category is `CARD`).
  - Add `POST /api/v1/catalog/items/{item_id}/duplicate` (`Status(201, ...)`) cloning item attributes (resetting `cert_number=""`, `sold_price=None`, `sold_date=None`, `status=IN_COLLECTION`, `title=f"{title} (Copy)"`).
  - Add photo upload label selector (`OBVERSE`, `REVERSE`, `SLAB_LABEL`, `ASSAY`, `RECEIPT`, `OTHER`), per-photo Delete button with `ConfirmDialog`, `thumbnail_url || url` in the photo strip on `ItemDetailPage.tsx`, and shared `_delete_photo_files(photo)` deleting both `image` and `thumbnail` in `catalog/api.py`.
  - Add `Container` filter + `?container_id=` URL sync on `CollectionPage.tsx`, complete `FIELD_LABELS` in `ImportWizardModal.tsx`, and replace `<a href="/api/v1/catalog/items/export/csv">` with `apiFetchBlob` authenticated downloads for CSV, JSON, and Insurance Report export.

### 5. Readiness, SQLite Concurrency, Security Headers & Code Health
- **Choice**:
  - In `backend/config/health.py`, check Redis (`redis.from_url(settings.REDIS_URL).ping()`) in `/readyz` whenever `not settings.DEBUG` or `getattr(settings, "READY_CHECK_REDIS", False)` is truthy, returning `503` on failure while keeping local/pytest environments without Redis green.
  - In `backend/apps/catalog/importer.py` (`_enqueue_csv_batch_appraisals`), use `max_workers=1` when `connection.vendor == "sqlite"` (preventing `sqlite3.OperationalError: database table is locked`) and `max_workers=2` on PostgreSQL.
  - In `backend/config/settings.py`, configure `SECURE_HSTS_SECONDS` (default `31536000` when `not DEBUG`), `SECURE_HSTS_INCLUDE_SUBDOMAINS = True`, and env-controlled `SECURE_SSL_REDIRECT` (default `False` for Gateway TLS termination).
  - Add background job health metrics (`pending_appraisals`, `running_appraisals`, `failed_appraisals_24h`, `deferred_ai_items`, `recent_identifications_24h`, `db_healthy`, `redis_healthy`) to `admin_api.py` and `AdminPortalPage.tsx`.
  - Resolve all 17 Ruff lint issues, replace Ninja tuple status returns with `ninja.Status`, and replace `img.getdata()` in `apps/vision/cache.py` with `get_flattened_data()` (with `getdata()` fallback for older Pillow).

### 6. Frontend ErrorBoundary, ToastProvider, ConfirmDialog & Accessibility
- **Choice**: Create `ErrorBoundary.tsx`, `ToastProvider.tsx` (`useToast`), and `ConfirmDialog.tsx`; wrap `AppRoutes` in `ErrorBoundary` + `ToastProvider`; wire mutation `onError`/`onSuccess` toasts and query Retry states across `DashboardPage`, `CollectionPage`, `ContainersPage`, `ItemDetailPage`, `SettingsPage`, and `AdminPortalPage`; remove `maximum-scale=1.0, user-scalable=no` in `frontend/index.html`; and add password show/hide toggle + signup password confirmation + `autoComplete` attributes in `AuthPage.tsx`.

## Risks / Trade-offs

- **Risk: Signed media URL expiration on long-lived offline PWA snapshots** → Mitigation: Use a 7-day rolling bucket valid for 7–14 days, and Workbox `CacheFirst` retains already-fetched image blobs locally in browser storage; refreshing the item online issues a fresh signed URL automatically.
- **Risk: Replacing Django Ninja tuple returns with `Status` across endpoints** → Mitigation: Verify every endpoint response schema and status code with full `pytest` suite (`test_accounts.py`, `test_catalog.py`, `test_unified_intake.py`, etc.).
- **Risk: Account self-deletion when a user owns shared workspaces or multiple items** → Mitigation: Delete photo files on disk via `transaction.on_commit` and delete owned workspaces cleanly before deleting `User`.

## Migration Plan

1. No database schema migration is required for signed media, container validation, `Status(...)` updates, or frontend polish (`User`, `Container`, `CollectionItem`, `ItemPhoto`, `AppraisalJob`, `IdentificationJob` already carry all needed columns).
2. Deploy updated backend and frontend together; existing stored `ItemPhoto` records immediately emit signed `/media/s/<exp>/<sig>/...` URLs on serialization.

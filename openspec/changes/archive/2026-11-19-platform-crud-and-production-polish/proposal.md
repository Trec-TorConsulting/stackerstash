# Proposal

## Why

A full-system audit of Stacker Stash uncovered incomplete CRUD surfaces across accounts, containers, items, and photos (such as missing container editing, missing cost/sold/metal/weight/card fields on item edit, unauthenticated CSV export failing with `401`, missing photo delete/label controls, and leaked thumbnail files), alongside production security and reliability gaps (unauthenticated `/media/` serving, SQLite background-thread locking during CSV appraisals, unverified Redis readiness in `/readyz`, missing admin job-health metrics, `17` Ruff lint errors, framework deprecation warnings, mobile zoom-lock accessibility barriers, and silent mutation failures). Addressing these gaps establishes enterprise-grade correctness, security, and polish across the entire platform.

## What Changes

- **Complete Account, Container, Item, Photo & Export CRUD**:
  - Add self-service account profile/password management (`PATCH /api/v1/auth/me`, `POST /api/v1/auth/change-password`, `DELETE /api/v1/auth/me`) in `accounts/api.py` and `SettingsPage.tsx`.
  - Add frontend `updateContainer`, Edit Container modal/form (`name`, `container_type`, `parent_id`, `location_notes`), unlimited-depth parent flattening, click-through container filtering (`/collection?container_id=...`), backend ancestor-cycle validation, and accurate rolled-up stats on `PATCH /api/v1/catalog/containers/{container_id}`.
  - Expand `ItemDetailPage.tsx` Edit Details to cover `purchase_price`, `sold_price`, `sold_date`, `metal_type`, `weight_value`, `weight_unit`, `purity`, `tags`, and trading card fields; add `POST /api/v1/catalog/items/{item_id}/duplicate`; add a `Container` filter and `?container_id=` sync on `CollectionPage.tsx`; add missing trading card/financial labels in `ImportWizardModal.tsx`; and convert Export CSV/JSON/Insurance Report buttons to authenticated `apiFetch` blob downloads.
  - Add individual photo deletion (with confirmation) and upload label selection in `ItemDetailPage.tsx`, render `thumbnail_url` in the detail strip, and clean up `photo.thumbnail` files on `delete_item`, `bulk_delete_items`, and `delete_item_photo`.
- **Production Hardening, Signed Media & Code Health**:
  - Secure `/media/` with coarse-bucketed expiring HMAC-signed URLs (`/media/s/<exp>/<sig>/<relative_path>`), preserving `.startswith("/media/")`, `.endswith(".webp")`, and Workbox `CacheFirst` caching while blocking unauthenticated URL guessing (`403`) and path traversal.
  - Extend `/readyz` (`backend/config/health.py`) to verify Redis connectivity when configured, add production security header defaults (`SECURE_HSTS_SECONDS`, etc.) in `backend/config/settings.py`, and prevent SQLite table-lock errors in `_enqueue_csv_batch_appraisals` (`backend/apps/catalog/importer.py`).
  - Surface background job health (`AppraisalJob`, `IdentificationJob`, `ai_enrichment_pending` backlog, Redis/DB health) in `admin_api.py` and `AdminPortalPage.tsx`.
  - Fix all `17` Ruff lint errors (`ruff check .`), replace deprecated Django Ninja tuple responses with `Status(...)`, and replace Pillow's deprecated `img.getdata()` in `apps/vision/cache.py`.
- **Enterprise UX, Error Handling & Accessibility Polish**:
  - Wrap `AppRoutes` in a React `ErrorBoundary`, introduce a global `ToastProvider` for mutation success/error notifications, add reusable `ConfirmDialog` modals before destructive item, photo, container, and account deletions, and surface query error + Retry states on `DashboardPage`, `CollectionPage`, and `AdminPortalPage`.
  - Remove mobile pinch-to-zoom restrictions (`maximum-scale=1.0, user-scalable=no`) in `frontend/index.html`, and improve `AuthPage.tsx` with password visibility toggle, signup password confirmation, and `autoComplete` attributes.
- **Out of Scope**: Multi-vault switching (`multiple-vaults`), vault sharing/RBAC (`shared-vaults`), subscription tiers (`tiered-access`), `/scan` details accordion (`scan-details-accordion`), and backend persistence for the `ComingSoonPage` waitlist form remain separate.

## Capabilities

### New Capabilities
- `platform-readiness-and-ux-polish`: End-to-end CRUD completeness across accounts, containers, items, photos, and authenticated exports; HMAC-signed media access, readiness/security hardening, admin job diagnostics, lint/deprecation cleanup; and accessible ErrorBoundary, toast, confirmation, and query-recovery UX.

### Modified Capabilities
<!-- None; consolidated cleanly into 1 spec (platform-readiness-and-ux-polish) to avoid overlapping edits across existing capability specs. -->

## Impact

- **Backend**: `backend/config/urls.py`, `backend/config/settings.py`, `backend/config/health.py`, `backend/apps/accounts/api.py`, `backend/apps/accounts/admin_api.py`, `backend/apps/catalog/api.py`, `backend/apps/catalog/importer.py`, `backend/apps/catalog/image_processing.py`, `backend/apps/catalog/management/commands/recrop_collection_photos.py`, `backend/apps/vision/cache.py`, `backend/apps/valuation/api.py`.
- **Frontend**: `frontend/index.html`, `frontend/src/App.tsx`, `frontend/src/lib/api.ts`, `frontend/src/components/ErrorBoundary.tsx` (new), `frontend/src/components/ToastProvider.tsx` (new), `frontend/src/components/ConfirmDialog.tsx` (new), `frontend/src/components/ImportWizardModal.tsx`, `frontend/src/pages/AuthPage.tsx`, `frontend/src/pages/DashboardPage.tsx`, `frontend/src/pages/CollectionPage.tsx`, `frontend/src/pages/ContainersPage.tsx`, `frontend/src/pages/ItemDetailPage.tsx`, `frontend/src/pages/SettingsPage.tsx`, `frontend/src/pages/AdminPortalPage.tsx`.
- **Tests & Docs**: `backend/tests/test_accounts.py`, `backend/tests/test_admin_api.py`, `backend/tests/test_catalog.py`, `backend/tests/test_providers.py`, `backend/tests/test_valuation_and_vision.py`, `backend/tests/test_vision_cache.py`, `frontend/src/__tests__/polishAndCrud.test.tsx` (new), `docs/USER_GUIDE.md`.

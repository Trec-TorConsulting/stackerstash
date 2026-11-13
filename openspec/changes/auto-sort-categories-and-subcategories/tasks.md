# Tasks

## 1. Data Model & Migrations

- [x] 1.1 Add `auto_sort_enabled = models.BooleanField(default=True)` to `Workspace` in `backend/apps/accounts/models.py`, generate migration, and verify `python manage.py migrate` succeeds cleanly.
- [x] 1.2 Add `sort_category`, `sort_subcategory`, `sort_override`, and `sort_updated_at` fields to `CollectionItem` in `backend/apps/catalog/models.py`, generate migration, and verify `python manage.py migrate` succeeds cleanly.
- [x] 1.3 Add a data migration (or management command) to backfill `sort_category` and `sort_subcategory` on existing unpinned `CollectionItem` rows using deterministic local rules and verify existing test fixtures remain valid.

## 2. Local-First Auto-Sort Engine & Background Task

- [x] 2.1 Create `backend/apps/catalog/auto_sort.py` implementing deterministic primary category mapping (including `SLAB`/`FLIPPER` -> `COIN`/`PAPER`) and sub-category normalization (Country/Origin + `Ancient` for Coins & Paper; Mint/Pourer/Refiner + `Hand-Poured` for Bars & Rounds), plus unit tests covering US, Mexico, Ancient, Geiger, Engelhard, Hand-Poured, PMG banknote slabs, and `Uncategorized` fallbacks (`pytest backend/tests/test_auto_sort.py`).
- [x] 2.2 Add optional local-only Ollama fallback in `backend/apps/catalog/auto_sort.py` when deterministic rules return `Uncategorized` and workspace `ollama_url` is configured (with short timeout and no cloud API calls), and verify with mocked Ollama unit tests.
- [x] 2.3 Implement Celery task + `threading.Thread` fallback (`enqueue_item_auto_sort` and `enqueue_workspace_resort`) respecting `workspace.auto_sort_enabled` and `item.sort_override`, hook into item creation, CSV import, and vision identification completion via `transaction.on_commit`, and verify via integration tests.

## 3. Backend APIs (Catalog & Workspace Settings)

- [x] 3.1 Expose `auto_sort_enabled` in workspace settings GET/PATCH endpoints (`backend/apps/accounts/api.py`) and verify via API tests that toggling off prevents automatic background sorting on new item creation.
- [x] 3.2 Expose `sort_category`, `sort_subcategory`, `sort_override`, and `is_graded` on `CollectionItem` schemas, support filtering by `sort_category`, `sort_subcategory`, and `graded` in `GET /api/catalog/items`, allow manual override / reset on `PATCH /api/catalog/items/{id}`, and add `POST /api/catalog/items/resort` for on-demand workspace re-sort; verify with API tests.

## 4. Frontend UI (Collection Grouped View, Item Detail Override, Settings)

- [x] 4.1 Update `frontend/src/lib/api.ts` and `frontend/src/lib/format.ts` with `sort_category`, `sort_subcategory`, `sort_override`, `auto_sort_enabled`, and `resortCollection` client methods, and verify TypeScript compilation (`npm run build` / `tsc --noEmit`).
- [x] 4.2 Add the `"grouped"` (`By Category`) view mode, `sort_category` / `sort_subcategory` / `Graded` filters, collapsible primary category & sub-category sections with item counts and aggregate values, and `Graded` badges in `frontend/src/pages/CollectionPage.tsx`, and verify with Vitest component tests.
- [x] 4.3 Add manual `sort_category` / `sort_subcategory` override controls and "Reset to Auto-Sort" button in `frontend/src/pages/ItemDetailPage.tsx`, and verify with Vitest tests.
- [x] 4.4 Add the "Auto-Sort Collection Items" toggle and "Re-sort Unpinned Items" button to `frontend/src/pages/SettingsPage.tsx`, and verify with Vitest tests.

## 5. Final Verification

- [x] 5.1 Run full backend test suite (`pytest`) and frontend build/tests (`npm test && npm run build`) and confirm all checks pass.


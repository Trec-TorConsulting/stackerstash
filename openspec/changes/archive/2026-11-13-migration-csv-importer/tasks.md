# Tasks

## 1. Backend Migration Importer Service & Normalization

- [x] 1.1 Create `backend/apps/catalog/importer.py` with platform preset detection (`coinsnap`, `numista`, `pcgs_ngc`, `stackerstash`, `custom`), alias-based column mapping, currency/metal/grade normalization, title synthesis, and unit tests in `backend/tests/test_importer.py` verifying all presets and normalizations pass `pytest`.
- [x] 1.2 Add optional best-effort remote photo attachment (`obverse_image_url`, `reverse_image_url`, `image_url`) in `importer.py` with a 4s timeout, 5 MB cap, and non-fatal warning handling, and verify with mocked `respx` tests in `backend/tests/test_importer.py`.

## 2. Backend Preview & Mapped Import Endpoints

- [x] 2.1 Add `POST /api/v1/catalog/items/import/preview` and `POST /api/v1/catalog/items/import/mapped` endpoints to `backend/apps/catalog/api.py` (preserving `POST /api/v1/catalog/items/import/csv` unchanged) and verify with API integration tests in `backend/tests/test_importer.py` and `ruff check apps config tests`.

## 3. Frontend Import / Migration Wizard UI

- [x] 3.1 Add `previewCsvImport` and `importMappedCsv` API helpers and types to `frontend/src/lib/api.ts`, and verify `npm run build` typechecks cleanly.
- [x] 3.2 Create `frontend/src/components/ImportWizardModal.tsx` with CSV upload, detected preset badge, editable column-mapping selectors, normalized row preview table, optional photo import toggle, and result summary, and integrate it into `frontend/src/pages/CollectionPage.tsx`.
- [x] 3.3 Add Vitest coverage for `ImportWizardModal` in `frontend/src/__tests__/app.test.tsx` and verify `npm test` and `npm run build` pass.

# Proposal

## Why

Collectors migrating from platforms like CoinSnap, Numista, PCGS/NGC Set Registry, or custom spreadsheets cannot easily use StackVault's current CSV importer because it requires exact StackVault column names (`title`, `metal_type`, `weight_unit`, etc.). Adding an intelligent CSV migration importer with platform preset auto-detection, interactive column mapping, and value normalization removes friction for new users bringing existing collections into StackVault.

## What Changes

- Add backend CSV preview/inspection and flexible mapped-import support so users can upload any CSV (CoinSnap, Numista, PCGS/NGC Registry, APMEX/Bullion spreadsheets, or StackVault native) with either auto-detected preset mappings or custom column mappings.
- Add value normalization during import:
  - Compose `title` automatically from fields like `Year`, `Country`/`Issuer`, and `Denomination`/`Name` when a dedicated `title` column is absent.
  - Parse currency symbols and commas from price fields (e.g., `$1,250.00` -> `1250.00`).
  - Normalize metal/composition strings (e.g., `"Silver"`, `"Ag"`, `"90% Silver"` -> `SILVER`; `"Gold"` -> `GOLD`; `"Copper"`, `"Bronze"`, `"Copper-Nickel"` -> `COPPER` or `NONE`) and grading service names (`PCGS`, `NGC`, `PMG`, `ANACS`, `CACG`).
  - Optionally download and attach `Image URL` / `Obverse Image` / `Reverse Image` photos when provided (e.g., CoinSnap exports), skipping invalid/unreachable URLs gracefully without failing the row.
- Add a frontend **Import / Migration Modal** on the Collection Vault page that:
  - Lets users upload a CSV, shows the auto-detected platform preset (e.g., `CoinSnap`, `Numista`, `PCGS/NGC`, `StackVault Native`, `Custom`),
  - Displays an editable column-mapping table and a preview of the first few normalized rows before confirming import,
  - Reports clear created/skipped/error counts after import.

## Capabilities

### New Capabilities
- `catalog-migration-importer`: Flexible multi-platform CSV collection migration with preset auto-detection, interactive column mapping, value normalization, and optional remote photo attachment.

### Modified Capabilities
- None (existing `POST /api/v1/catalog/items/import/csv` continues to accept native StackVault CSVs unchanged for backward compatibility).

## Impact

- **Backend (`backend/apps/catalog/`)**: New importer service module (`importer.py`), new endpoints `POST /api/v1/catalog/items/import/preview` and `POST /api/v1/catalog/items/import/mapped` (or extended `import/csv` with optional `mapping` JSON), plus pytest coverage.
- **Frontend (`frontend/src/`)**: New `ImportWizardModal` component integrated into `CollectionPage.tsx`, new `api.previewCsvImport` and `api.importMappedCsv` helpers in `lib/api.ts`, and Vitest coverage.

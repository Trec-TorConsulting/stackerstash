# Design

## Context

StackVault currently has a single native CSV importer at `POST /api/v1/catalog/items/import/csv` ([backend/apps/catalog/api.py](file:///Users/trecto282@cable.comcast.com/Projects/Personal/Stackers-coins-paper-collection-tracking/backend/apps/catalog/api.py)) that requires exact StackVault field names (`title`, `metal_type`, `weight_unit`, etc.). See [proposal.md](file:///Users/trecto282@cable.comcast.com/Projects/Personal/Stackers-coins-paper-collection-tracking/openspec/changes/migration-csv-importer/proposal.md) for motivation.

## Goals / Non-Goals

**Goals:**
- Keep existing `POST /api/v1/catalog/items/import/csv` 100% backward compatible for StackVault native exports.
- Provide a clean two-step preview -> confirm flow (`POST /api/v1/catalog/items/import/preview` and `POST /api/v1/catalog/items/import/mapped`) backed by a dedicated `apps/catalog/importer.py` module.
- Support auto-detection for `coinsnap`, `numista`, `pcgs_ngc`, and `stackvault` CSV exports, plus fuzzy header matching for arbitrary spreadsheets.
- Provide a self-contained `ImportWizardModal` component on `CollectionPage.tsx` with preset badge, column mapping overrides, and row preview.

**Non-Goals:**
- Direct OAuth/API scraping of third-party platforms (CoinSnap/Numista do not offer public user-sync APIs; CSV export is the universal migration path).
- Asynchronous Celery background import jobs (typical collector CSVs are <5,000 rows and import synchronously in under 1 second; remote photo downloads are optional and capped with short timeouts).

## Decisions

1. **Two-step Preview + Mapped Import endpoints vs. client-only CSV parsing**
   - *Decision*: Parse and normalize on the backend (`import/preview` + `import/mapped`).
   - *Rationale*: Keeps CSV encoding (`utf-8-sig`), delimiter/quoting edge cases, title synthesis, metal/grade normalization, and enum validation in one place in Python, ensuring preview output matches actual import behavior identically.
2. **Optional `import_photos` toggle (default off or best-effort with 4s timeout)**
   - *Decision*: Include `import_photos: bool = False` on `import/mapped` (enabled by default in UI only when image URL columns are mapped, with a checkbox to toggle). Fetch with `httpx` 4s timeout and a 5 MB size cap, attaching `ItemPhoto` on success and collecting non-fatal warnings on failure.
   - *Rationale*: Prevents slow or expired CDN links in CoinSnap exports from blocking or timing out an entire migration.
3. **Title synthesis order**
   - *Decision*: When `title` is not mapped or is blank, synthesize from `[year, country, denomination/name, grade]` (e.g., `"1921 United States Morgan Dollar MS63"`), falling back to `cert_number` or `"Imported Item"` if all are empty.

## Risks / Trade-offs

- **Third-party CSV header drift** → CoinSnap or Numista may rename columns across app versions. Mitigation: Use case-insensitive alias lists per target field and allow the user to override any mapping in the UI before importing.
- **Remote image URLs timing out** → Mitigation: Short per-request timeout (4s), cap at 5 MB, and treat image fetch failures as non-fatal warnings so the catalog item is always created.

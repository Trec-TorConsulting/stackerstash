# Spec Delta

## Purpose

Enables collectors to migrate existing inventories from CoinSnap, Numista, PCGS/NGC registries, and custom spreadsheets into Stackers Stash with automatic preset detection, interactive column mapping, and value normalization.

## ADDED Requirements

### Requirement: CSV preview and platform preset detection
The system SHALL provide a CSV preview endpoint that inspects uploaded CSV headers and sample rows, detects the best matching source platform preset (`coinsnap`, `numista`, `pcgs_ngc`, `stackerstash`, or `custom`), and returns suggested column mappings and normalized preview rows.

#### Scenario: CoinSnap CSV auto-detected
- **WHEN** a user uploads a CSV with CoinSnap-style headers such as `Country`, `Year`, `Denomination`, `Composition`, `Grade`, and `Estimated Value`
- **THEN** the preview endpoint returns `detected_preset: "coinsnap"`, suggested column mappings for each recognized header, and a preview of normalized rows

#### Scenario: Unrecognized headers fall back to custom preset
- **WHEN** a user uploads a CSV with custom headers that do not match a known platform preset
- **THEN** the preview endpoint returns `detected_preset: "custom"` with best-effort fuzzy header suggestions and raw sample rows for manual mapping

### Requirement: Flexible mapped CSV import
The system SHALL allow users to import a CSV using either the auto-detected mapping or a user-customized column mapping JSON payload, creating workspace-scoped `CollectionItem` records and returning created counts and per-row errors.

#### Scenario: Import succeeds with custom column mapping
- **WHEN** a user submits a CSV file along with a custom column mapping JSON mapping `Coin Name` to `title` and `Paid` to `purchase_price`
- **THEN** the importer creates `CollectionItem` records in the user's workspace using those mapped columns and returns the `created_count`

#### Scenario: Title synthesized when no title column is mapped
- **WHEN** a CSV row has no dedicated `title` column mapped but has `year`, `country`, and `denomination` (or `name`) values
- **THEN** the importer synthesizes a clean `title` (e.g., `"1921 United States Morgan Dollar"`) instead of rejecting the row

### Requirement: Value normalization for metals, grades, and currency
The system SHALL normalize currency strings, metal/composition labels, weight units, and grading service names during mapped import so external exports map cleanly to Stackers Stash enums and decimals.

#### Scenario: Currency symbols and commas stripped
- **WHEN** a CSV row contains `"$1,250.50"` in a mapped price or market value column
- **THEN** the importer parses it as `Decimal("1250.50")`

#### Scenario: Composition string mapped to Stackers Stash metal type
- **WHEN** a CSV row contains `"90% Silver"` or `"Silver (.900)"` in a mapped `metal_type` / `composition` column
- **THEN** the importer maps `metal_type` to `"SILVER"`

### Requirement: Optional remote photo attachment during migration
The system SHALL support mapping image URL columns (such as `obverse_image_url` / `reverse_image_url` or `image_url`) and optionally fetching those images into `ItemPhoto` records without failing the item import if an image URL is unreachable.

#### Scenario: Unreachable image URL does not fail item creation
- **WHEN** a mapped CSV row includes an `image_url` that times out or returns a non-200 status
- **THEN** the `CollectionItem` is still created and the failed image fetch is recorded as a non-fatal warning rather than a row error

### Requirement: Interactive Import Migration Wizard UI
The frontend Collection Vault page SHALL provide an interactive Import / Migration modal that previews detected platform presets, lets users adjust column mappings and review sample rows before confirming, and refreshes the collection upon completion.

#### Scenario: User previews and confirms a CoinSnap import in the UI
- **WHEN** a user clicks "Import / Migrate" on the Collection Vault page and selects a CSV file
- **THEN** the modal displays the detected preset badge, editable column mapping dropdowns, a normalized preview table, and an "Import Items" confirmation button

# numismatic-specs-enrichment Specification

## Purpose
Stores and enriches structured numismatic and physical specifications for coins, bullion, and paper currency so collectors have accurate mintage, composition, dimension, variety, and catalog metadata.

## Requirements

### Requirement: Structured numismatic specification fields
The system SHALL persist structured numismatic specification attributes on `CollectionItem` (or an attached JSON/related specification record) including `mint_mark`, `mintage`, `variety`, `composition`, `gross_weight_grams`, `diameter_mm`, `thickness_mm`, `edge_type`, `designer`, and `catalog_numbers`.

#### Scenario: Creating or updating an item with coin specs
- **WHEN** a user submits or edits `mint_mark`, `mintage`, `variety`, `composition`, `diameter_mm`, or `catalog_numbers` on an item
- **THEN** the system validates and persists those fields and returns them in `ItemOut`

### Requirement: Automatic spec enrichment during appraisal
The system SHALL query configured numismatic catalog sources (Numista, PCGS cert metadata, and AI fallback) during appraisal to populate missing specification fields without overwriting user-verified values.

#### Scenario: Auto-populating specs for a coin missing mintage and diameter
- **WHEN** an appraisal runs for a coin whose `mintage` and `diameter_mm` are empty and Numista or PCGS returns matching catalog specs
- **THEN** the system populates the empty specification fields and marks their provenance in the item's spec metadata

#### Scenario: Preserving user-entered variety or mintage
- **WHEN** a user has manually entered a `variety` (e.g., `VAM-14A`) or `mintage` on an item and runs an appraisal
- **THEN** the system preserves the user's manually entered value instead of overwriting it with external catalog data

### Requirement: Physical verification context for collectors
The system SHALL display gross weight, diameter, thickness, and composition alongside fine precious-metal weight to assist collectors in authenticity and ping/caliper checks.

#### Scenario: Inspecting physical specs on an item detail page
- **WHEN** a collector opens an item with populated physical specifications
- **THEN** the Numismatic Specs section displays gross weight (g), diameter (mm), thickness (mm), edge type, and alloy composition

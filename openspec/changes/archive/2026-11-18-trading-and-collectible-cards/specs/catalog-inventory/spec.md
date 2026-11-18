# Spec Delta

## MODIFIED Requirements

### Requirement: Polymorphic item cataloging
The system SHALL support creating, editing, and deleting collection items across categories including Coins, Paper Currency, Bars/Ingots, Rounds, Trading Cards, Graded Slabs, Flippers, and Miscellaneous Collectibles with category-relevant attributes.

#### Scenario: Catalog a 1kg copper bar or Geiger silver slab
- **WHEN** a user creates a Bars/Ingots item with metal type Copper or Silver, weight, purity, mint/refiner, and optional assay serial number
- **THEN** the system persists the item with normalized troy-ounce and gram metal weight for valuation

#### Scenario: Catalog a paper banknote
- **WHEN** a user creates a Paper Currency item with country, denomination, series year, serial number, and grade or PMG/PCGS Banknote certification
- **THEN** the system persists the banknote record with zero bullion melt weight and searchable serial/series metadata

#### Scenario: Catalog a trading or Pokémon card
- **WHEN** a user creates a `CARD` item with franchise/game, set name, card number, rarity, finish/parallel, edition, and optional raw condition or PSA/BGS/CGC/SGC/TAG certification
- **THEN** the system persists the card record with zero bullion melt weight and searchable card metadata

#### Scenario: Catalog a graded slab
- **WHEN** a user creates a Graded Slab item with grading service (PCGS, NGC, PMG, CACG, ANACS, PSA, BGS, CGC, SGC, TAG, etc.), certification number, and numeric or adjectival grade
- **THEN** the system stores the certification tuple and enables cert verification links and lookups

### Requirement: Bulk CSV import and insurance/estate export
The system SHALL allow users to bulk-import items from CSV spreadsheets with validation previews—including trading card columns such as `card_game`, `set_name`, `card_number`, `rarity`, `card_finish`, `card_edition`, `raw_condition`, and card grading services (`PSA`, `BGS`, `CGC`, `SGC`, `TAG`)—and export their collection as CSV, JSON, or a printable insurance/estate inventory report.

#### Scenario: Bulk import from CSV
- **WHEN** a user uploads a valid CSV file of holdings (coins, bullion, notes, or trading cards) and confirms the column mapping preview
- **THEN** the system creates the corresponding items in the user's active workspace and reports any row-level validation errors

### Requirement: Grouped category and sub-category collection view
The system SHALL provide a grouped browse mode in the collection view that organizes items under canonical primary categories (`Coins`, `Paper Currency`, `Bars / Ingots`, `Rounds`, `Trading Cards`, `Other`) and nested sub-categories (Country/Origin including `Ancient` for Coins and Paper Currency; Mint/Pourer/Refiner for Bars and Rounds; Franchise/Game/Sport for Trading Cards), displaying item counts and aggregate values per group.

#### Scenario: Browse collection grouped by category and sub-category
- **WHEN** a user selects the grouped category view in the collection page
- **THEN** the system renders collapsible primary category sections (`Coins`, `Paper Currency`, `Bars / Ingots`, `Trading Cards`, etc.) containing nested sub-category groups (e.g., `United States`, `Mexico`, `Ancient`, `Geiger Edelmetalle`, `Pokémon`, `Magic: The Gathering`, `Sports — Baseball`) with item counts and totals

#### Scenario: Graded slabs display Graded badge inside parent category
- **WHEN** a graded coin slab appears under `Coins -> United States`, a PMG banknote appears under `Paper Currency -> United States`, or a PSA slab appears under `Trading Cards -> Pokémon` in the grouped view
- **THEN** the item card displays a visible `Graded` badge alongside its grading service and grade

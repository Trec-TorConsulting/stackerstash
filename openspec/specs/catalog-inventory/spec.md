# catalog-inventory Specification

## Purpose
Manages polymorphic collectible and bullion items (coins, paper banknotes, bars, Geiger slabs, rounds, flippers, graded slabs), hierarchical storage containers, multi-photo attachments, and sortable gallery/list views.

## Requirements

### Requirement: Polymorphic item cataloging
The system SHALL support creating, editing, and deleting collection items across categories including Coins, Paper Currency, Bars/Ingots, Rounds, Graded Slabs, Flippers, and Miscellaneous Bullion with category-relevant attributes.

#### Scenario: Catalog a 1kg copper bar or Geiger silver slab
- **WHEN** a user creates a Bars/Ingots item with metal type Copper or Silver, weight, purity, mint/refiner, and optional assay serial number
- **THEN** the system persists the item with normalized troy-ounce and gram metal weight for valuation

#### Scenario: Catalog a paper banknote
- **WHEN** a user creates a Paper Currency item with country, denomination, series year, serial number, and grade or PMG/PCGS Banknote certification
- **THEN** the system persists the banknote record with zero bullion melt weight and searchable serial/series metadata

#### Scenario: Catalog a graded slab
- **WHEN** a user creates a Graded Slab item with grading service (PCGS, NGC, PMG, CACG, ANACS, etc.), certification number, and numeric or adjectival grade
- **THEN** the system stores the certification tuple and enables cert verification links and lookups

### Requirement: Hierarchical containers and storage locations
The system SHALL allow users to organize items inside nested containers such as Safes, Boxes, Tubes, and Binders of Flippers, tracking quantity and aggregate container value.

#### Scenario: Assign tube of coins to a safe
- **WHEN** a user creates a "Monster Box" or "Safe" location, nests a "Tube of 20 Silver Eagles" inside it, and assigns coins or a quantity-20 tube item to it
- **THEN** the system displays the nested hierarchy and rolls up item count and total value to the parent container

### Requirement: Multi-photo attachment and gallery view
The system SHALL allow each item to store multiple labeled photos (e.g., Obverse/Front, Reverse/Back, Slab Label, Assay/Receipt) and display a primary thumbnail in a visual gallery.

#### Scenario: Upload obverse and reverse photos
- **WHEN** a user attaches an obverse photo and a reverse photo to an item and marks obverse as primary
- **THEN** the gallery view renders the obverse thumbnail and the item detail view displays all attached photos in order

#### Scenario: Shape-aware background removal and tight cropping for bars and notes
- **WHEN** background removal runs on a `BAR`, `PAPER`, or banknote slab (`PMG`/`PCGS_BANKNOTE`) photo—including over a dark or textured mat—or when the user triggers **Clean Background**
- **THEN** the system uses LAB border-saliency GrabCut seeding, detects the tight oriented rectangle, and applies an anti-aliased rounded-rectangle alpha cutout (`0.075` corner ratio for bars, `0.015` for notes) before cropping tightly

### Requirement: Sorting, filtering, and search
The system SHALL allow users to sort and filter their collection by category, primary sort category, sub-category, graded status, metal type, container, grading service, item status, tags, purchase date, current value, melt value, and gain/loss, plus full-text search.

#### Scenario: Sort by most valuable items
- **WHEN** a user selects sort by current value descending in the collection view
- **THEN** the system returns items ordered from highest to lowest current estimated value with images visible

#### Scenario: Filter by sub-category and graded status
- **WHEN** a user filters the collection by primary sort category `Coins`, sub-category `Mexico`, and graded status `Graded`
- **THEN** the system returns only graded coin items (including coin slabs) whose sub-category is `Mexico`

### Requirement: Item lifecycle status, tags, and presets
The system SHALL track item status (`IN_COLLECTION`, `FOR_SALE`, `SOLD`, `WISHLIST`), user-defined tags, and quick-add bullion/constitutional silver presets (such as 90% US silver, 1oz .999 silver round, 1kg copper bar) to accelerate bulk entry.

#### Scenario: Mark item as sold
- **WHEN** a user updates an item status to `SOLD` with a sold price and sold date
- **THEN** the system preserves the historical record, computes realized gain/loss, and excludes it from active in-collection totals

### Requirement: Bulk CSV import and insurance/estate export
The system SHALL allow users to bulk-import items from CSV spreadsheets with validation previews and export their collection as CSV, JSON, or a printable insurance/estate inventory report.

#### Scenario: Bulk import from CSV
- **WHEN** a user uploads a valid CSV file of holdings and confirms the column mapping preview
- **THEN** the system creates the corresponding items in the user's active workspace and reports any row-level validation errors

### Requirement: Grouped category and sub-category collection view
The system SHALL provide a grouped browse mode in the collection view that organizes items under canonical primary categories (`Coins`, `Paper Currency`, `Bars / Ingots`, `Rounds`, `Other`) and nested sub-categories (Country/Origin including `Ancient` for Coins and Paper Currency; Mint/Pourer/Refiner for Bars and Rounds), displaying item counts and aggregate values per group.

#### Scenario: Browse collection grouped by category and sub-category
- **WHEN** a user selects the grouped category view in the collection page
- **THEN** the system renders collapsible primary category sections (`Coins`, `Paper Currency`, `Bars / Ingots`, etc.) containing nested sub-category groups (e.g., `United States`, `Mexico`, `Ancient`, `Geiger Edelmetalle`) with item counts and totals

#### Scenario: Graded slabs display Graded badge inside parent category
- **WHEN** a graded coin slab appears under `Coins -> United States` or a PMG banknote appears under `Paper Currency -> United States` in the grouped view
- **THEN** the item card displays a visible `Graded` badge alongside its grading service and grade

### Requirement: Manual sort category and sub-category override on items
The system SHALL allow users to view and manually edit an item's primary sort category and sub-category from the item detail view, or reset it to automatic classification.

#### Scenario: User overrides item sub-category
- **WHEN** a user edits an item's sub-category to a custom value (e.g., `Bison Bullion`) and saves
- **THEN** the system persists the new sub-category, sets `sort_override` to true, and places the item under that sub-category in the collection view

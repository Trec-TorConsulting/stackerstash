# catalog-inventory Specification

## Purpose
Manages polymorphic collectible and bullion items (coins, paper banknotes, bars, Geiger slabs, rounds, flippers, graded slabs), hierarchical storage containers, multi-photo attachments, and sortable gallery/list views.

## Requirements

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

### Requirement: Manual sort category and sub-category override on items
The system SHALL allow users to view and manually edit an item's primary sort category and sub-category from the item detail view, or reset it to automatic classification.

#### Scenario: User overrides item sub-category
- **WHEN** a user edits an item's sub-category to a custom value (e.g., `Bison Bullion`) and saves
- **THEN** the system persists the new sub-category, sets `sort_override` to true, and places the item under that sub-category in the collection view

### Requirement: Direct circular coin detection and small-denomination slab extraction
The system SHALL detect circular coins and rounds directly on the original image using contrast-enhanced circle detection (`CLAHE` + `HoughCircles` with angular edge coverage and radial LAB contrast) when extracting raw, flipped, or capsuled coins (`COIN`/`ROUND`), and SHALL support smaller-radius coins (`min_r >= 0.13 * slab_w`) inside tall grading slabs (`detect_coin_in_slab`) so dimes, cents, nickels, and quarters are extracted cleanly alongside larger dollars and rounds.

#### Scenario: Proof silver round with dark mirror fields on dark mat
- **WHEN** a user uploads or cleans an `OBVERSE` or `REVERSE` photo of a raw `COIN` or `ROUND` with dark mirror fields or underexposed lighting
- **THEN** `detect_circular_coin` locates the coin's circular rim on the original image and `extract_coin_cutout` produces a tightly cropped, anti-aliased circular PNG preserving the entire coin interior and dropping the surrounding mat or 2×2 holder.

#### Scenario: Small-denomination coin inside a tall grading slab
- **WHEN** a user uploads an `OBVERSE` or `REVERSE` photo of a slabbed dime, cent, nickel, or quarter
- **THEN** `detect_coin_in_slab` detects the smaller coin radius (`>= 0.13 * slab_w`) and extracts the circular coin cutout as `OBVERSE`/`REVERSE` while preserving the full slab as `SLAB_LABEL`.

### Requirement: In-app 90-degree photo rotation
The system SHALL provide a `POST /api/v1/catalog/items/{item_id}/photos/{photo_id}/rotate` endpoint (accepting `degrees` in `{90, 180, 270, -90}`) and a **Rotate 90°** action in the item detail photo viewer so users can correct upside-down or sideways photos without re-uploading.

#### Scenario: Rotating an upside-down coin photo
- **WHEN** an authenticated user triggers **Rotate 90°** on an item photo
- **THEN** the backend rotates the stored image by the requested angle (preserving alpha transparency), updates stored `width` and `height`, and returns the updated `PhotoOut` payload.

### Requirement: Shape-aware background removal and tight cropping for bars and notes
When background removal runs on a `BAR`, `PAPER`, or banknote slab (`PMG`/`PCGS_BANKNOTE`) photo—including items inside a clear plastic sleeve over a dark mat—the system SHALL detect a darker outer rim or irregular contour (`extent < 0.96`, `area_ratio <= 0.94`) via LAB-distance Otsu separation, snap the oriented rounded-rectangle cutout to the inner bar or note, and avoid locking outer mat fringes as definite foreground during RGBA re-cleans or inverted GrabCut masks.

#### Scenario: Goldback note inside a clear plastic sleeve on a dark mat
- **WHEN** background removal runs on a `PAPER` item photographed inside a clear plastic sleeve over a dark textured mat
- **THEN** `detect_rectangular_subject` detects the darker outer sleeve/mat rim and snaps the rounded-rectangle cutout tightly to the inner note.

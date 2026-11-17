# Spec Delta

## MODIFIED Requirements

### Requirement: Sorting, filtering, and search
The system SHALL allow users to sort and filter their collection by category, primary sort category, sub-category, graded status, metal type, container, grading service, item status, tags, purchase date, current value, melt value, and gain/loss, plus full-text search.

#### Scenario: Sort by most valuable items
- **WHEN** a user selects sort by current value descending in the collection view
- **THEN** the system returns items ordered from highest to lowest current estimated value with images visible

#### Scenario: Filter by sub-category and graded status
- **WHEN** a user filters the collection by primary sort category `Coins`, sub-category `Mexico`, and graded status `Graded`
- **THEN** the system returns only graded coin items (including coin slabs) whose sub-category is `Mexico`

## ADDED Requirements

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


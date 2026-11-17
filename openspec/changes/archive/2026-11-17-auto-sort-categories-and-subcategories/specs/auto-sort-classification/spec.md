# Spec Delta

## Purpose

Provides local-first background classification and normalization of collection items into canonical primary categories and sub-categories (Country/Origin including Ancient for Coins and Paper Currency; Mint/Pourer/Refiner for Bars and Rounds), respecting manual overrides and workspace preferences.

## ADDED Requirements

### Requirement: Background primary category normalization
The system SHALL classify each collection item in the background into a canonical primary sort category (`Coins`, `Paper Currency`, `Bars / Ingots`, `Rounds`, or `Other`), mapping graded slabs and holders to their underlying item type.

#### Scenario: Graded coin slab sorted under Coins
- **WHEN** an item with category `SLAB` or `FLIPPER` represents a coin (e.g., PCGS/NGC/ANACS/CACG graded coin or coin title/denomination) and auto-sort runs
- **THEN** the system assigns its primary sort category to `Coins` while preserving its underlying `category` and `grading_service` metadata

#### Scenario: Graded paper banknote sorted under Paper Currency
- **WHEN** an item with category `SLAB` has grading service `PMG` or `PCGS_BANKNOTE` or banknote metadata and auto-sort runs
- **THEN** the system assigns its primary sort category to `Paper Currency`

### Requirement: Sub-category assignment by item type
The system SHALL assign a normalized sub-category for each item based on its primary sort category: Country/Origin (including `Ancient` for ancient coinage/notes) for `Coins` and `Paper Currency`, and Mint/Pourer/Refiner for `Bars / Ingots` and `Rounds`.

#### Scenario: Coins sorted by country and ancient era
- **WHEN** auto-sort processes coins from "USA", "Mexico", and "Roman Empire"
- **THEN** the system normalizes their sub-categories to `United States`, `Mexico`, and `Ancient` respectively

#### Scenario: Silver bars sorted by mint or pourer
- **WHEN** auto-sort processes silver bars from "Geiger Edelmetalle", "Engelhard", and a custom poured bar with no major mint
- **THEN** the system assigns sub-categories `Geiger Edelmetalle`, `Engelhard`, and `Hand-Poured / Generic` (or the detected pourer name) respectively

#### Scenario: Missing or unidentifiable sub-category
- **WHEN** an item lacks sufficient metadata to determine a country or mint/pourer
- **THEN** the system assigns `Uncategorized` as the sub-category without failing item creation

### Requirement: Local-first background execution without cloud dependency
The system SHALL execute auto-sort classification asynchronously in a background task using deterministic local rules and optional self-hosted local model inference (e.g., Ollama) when configured, without requiring external cloud APIs.

#### Scenario: Item created via intake or import triggers background sort
- **WHEN** a user creates an item manually, via camera/upload intake, or via CSV import in a workspace with auto-sort enabled
- **THEN** the item is saved immediately and a background task populates `sort_category` and `sort_subcategory`

#### Scenario: Cloud providers are unconfigured or disabled
- **WHEN** auto-sort runs in an environment with no Gemini or external cloud API key configured
- **THEN** the system completes classification using local deterministic rules (and local Ollama if configured)

### Requirement: Manual override preservation
The system SHALL allow users to manually override an item's primary sort category or sub-category and SHALL NOT overwrite manually overridden items during background auto-sort or bulk re-sort runs.

#### Scenario: Pinned manual sub-category is preserved
- **WHEN** a user sets a custom sub-category on an item (marking it manually overridden) and later triggers a collection re-sort or updates unrelated item fields
- **THEN** the background auto-sort task skips updating that item's sort category and sub-category

#### Scenario: User resets item to auto-sort
- **WHEN** a user clears the manual override flag on an item
- **THEN** the system re-enqueues the item for background auto-sort classification

### Requirement: Workspace opt-out and bulk re-sort
The system SHALL skip automatic background classification for workspaces where auto-sort is disabled, while allowing users to trigger an on-demand re-sort of unpinned items.

#### Scenario: Auto-sort disabled in workspace
- **WHEN** a workspace has `auto_sort_enabled` set to false and a new item is created
- **THEN** the system does not enqueue background auto-sort for that item

#### Scenario: On-demand re-sort of unpinned items
- **WHEN** a user triggers a re-sort action for their workspace
- **THEN** the system enqueues background classification for all items in the workspace that do not have manual override enabled


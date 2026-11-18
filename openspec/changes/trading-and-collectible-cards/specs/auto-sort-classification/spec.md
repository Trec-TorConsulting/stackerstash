# Spec Delta

## MODIFIED Requirements

### Requirement: Background primary category normalization
The system SHALL classify each collection item in the background into a canonical primary sort category (`Coins`, `Paper Currency`, `Bars / Ingots`, `Rounds`, `Trading Cards`, or `Other`), mapping graded slabs and holders to their underlying item type.

#### Scenario: Graded coin slab sorted under Coins
- **WHEN** an item with category `SLAB` or `FLIPPER` represents a coin (e.g., PCGS/NGC/ANACS/CACG graded coin or coin title/denomination) and auto-sort runs
- **THEN** the system assigns its primary sort category to `Coins` while preserving its underlying `category` and `grading_service` metadata

#### Scenario: Graded paper banknote sorted under Paper Currency
- **WHEN** an item with category `SLAB` has grading service `PMG` or `PCGS_BANKNOTE` or banknote metadata and auto-sort runs
- **THEN** the system assigns its primary sort category to `Paper Currency`

#### Scenario: Raw or graded trading card sorted under Trading Cards
- **WHEN** an item has category `CARD`, or has category `SLAB` with a card grading service (`PSA`, `BGS`, `CGC`, `SGC`, `TAG`) or card metadata, and auto-sort runs
- **THEN** the system assigns its primary sort category to `Trading Cards`

### Requirement: Sub-category assignment by item type
The system SHALL assign a normalized sub-category for each item based on its primary sort category: Country/Origin (including `Ancient` for ancient coinage/notes) for `Coins` and `Paper Currency`, Mint/Pourer/Refiner for `Bars / Ingots` and `Rounds`, and Franchise/Game/Sport for `Trading Cards`.

#### Scenario: Coins sorted by country and ancient era
- **WHEN** auto-sort processes coins from "USA", "Mexico", and "Roman Empire"
- **THEN** the system normalizes their sub-categories to `United States`, `Mexico`, and `Ancient` respectively

#### Scenario: Silver bars sorted by mint or pourer
- **WHEN** auto-sort processes silver bars from "Geiger Edelmetalle", "Engelhard", and a custom poured bar with no major mint
- **THEN** the system assigns sub-categories `Geiger Edelmetalle`, `Engelhard`, and `Hand-Poured / Generic` (or the detected pourer name) respectively

#### Scenario: Trading cards sorted by franchise, game, or sport
- **WHEN** auto-sort processes trading cards for Pokémon, Magic: The Gathering, Yu-Gi-Oh!, Lorcana, One Piece, or Baseball
- **THEN** the system normalizes their sub-categories to `Pokémon`, `Magic: The Gathering`, `Yu-Gi-Oh!`, `Disney Lorcana`, `One Piece`, and `Sports — Baseball` (or `Other Cards` when franchise is unknown)

#### Scenario: Missing or unidentifiable sub-category
- **WHEN** an item lacks sufficient metadata to determine a country, mint/pourer, or card franchise
- **THEN** the system assigns `Uncategorized` as the sub-category without failing item creation

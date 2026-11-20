# Spec Delta: catalog-inventory

## ADDED Requirements

### Requirement: Type-tailored item detail overview and valuation hero
The system SHALL tailor the item detail page overview, metadata rows, and valuation hero cards according to the item's category (`COIN`, `BAR`, `ROUND`, `PAPER`, `CARD`, `OTHER`), suppressing non-pertinent fields such that non-bullion items do not display metal weight or zero-melt placeholders.

#### Scenario: Viewing a trading card detail overview
- **WHEN** a user views `ItemDetailPage` for a `CARD` item
- **THEN** the page hides "Metal & Fine Weight", hides the melt value / spot premium card, hides "Denomination", and displays Grade / Condition, Franchise, Set, and Market Value

#### Scenario: Viewing a paper currency detail overview
- **WHEN** a user views `ItemDetailPage` for a `PAPER` item
- **THEN** the page hides "Metal & Fine Weight" (unless metal is present as in a Goldback), hides the melt value hero card, and displays Grade / Condition, Series Year, Denomination, and Serial Number

#### Scenario: Viewing a bullion bar or round detail overview
- **WHEN** a user views `ItemDetailPage` for a `BAR` or `ROUND` item
- **THEN** the page displays Metal & Fine Weight, Live Spot Melt Value, Collector Premium, Refiner/Mint, and Bar/Round Dimensions, and hides Denomination, Card Game, and Banknote fields

### Requirement: Category-scoped item edit and scan-add forms
The system SHALL dynamically scope the visible fields in the item edit modal and scan/add form to the selected category, so users only input attributes relevant to that item type.

#### Scenario: Editing a trading card item
- **WHEN** a user opens the edit modal for a `CARD` item
- **THEN** the form displays card metadata fields (Game, Set Name, Set Code, Card Number, Rarity, Finish, Edition, Language, Raw Condition) and card grading services (PSA, BGS, CGC, SGC, TAG), while hiding metal type, weight value, weight unit, and purity inputs

#### Scenario: Editing a paper currency item
- **WHEN** a user opens the edit modal for a `PAPER` item
- **THEN** the form displays banknote fields (Country, Denomination, Series Year, Series, Serial Number, Mint/Printer) and banknote grading services (PMG, PCGS Banknote), while hiding metal type, weight, and purity (unless explicitly toggled for goldbacks)

#### Scenario: Editing a bullion bar item
- **WHEN** a user opens the edit modal for a `BAR` item
- **THEN** the form displays refiner, metal type, weight, weight unit, purity, and assay serial number, while hiding denomination, card fields, and coin numismatic fields

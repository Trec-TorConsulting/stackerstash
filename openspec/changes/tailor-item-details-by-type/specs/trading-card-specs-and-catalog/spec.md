# Spec Delta: trading-card-specs-and-catalog

## MODIFIED Requirements

### Requirement: Card Specifications UI panel
The system SHALL render a dedicated `Card Specifications` card on `ItemDetailPage` for `CARD` items (and slabs whose underlying item is a card), displaying franchise, set, card number, rarity, finish/parallel, edition, language, raw condition, subgrades, and clickable external catalog links, while strictly omitting numismatic specifications, denomination, and bullion metal/melt metrics.

#### Scenario: Viewing a Pokémon card detail page
- **WHEN** a user opens `ItemDetailPage` for a `CARD` item
- **THEN** the page displays `Card Specifications` with set, number, rarity, finish, edition, and condition, and completely hides numismatic fields (mintage, edge type, diameter, thickness), denomination, and metal weight / melt floor

#### Scenario: Viewing a PSA-graded Pokémon slab detail page
- **WHEN** a user opens `ItemDetailPage` for a `SLAB` item with `grading_service="PSA"` and card attributes
- **THEN** the page displays `Card Specifications` rather than `Numismatic Specifications`, and hides metal weight, melt value, and coin dimensions

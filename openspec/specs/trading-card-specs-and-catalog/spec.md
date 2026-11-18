# trading-card-specs-and-catalog Specification

## Purpose

Defines structured card-specific metadata, reference catalog matching, external TCG/card enrichment, and card specification UI presentation for trading cards, Pokémon cards, and sports/collectible cards.

## Requirements

### Requirement: Structured trading card metadata schema
The system SHALL store and expose structured card attributes on `CARD` items (and card-graded `SLAB` items), including franchise/game (`card_game`), set name (`set_name`), set code (`set_code`), card number (`card_number`), rarity (`rarity`), finish/variant (`card_finish`), edition (`card_edition`), language (`language`), and raw condition (`raw_condition`: `NM`, `LP`, `MP`, `HP`, `DMG`).

#### Scenario: Creating or updating a Pokémon card with structured attributes
- **WHEN** a user saves a `CARD` item with `card_game="Pokémon"`, `set_name="Base Set"`, `card_number="4/102"`, `rarity="Holo Rare"`, `card_finish="Holo"`, `card_edition="1st Edition"`, and `language="English"`
- **THEN** the API persists and returns those structured card attributes alongside standard item fields

#### Scenario: Tracking raw card condition separately from slabbed grade
- **WHEN** a user logs an ungraded `CARD` item with `raw_condition="LP"` and `grading_service="NONE"`
- **THEN** the item displays `LP (Lightly Played)` as its raw condition without requiring a third-party slab grade

### Requirement: External TCG and card catalog enrichment
The system SHALL enrich `CARD` items with authoritative set, numbering, rarity, and external catalog identifiers (`pokemon_tcg_id`, `tcgplayer_id`, `scryfall_id`, `pricecharting_id`) from zero-key public APIs (such as Pokémon TCG API and Scryfall) or local reference data during appraisal, recording field-level provenance.

#### Scenario: Enriching a Pokémon card via Pokémon TCG API
- **WHEN** a `CARD` item has `card_game="Pokémon"` and a recognizable card name and number or set
- **THEN** the enrichment step queries the Pokémon TCG reference/API, populates missing set code, rarity, artist, and `pokemon_tcg_id`, and records provenance without overwriting user-entered values

#### Scenario: Enriching a Magic: The Gathering card via Scryfall
- **WHEN** a `CARD` item has `card_game="Magic: The Gathering"` and a recognizable card name and set
- **THEN** the enrichment step queries Scryfall, populates missing set code, rarity, artist, and `scryfall_id`, and records provenance

### Requirement: Card Specifications UI panel
The system SHALL render a dedicated `Card Specifications` card on `ItemDetailPage` for `CARD` items (and slabs whose underlying item is a card), displaying franchise, set, card number, rarity, finish/parallel, edition, language, raw condition, and clickable external catalog links, instead of `Numismatic Specifications`.

#### Scenario: Viewing a Pokémon card detail page
- **WHEN** a user opens `ItemDetailPage` for a `CARD` item
- **THEN** the page displays `Card Specifications` with set, number, rarity, finish, edition, and condition, and hides numismatic-only fields such as mintage, edge type, diameter, and melt floor

#### Scenario: Viewing a PSA-graded Pokémon slab detail page
- **WHEN** a user opens `ItemDetailPage` for a `SLAB` item with `grading_service="PSA"` and card attributes
- **THEN** the page displays `Card Specifications` rather than `Numismatic Specifications`

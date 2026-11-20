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

### Requirement: Structured grading sub-grades and TAG 1000-point score
The system SHALL support storing and displaying structured grading sub-grades in card `attributes`/`specs` for BGS (Centering, Corners, Edges, Surface on 1–10 scale) and TAG Grading (1000-point TAG Score plus front/back Centering, Corners, Edges, Surface metrics).

#### Scenario: TAG-graded card displays 1000-point score and DIG link
- **WHEN** a user views a card with `grading_service = "TAG"` and a valid 8-character cert number
- **THEN** the card specs UI displays the TAG Score (if recorded), sub-grades (if recorded), and a direct link to the TAG DIG Report (`https://my.taggrading.com/card/{cert}`)

#### Scenario: BGS-graded card displays sub-grades
- **WHEN** a user views a card with `grading_service = "BGS"` and recorded sub-grades
- **THEN** the card specs UI displays Centering, Corners, Edges, and Surface sub-grades alongside the overall grade

### Requirement: PSA population and SpecID in card specs
The system SHALL store and display `psa_spec_id`, `total_population`, and `population_higher` in card specs when returned by PSA cert lookup.

#### Scenario: PSA population displayed on card detail
- **WHEN** a PSA-graded card has cached or fetched population data
- **THEN** the card specs UI displays Total Population and Population Higher

### Requirement: Static multi-franchise TCG and sports card checklists
The system SHALL maintain a server-side static reference dataset covering Pokémon, Magic: The Gathering, Yu-Gi-Oh!, Disney Lorcana, One Piece, and flagship Sports Cards (Topps, Bowman, Panini, Upper Deck) with set codes, card numbers, rarities, parallels/finishes, and external catalog IDs.

#### Scenario: Offline matching of TCG set code and card number
- **WHEN** user input or OCR text provides a recognized card set code and number across any supported franchise (such as Pokémon `SV01 025/198`, MTG `LEA 232`, Yu-Gi-Oh! `LOB-001`, Lorcana `TFC 1/204`, or One Piece `OP01-001`)
- **THEN** the system resolves the card name, franchise, set name, rarity, finish, release year, and external catalog IDs locally from `StaticCardSpec` with zero external API or AI calls

#### Scenario: Normalize sports card parallel and insert shorthand
- **WHEN** a sports card title or OCR text contains flagship brand and parallel terminology (such as `Panini Prizm Silver`, `Topps Chrome Refractor`, `Superfractor 1/1`, `RPA`, `SSP`, `Kaboom`, or `Downtown`)
- **THEN** the system resolves canonical manufacturer, parallel/finish tier, and rookie/case-hit metadata from the static sports card taxonomy

### Requirement: Trading card physical dimensions, protection sizing, and print-run markers
The system SHALL maintain static reference constants for standard and vintage trading card dimensions, point-thickness (`35pt`–`360pt`) sleeve/toploader/One-Touch compatibility, graded slab outer dimensions, and vintage print-run identifiers (e.g., Pokémon Shadowless/1st Edition, MTG Alpha/Beta/Unlimited).

#### Scenario: Recommend protection sizing for thick patch or standard TCG card
- **WHEN** a collector queries storage fit for a standard Pokémon/MTG card (`35pt`), a Chrome/Prizm card (`55pt`), or a thick memorabilia patch card (`130pt`–`180pt`)
- **THEN** the system returns exact card dimensions (width/height in mm and inches) and the matching sleeve, toploader, magnetic One-Touch, and graded slab holder dimensions

#### Scenario: Identify vintage print-run variant markers
- **WHEN** a collector inspects a 1999 Pokémon Base Set card or 1993 Magic: The Gathering card
- **THEN** the static catalog provides diagnostic print-run markers (such as copyright year `1999` vs. `1999-2000` and Shadowless border traits, or Alpha rounded corners vs. Beta/Unlimited borders)

### Requirement: Official trading card grading centering and subgrade rubrics
The system SHALL store static grading centering tolerances and subgrade rubrics for PSA, BGS (including Black Label 10), CGC, SGC, and TAG (1000-point scale) to ground raw card grade estimation and grading ROI analysis.

#### Scenario: Ground raw card grade estimate with official centering rubric
- **WHEN** a user views `EstimatedGradeCard` or runs grading ROI analysis for a raw `CARD` item
- **THEN** the system surfaces the target service's centering threshold (such as PSA 10 `55/45`–`60/40` front / `75/25` back or BGS Black Label `50/50`) alongside fee-backed `grading_upside_usd`

### Requirement: Tiered trading card catalog synchronization
The system SHALL synchronize trading card static reference datasets on tiered schedules—weekly for completed TCG set indexes and checklists from free public endpoints (Scryfall, Pokémon TCG, YGOProDeck, Lorcana, One Piece) and daily for newly released sets and slab population rollups.

#### Scenario: Weekly multi-franchise TCG set and checklist sync
- **WHEN** the weekly catalog sync task runs
- **THEN** the system fetches updated set indexes from configured public endpoints, validates records via Pydantic schemas, upserts into `StaticCardSpec` idempotently, and falls back cleanly to bundled fixtures on network failure

#### Scenario: Daily card population and new-release sync
- **WHEN** the daily sync task runs
- **THEN** the system updates `StaticGradingReference` card population baselines (PSA, BGS, CGC, SGC, TAG) and indexes newly launched card sets without interrupting offline lookup availability

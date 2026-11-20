# Spec Delta

## ADDED Requirements

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

# Spec Delta

## ADDED Requirements

### Requirement: Trading and collectible card identification
The system SHALL identify trading cards, Pokémon cards, TCG cards, and sports cards via local OCR, reference catalog matching, and Vision AI, extracting `category="CARD"`, `card_game`, `set_name`, `set_code`, `card_number`, `rarity`, `card_finish`, `card_edition`, `language`, `year`, and `metal_type="NONE"`.

#### Scenario: Identifying a raw Pokémon card
- **WHEN** a user captures or uploads front and back photos of a raw Pokémon card (e.g., Base Set Charizard `4/102`)
- **THEN** the identification pipeline returns `category="CARD"`, `card_game="Pokémon"`, `set_name="Base Set"`, `card_number="4/102"`, `rarity="Holo Rare"`, and `metal_type="NONE"`

#### Scenario: Identifying a Magic: The Gathering or Sports card
- **WHEN** a user captures or uploads photos of an MTG or sports trading card
- **THEN** the identification pipeline extracts the card title, set/year, card number, parallel/foil finish, and assigns `category="CARD"` with the corresponding `card_game`

### Requirement: Card grading slab label and cert extraction
The system SHALL detect and parse third-party card grading slabs (`PSA`, `BGS`, `CGC`, `SGC`, `TAG`) from slab label OCR, barcodes, and QR codes, extracting `grading_service`, `cert_number`, `grade`, and underlying card metadata.

#### Scenario: Scanning a PSA-graded Pokémon card slab
- **WHEN** a user scans a PSA-slabbed Pokémon card with visible label and barcode
- **THEN** the system extracts `grading_service="PSA"`, `cert_number`, numeric `grade` (e.g., `10` or `9`), and populates `card_game`, `set_name`, and `card_number` while setting `category="SLAB"`

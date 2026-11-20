# Spec Delta: banknote-specs-and-catalog

## Purpose

Defines structured banknote and paper currency metadata, fancy serial classification, catalog reference matching, and dedicated banknote specification UI presentation.

## ADDED Requirements

### Requirement: Banknote specifications metadata schema
The system SHALL support and persist structured paper currency attributes on `PAPER` items (and banknote `SLAB` items), including country/issuing authority, denomination, series year, series name, issuing bank or Federal Reserve District, serial number, fancy serial type, Friedberg/Pick catalog numbers, and paper quality designations.

#### Scenario: Cataloging a paper banknote with structured currency attributes
- **WHEN** a user creates or edits a `PAPER` item with country="United States", denomination="$20", series year="1934", series="Federal Reserve Note", issuing bank="New York (B2)", and serial number="B12345678A"
- **THEN** the system persists and exposes these structured banknote attributes without requiring bullion melt weight or coin physical parameters

#### Scenario: Recording banknote third-party grading and paper quality designations
- **WHEN** a banknote is certified by PMG or PCGS Banknote with an adjectival grade (e.g. "Gem Uncirculated 66") and paper quality designation (e.g. "EPQ" or "PPQ")
- **THEN** the system stores the certification number, grade, and paper quality designation, displaying them prominently in the banknote specs

### Requirement: Dedicated Banknote Specifications UI panel
The system SHALL render a dedicated `Banknote Specifications` card on `ItemDetailPage` for `PAPER` items (and banknotes in `SLAB` or holder form) displaying country, denomination, series year, issuing bank/district, serial number, catalog numbers, signatures, and holder sizing, in place of the coin-oriented `Numismatic Specifications` card.

#### Scenario: Viewing a paper currency item detail page
- **WHEN** a user opens `ItemDetailPage` for a `PAPER` item
- **THEN** the system renders the `Banknote Specifications` panel displaying note-relevant metadata and hides coin-specific fields including mint mark, diameter, thickness, composition, edge type, and VAM variety

#### Scenario: Viewing a PMG-graded slabbed banknote
- **WHEN** a user views a `SLAB` item whose grading service is `PMG` or `PCGS_BANKNOTE`
- **THEN** the system renders the `Banknote Specifications` panel with slab certification verification link and PMG large banknote holder dimensions

### Requirement: Banknote fancy serial number and star run detection
The system SHALL identify and display collectible fancy serial number classifications (such as Star Note ★, Radar, Repeater, Binary, Low Serial, Solid, or Ladder) on `PAPER` items when a serial number is provided.

#### Scenario: Identifying a star note serial number
- **WHEN** a user views or imports a paper currency item with a serial number ending in a star (e.g., "B01234567*")
- **THEN** the banknote specifications UI displays a visible "Star Note" badge indicating a replacement print run

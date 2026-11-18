# Spec Delta

## MODIFIED Requirements

### Requirement: Automatic grade estimation for raw gradeable items
The system SHALL estimate a condition grade (`estimated_grade`, `estimated_grade_range`, and `estimated_grade_rationale`) using Sheldon (1–70) for coins, PMG (1–70) for paper currency, or the TCG/Sports 1–10 scale (with centering, corners, edges, and surface sub-notes plus raw condition tier `NM`/`LP`/`MP`/`HP`/`DMG`) for trading cards whenever an item has `grading_service == "NONE"` and is a gradeable category (`COIN`, `PAPER`, `FLIPPER`, `ROUND`, `CARD`).

#### Scenario: Appraising a raw coin with obverse and reverse photos
- **WHEN** an appraisal runs for an ungraded coin (`grading_service == "NONE"`) with uploaded photos
- **THEN** the AI appraisal inspects wear, luster, strike, and contact marks to populate `estimated_grade` (e.g., `AU55`), `estimated_grade_range` (e.g., `AU50–AU58`), and `estimated_grade_rationale`

#### Scenario: Appraising a raw trading or Pokémon card with front and back photos
- **WHEN** an appraisal runs for an ungraded `CARD` item (`grading_service == "NONE"`) with uploaded photos
- **THEN** the AI appraisal evaluates centering, corners, edges, and surface (holo scratches/whitening) to populate `estimated_grade` on the 1–10 scale (e.g., `PSA 8 Est.` or `8`), `estimated_grade_range` (e.g., `7–8.5`), `raw_condition`, and `estimated_grade_rationale`

#### Scenario: Preserving certified slab grades
- **WHEN** an appraisal runs for an item that already has a third-party slab (`grading_service != "NONE"` and `grade` is set)
- **THEN** the system does not overwrite the certified `grade` and skips raw grade estimation

#### Scenario: Preserving user-entered estimated grade
- **WHEN** a user has manually entered an `estimated_grade` and locked it via `specs_provenance`
- **THEN** the system preserves the user's `estimated_grade` while still surfacing any AI range/rationale in the appraisal history

### Requirement: Third-party grading ROI assessment
The system SHALL compute and expose `grading_upside_usd` (estimated net value change after typical slabbing fees—using numismatic fees for coins/notes and PSA/BGS/CGC fees for trading cards) and a clear recommendation on whether professional grading is financially worthwhile.

#### Scenario: High-value raw key-date coin
- **WHEN** a raw coin's estimated graded value exceeds its raw value by more than typical grading/shipping costs
- **THEN** the UI displays a positive `grading_upside_usd` badge and recommends considering PCGS/NGC/CACG certification

#### Scenario: High-value raw Pokémon or sports card
- **WHEN** a raw `CARD` item's estimated PSA 9/10 value exceeds its raw NM value by more than typical card grading/shipping fees
- **THEN** the UI displays a positive `grading_upside_usd` badge and recommends considering PSA/BGS/CGC certification

#### Scenario: Common bullion or low-value raw coin
- **WHEN** a raw coin or common modern card's value jump from grading is less than typical grading fees
- **THEN** the UI advises keeping the item raw rather than spending fees on certification

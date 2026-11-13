# raw-item-grade-estimation Specification

## Purpose
Estimates Sheldon or PMG numerical grades, grade ranges, surface/wear rationales, and third-party grading ROI for raw, ungraded, and unslabbed items during appraisal.

## Requirements

### Requirement: Automatic grade estimation for raw gradeable items
The system SHALL estimate a condition grade (`estimated_grade`, `estimated_grade_range`, and `estimated_grade_rationale`) using Sheldon (1–70) for coins or PMG (1–70) for paper currency whenever an item has `grading_service == "NONE"` and is a gradeable category (`COIN`, `PAPER`, `FLIPPER`, `ROUND`).

#### Scenario: Appraising a raw coin with obverse and reverse photos
- **WHEN** an appraisal runs for an ungraded coin (`grading_service == "NONE"`) with uploaded photos
- **THEN** the AI appraisal inspects wear, luster, strike, and contact marks to populate `estimated_grade` (e.g., `AU55`), `estimated_grade_range` (e.g., `AU50–AU58`), and `estimated_grade_rationale`

#### Scenario: Preserving certified slab grades
- **WHEN** an appraisal runs for an item that already has a third-party slab (`grading_service != "NONE"` and `grade` is set)
- **THEN** the system does not overwrite the certified `grade` and skips raw grade estimation

#### Scenario: Preserving user-entered estimated grade
- **WHEN** a user has manually entered an `estimated_grade` and locked it via `specs_provenance`
- **THEN** the system preserves the user's `estimated_grade` while still surfacing any AI range/rationale in the appraisal history

### Requirement: Third-party grading ROI assessment
The system SHALL compute and expose `grading_upside_usd` (estimated net value change after typical slabbing fees) and a clear recommendation on whether professional grading is financially worthwhile.

#### Scenario: High-value raw key-date coin
- **WHEN** a raw coin's estimated graded value exceeds its raw value by more than typical grading/shipping costs
- **THEN** the UI displays a positive `grading_upside_usd` badge and recommends considering PCGS/NGC/CACG certification

#### Scenario: Common bullion or low-value raw coin
- **WHEN** a raw coin's value jump from grading is less than typical grading fees
- **THEN** the UI advises keeping the coin raw rather than spending fees on certification

### Requirement: Distinct uncertified grade UI presentation
The UI SHALL render an Estimated Grade & Grading ROI card on `ItemDetailPage` for raw gradeable items, clearly labeled as an uncertified AI estimate with one-click manual override.

#### Scenario: Viewing and overriding an estimated grade
- **WHEN** a collector views a raw coin on `ItemDetailPage`
- **THEN** the Estimated Grade card displays the grade badge, range, surface rationale, and an inline edit option to adjust `estimated_grade`

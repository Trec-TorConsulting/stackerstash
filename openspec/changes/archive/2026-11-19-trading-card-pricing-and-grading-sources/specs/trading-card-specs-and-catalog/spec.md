# Spec Delta

## ADDED Requirements

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

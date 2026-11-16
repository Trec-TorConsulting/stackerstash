# Spec Delta

## ADDED Requirements

### Requirement: Goldback denomination, weight, and taxonomy normalization
The system SHALL recognize Goldback Aurum 24K gold foil currency notes across all official denominations (`1/4`, `1/2`, `1`, `2`, `5`, `10`, `25`, `50`, `100`) and US state/local series, and SHALL deterministically normalize their category (`PAPER`), country (`United States`), metal (`GOLD`), purity (`0.9999`), weight unit (`OZ_T`), and exact troy-ounce gold weight (`denomination / 1000`).

#### Scenario: Identify a fractional or multi-unit Goldback note
- **WHEN** Vision AI or OCR identifies a Goldback note of denomination `1/4`, `1/2`, `1`, `2`, `5`, `10`, `25`, `50`, or `100`
- **THEN** the candidate normalizer sets `category` to `PAPER`, `country` to `United States`, `metal_type` to `GOLD`, `purity` to `0.9999`, `weight_unit` to `OZ_T`, and `weight_value` to `denomination / 1000` (e.g., `0.00025` for `1/4 Goldback` and `0.002` for `2 Goldback`), never confusing fractional Goldbacks with `1/4 oz` or `1/2 oz` bullion

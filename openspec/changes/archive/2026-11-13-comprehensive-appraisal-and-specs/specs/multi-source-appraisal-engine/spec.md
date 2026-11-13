# Spec Delta

## Purpose

Replaces the early-exit valuation waterfall with a concurrent multi-source appraisal engine that aggregates live melt floor, numismatic price guides, cert lookups, realized sold comps, and multimodal AI into a reconciled market range and audit trail.

## ADDED Requirements

### Requirement: Non-short-circuiting multi-source appraisal
The system SHALL evaluate all applicable valuation sources for an item during an appraisal without stopping at melt value when numismatic, comp, or AI sources are available.

#### Scenario: Bullion-weighted numismatic coin without BYOK price guides
- **WHEN** an appraisal runs for a silver coin with non-zero melt value and no PCGS or Greysheet credentials configured
- **THEN** the system computes the live melt floor AND runs realized comp and multimodal AI checks rather than terminating at `SPOT_MELT`

#### Scenario: Certified PCGS coin with melt value
- **WHEN** an appraisal runs for a PCGS-certified coin with a valid cert number and PCGS token
- **THEN** the system records both the live melt value and the PCGS price guide value, and preserves any additional comp or AI context in the appraisal payload

### Requirement: Additional market and cert data providers
The system SHALL support workspace BYOK or public lookups for NGC/PMG/CACG/ANACS cert metadata, NumisMedia FMV, and realized sold marketplace comps alongside PCGS and Greysheet.

#### Scenario: NumisMedia FMV lookup for raw US coin
- **WHEN** an appraisal runs for an uncertified US coin with year, denomination, and estimated or cataloged grade
- **THEN** the system queries NumisMedia FMV (when enabled) and includes the matched grade FMV in the candidate valuation sources

#### Scenario: Realized sold comps aggregation
- **WHEN** an appraisal runs with marketplace comps enabled for an item
- **THEN** the system retrieves recent sold listings matching the item title, year, mint mark, and grade, filters statistical outliers, and records Low, Median, and High realized prices

### Requirement: Reconciled market valuation and confidence scoring
The system SHALL reconcile all collected source quotes into a primary `market_value_unit`, a `market_value_low` and `market_value_high` range, a `valuation_source`, and a `valuation_confidence` level (`HIGH`, `MEDIUM`, `LOW`).

#### Scenario: Verified cert and sold comps agree
- **WHEN** a third-party price guide (PCGS or Greysheet) and realized sold comps both return values within normal market spread
- **THEN** the system sets `valuation_confidence` to `HIGH`, marks `is_estimate` as `false`, and sets `market_value_low` and `market_value_high` from the observed spread

#### Scenario: AI-only valuation fallback
- **WHEN** no verified price guide or sold comps return a match and only multimodal AI produces an appraisal
- **THEN** the system sets `valuation_source` to `AI_ESTIMATE`, marks `is_estimate` as `true`, and sets `valuation_confidence` to `LOW` or `MEDIUM` based on photo availability

### Requirement: Full multi-source valuation audit trail
The system SHALL persist every source quote, reconciled range, confidence score, and itemized rationale in `ValuationHistory.raw_payload` for each completed appraisal.

#### Scenario: Viewing historical appraisal details
- **WHEN** an appraisal completes
- **THEN** a new `ValuationHistory` record is created containing the normalized per-source quotes, timestamps, errors/skips, and final reconciliation metadata

### Requirement: Graceful per-provider fault isolation
The system SHALL isolate external provider timeouts, rate limits, and HTTP errors per source so one failing provider never aborts the entire appraisal.

#### Scenario: External price guide times out
- **WHEN** Greysheet or NumisMedia times out or returns a 5xx error during an appraisal
- **THEN** the system logs the provider failure in the appraisal metadata and continues reconciling the remaining sources (e.g., melt floor, comps, AI)


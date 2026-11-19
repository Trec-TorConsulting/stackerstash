# Delta for multi-source-appraisal-engine

## ADDED Requirements

### Requirement: Grade- and Condition-Aware Source Weighting
The appraisal engine SHALL weight and prioritize pricing sources based on provenance, recency, and grade/condition match: cert-verified grading APIs (PCGS, NGC, PMG, PSA) > exact-grade sold marketplace comps > condition-adjusted price guides (Greysheet, Numista, TCGplayer, Scryfall, PriceCharting) > bullion dealer or Goldback exchange benchmarks > spot melt value.

#### Scenario: Precious-metal item never valued below melt
- **WHEN** a bullion, coin, or round item with `fine_troy_oz > 0` is appraised and external comps or guides return a value below `melt_value_unit`
- **THEN** the engine SHALL clamp `market_value_unit` to at least `melt_value_unit` and record `melt_floor_applied` in valuation drivers.

#### Scenario: Graded slab prioritizes cert-verified or exact-grade comps
- **WHEN** an item has `grading_service != NONE` and a `cert_number` or `grade`
- **THEN** the engine SHALL prefer cert-verified pricing or comps matching the exact grade over ungraded/raw comps.

### Requirement: Scheduled Background Re-Appraisal
The system SHALL support a periodic background task that identifies stale items (`valued_at` older than a configurable TTL, or precious-metal items whose spot price has drifted beyond a configurable percentage threshold) and re-appraises them in batches.

#### Scenario: Manual user value override is preserved
- **WHEN** an item has a user-locked or `USER`-provenance `market_value_unit`
- **THEN** the scheduled re-appraisal task SHALL skip overwriting `market_value_unit` while still updating `melt_value_unit` and reference metadata.

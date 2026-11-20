# Spec Delta: multi-source-appraisal-engine

## MODIFIED Requirements

### Requirement: Grade- and Condition-Aware Source Weighting
The appraisal engine SHALL weight and prioritize pricing sources based on provenance, recency, and grade/condition match: cert-verified grading APIs (PCGS, NGC, PMG, PSA) > blended real-world market comps (averaging verified sold sales and active asking listings) > exact-grade sold marketplace comps > condition-adjusted price guides (Greysheet, Numista, TCGplayer, Scryfall, PriceCharting) > active asking comps > multimodal AI appraisal > bullion dealer or Goldback exchange benchmarks > spot melt value.

#### Scenario: Precious-metal item never valued below melt
- **WHEN** a bullion, coin, or round item with `fine_troy_oz > 0` is appraised and external comps or guides return a value below `melt_value_unit`
- **THEN** the engine SHALL clamp `market_value_unit` to at least `melt_value_unit` and record `melt_floor_applied` in valuation drivers.

#### Scenario: Graded slab prioritizes cert-verified or exact-grade comps
- **WHEN** an item has `grading_service != NONE` and a `cert_number` or `grade`
- **THEN** the engine SHALL prefer cert-verified pricing or comps matching the exact grade over ungraded/raw comps.

#### Scenario: Blended real-world comps supersede unverified AI estimates
- **WHEN** an appraisal retrieves verified eBay comps with both sold and active listings and also runs an ungrounded AI appraisal
- **THEN** the engine SHALL prioritize the blended real-world comps value over the AI estimate as the primary market valuation

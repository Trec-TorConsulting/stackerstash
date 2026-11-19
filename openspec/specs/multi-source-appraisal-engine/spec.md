# multi-source-appraisal-engine Specification

## Purpose
Replaces the early-exit valuation waterfall with a concurrent multi-source appraisal engine that aggregates live melt floor, numismatic price guides, cert lookups, realized sold comps, and multimodal AI into a reconciled market range and audit trail.

## Requirements

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

### Requirement: Goldback Exchange Rate valuation benchmark
The system SHALL compute a Goldback Exchange Rate benchmark (`~1.95x–2.10x` live 24K gold melt value, reflecting Aurum manufacturing and official Goldback currency exchange parity) for recognized Goldback items, expose it in appraisal source breakdowns and drivers, and ground unverified AI estimates against the Goldback benchmark band when realized comps are absent.

#### Scenario: Appraise a 1/4 Goldback with live gold spot price
- **WHEN** `appraise_item` evaluates a `1/4 Goldback` (`0.000250 ozt` 24K gold) with a live gold melt value of `$0.96`
- **THEN** the appraisal records a `GOLDBACK_EXCHANGE` benchmark around `$1.87–$2.02` (`~2.0x` melt) and prevents unverified AI estimates from inflating the market value to unrealistic multiples (such as `$45.00`)

### Requirement: Trading card market pricing and cert providers
The system SHALL integrate trading card pricing and cert lookup providers—including Pokémon TCG API / TCGplayer market prices, Scryfall prices (for MTG), PriceCharting (when BYOK key is configured), and PSA/CGC/BGS cert verification—into the concurrent appraisal engine for `CARD` and card-slabbed `SLAB` items.

#### Scenario: Appraising a raw Pokémon card using Pokémon TCG API / TCGplayer market data
- **WHEN** an appraisal runs for a `CARD` item with `card_game="Pokémon"` and valid card name/number/set
- **THEN** the engine queries the Pokémon TCG / TCGplayer pricing source, records finish-matched (e.g., Normal vs. Holo vs. 1st Edition) low/market/high quotes, and skips numismatic-only providers (PCGS, Greysheet, NumisMedia, Numista, spot melt)

#### Scenario: Appraising a PSA-slabbed trading card with cert lookup
- **WHEN** an appraisal runs for a `SLAB` or `CARD` item with `grading_service="PSA"` and a `cert_number`
- **THEN** the engine queries PSA cert metadata (when configured) alongside eBay sold comps and PriceCharting/AI estimates, recording all candidate quotes in `ValuationHistory.raw_payload`

#### Scenario: Skipping bullion melt floor for trading cards
- **WHEN** an appraisal runs for any `CARD` item (`metal_type="NONE"`)
- **THEN** the engine omits `SPOT_MELT` from candidate valuation sources and anchors the appraisal on card price guides, realized comps, and AI estimates

### Requirement: PSA population and spec metadata extraction
The system SHALL extract `SpecID`, `TotalPopulation`, `PopulationHigher`, and label/qualifier attributes from PSA Public API cert lookup responses when `PSA_API_TOKEN` is configured, and cache them alongside the cert record.

#### Scenario: PSA cert lookup returns population data
- **WHEN** a user appraises or looks up a PSA-graded card with a valid `PSA_API_TOKEN`
- **THEN** the system stores and returns `psa_spec_id`, `total_population`, and `population_higher` in the valuation and cert metadata

### Requirement: PriceCharting multi-grade and all-card-type pricing
The system SHALL map PriceCharting API price fields across ungraded and graded tiers (including `PSA 7`, `PSA 8`, `PSA 9`, `PSA 10`, `BGS 9.5`, `BGS 10`, `CGC 10`, `SGC 10`, and `TAG 10`) for all trading card categories (TCG and Sports) when `PRICECHARTING_API_KEY` is configured.

#### Scenario: Graded card matches PriceCharting tier
- **WHEN** a card is graded `BGS 9.5` and PriceCharting returns a `bgs-9-5-price` (or equivalent graded field)
- **THEN** the system uses that tier's price as the primary PriceCharting valuation rather than falling back to ungraded

#### Scenario: Ungraded card uses loose price
- **WHEN** a card has no grading service or grade
- **THEN** the system uses PriceCharting's `loose-price` normalized to USD

### Requirement: Optional BYOK TCGplayer pricing provider
The system SHALL support optional BYOK `TCGPLAYER_CLIENT_ID` and `TCGPLAYER_CLIENT_SECRET` credentials using OAuth2 client-credentials flow (`/token`) to fetch Market, Low, Mid, High, and Buylist pricing from `api.tcgplayer.com`, and SHALL skip the API call without error when credentials are not configured.

#### Scenario: TCGplayer credentials configured
- **WHEN** both `TCGPLAYER_CLIENT_ID` and `TCGPLAYER_CLIENT_SECRET` are configured for the tenant
- **THEN** the appraisal engine exchanges them for a bearer token, queries TCGplayer pricing, and includes Market/Low/Mid/High comps in the appraisal result

#### Scenario: TCGplayer credentials not configured
- **WHEN** TCGplayer credentials are absent
- **THEN** the appraisal engine skips the TCGplayer API provider and relies on configured alternatives and deep-link comps

### Requirement: Optional BYOK Collectr pricing provider
The system SHALL support an optional BYOK `COLLECTR_API_KEY` credential for approved Collectr API partners to fetch card market valuations, and SHALL skip the provider gracefully when not configured.

#### Scenario: Collectr API key not configured
- **WHEN** `COLLECTR_API_KEY` is not set
- **THEN** the appraisal engine skips Collectr API calls without raising an error

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

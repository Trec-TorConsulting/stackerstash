# Spec Delta

## ADDED Requirements

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

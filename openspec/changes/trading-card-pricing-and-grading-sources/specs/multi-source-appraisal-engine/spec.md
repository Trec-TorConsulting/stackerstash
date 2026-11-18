# Spec Delta

## ADDED Requirements

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

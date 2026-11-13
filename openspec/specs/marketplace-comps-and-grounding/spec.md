# marketplace-comps-and-grounding Specification

## Purpose
Expands marketplace comparable pricing with eBay Browse API fallback, Gemini Search grounding, bullion dealer premium benchmarks, zero-key comp verification links, and clear BYOK settings guidance.

## Requirements

### Requirement: eBay Browse API fallback for active market asks
The system SHALL fall back to the eBay Browse API (`item_summary/search`) when the eBay Marketplace Insights sold-listings API returns 403 or 404, labeling the resulting range as `EBAY_ACTIVE_ASK` rather than realized sold comps.

#### Scenario: Standard eBay developer account without Marketplace Insights access
- **WHEN** an appraisal runs with valid `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` and the sold-listings endpoint returns 403
- **THEN** the system queries active eBay listings, trims extreme outliers, and records Low, Median, and High active ask prices under `EBAY_ACTIVE_ASK`

### Requirement: Zero-key comp verification links
The system SHALL generate pre-filled search URLs for eBay Sold & Completed, Heritage Auctions, GreatCollections, and Stack's Bowers Archive from item metadata and display them in the Valuation Breakdown UI without requiring API keys.

#### Scenario: Viewing comp links for an item with no BYOK keys
- **WHEN** a collector opens an item's Valuation Breakdown card
- **THEN** clickable "Verify Comps" links for eBay Sold, Heritage Auctions, GreatCollections, and Stack's Bowers open pre-filled searches for that item's year, mint mark, title, and grade

### Requirement: Gemini Search grounding for live market citations
The system SHALL support optional `google_search` tool grounding in Gemini AI appraisals so returned market ranges and drivers can reference live auction and dealer listings.

#### Scenario: Grounded AI appraisal with Gemini key
- **WHEN** AI appraisal runs with a configured Gemini API key and search grounding enabled
- **THEN** the appraisal payload includes grounded comp citations (titles/URLs when returned) in `ValuationHistory.raw_payload`

### Requirement: Bullion dealer premium benchmark
The system SHALL apply or surface typical dealer retail premium ranges for recognized bullion items (such as American Silver Eagles, Maples, Krugerrands, and standard bars/rounds) when spot melt is the primary anchor.

#### Scenario: Appraising a standard 1 oz Silver Eagle
- **WHEN** an appraisal runs for a bullion coin or bar with no numismatic guide override
- **THEN** the system includes typical dealer premium context in `valuation_drivers` alongside the live melt floor

### Requirement: Organized BYOK provider settings UX
The Settings UI SHALL group BYOK credentials into logical categories (AI Vision, Price Guides & Certs, Marketplaces & Catalogs) with concise descriptions of what each key unlocks.

#### Scenario: Configuring eBay or Numista keys in Settings
- **WHEN** a user opens the Settings & BYOK Vault page
- **THEN** eBay Client ID/Secret, Numista, NumisMedia, PCGS, Greysheet, Gemini, and Ollama fields are clearly grouped and labeled with setup hints

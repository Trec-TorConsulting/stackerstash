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
The system SHALL generate category-appropriate pre-filled search URLs without requiring API keys and display them in the Valuation Breakdown UI: eBay Sold & Completed, Heritage Auctions, GreatCollections, and Stack's Bowers Archive for numismatic/bullion items, and eBay Sold & Completed, TCGplayer, PriceCharting, and 130point for `CARD` and card-slabbed `SLAB` items.

#### Scenario: Viewing comp links for an item with no BYOK keys
- **WHEN** a collector opens a coin or bullion item's Valuation Breakdown card
- **THEN** clickable "Verify Comps" links for eBay Sold, Heritage Auctions, GreatCollections, and Stack's Bowers open pre-filled searches for that item's year, mint mark, title, and grade

#### Scenario: Viewing comp links for a trading or Pokémon card with no BYOK keys
- **WHEN** a collector opens a `CARD` or card-slabbed `SLAB` item's Valuation Breakdown card
- **THEN** clickable "Verify Comps" links for eBay Sold, TCGplayer, PriceCharting, and 130point open pre-filled searches using the card's title, set name, card number, grading service, and grade

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

### Requirement: Expanded trading card comp links
The system SHALL generate deep-link comparison URLs for trading cards covering `eBay Sold`, `TCGplayer`, `PriceCharting`, `130point`, `Beckett` (Price Guide / Marketplace), `Card Ladder`, and `Collectr`, plus grading-specific verification links for `PSA` (cert + pop/APR), `BGS`, `TAG` (DIG Report), `CGC`, and `SGC`.

#### Scenario: Trading card item shows expanded comp links
- **WHEN** a user views a trading card item detail page
- **THEN** the comps section includes clickable links for eBay Sold, TCGplayer, PriceCharting, 130point, Beckett, Card Ladder, and Collectr constructed from the card's title, set, card number, grading service, and grade

#### Scenario: TAG-graded card shows DIG Report link
- **WHEN** a trading card has `grading_service = "TAG"` and a non-empty `cert_number`
- **THEN** the verification link points to `https://my.taggrading.com/card/{cert}`

### Requirement: Comp Relevance Filtering and Outlier Trimming
Marketplace comp lookups (including eBay sold and active listings) SHALL filter out irrelevant listings (bulk lots, replicas/copies, empty boxes/slabs, and mismatched grades or card finishes) and apply IQR/median outlier trimming before computing `market_value_unit`, `market_value_low`, and `market_value_high`.

#### Scenario: Lot and replica listings are excluded from comps
- **WHEN** marketplace comps return listings containing keywords such as `lot of`, `bulk`, `replica`, `copy`, `reproduction`, or `empty box` for a single-item query
- **THEN** those listings SHALL be excluded before median and range calculation.

#### Scenario: Active listings are discounted when used as fallback
- **WHEN** sold comps are unavailable and active listings are used as a fallback
- **THEN** the engine SHALL apply a configurable ask-to-sold discount factor and mark `is_estimate = True` with reduced `valuation_confidence`.

### Requirement: Dual-stream eBay comps harvesting and real-world blending
The system SHALL query both realized sold listings (via eBay Marketplace Insights / Sold) and active market listings (via eBay Browse API) when eBay credentials are configured, calculate the median/trimmed mean of realized sold prices ($P_{\text{sold}}$) and the trimmed mean of active asking prices ($P_{\text{ask}}$), and synthesize a balanced real-world market value ($P_{\text{market}} = \frac{P_{\text{sold}} + P_{\text{ask}}}{2}$).

#### Scenario: Both sold comps and active asks available
- **WHEN** an appraisal runs for an item and eBay returns both realized sold sales and active asking listings
- **THEN** the system calculates the median of sold items and the mean of active asks, averages them together into a blended real-world comps valuation, and records both sample counts and ranges in the comps payload

#### Scenario: Only realized sold comps available
- **WHEN** eBay returns realized sold listings but active listings return no matching results
- **THEN** the system uses the trimmed median of realized sales as the comps valuation and indicates that active asks were unavailable

#### Scenario: Only active asking listings available
- **WHEN** eBay Marketplace Insights returns no sold records (or 403/404) but active listings are found
- **THEN** the system calculates the mean active asking price, applies a calibrated ask discount factor, and marks the result as active-ask grounded

### Requirement: Zero-key comps extraction with search grounding fallback
The system SHALL attempt lightweight zero-key public comps extraction when workspace eBay API credentials are not configured, and SHALL automatically fall back to Gemini Search Grounding to harvest sold sales and active market listings from live search citations without requiring private developer keys.

#### Scenario: Appraisal with unconfigured eBay keys falls back gracefully
- **WHEN** an appraisal runs for an item and workspace eBay credentials are not configured
- **THEN** the system attempts zero-key public extraction, falls back to Gemini Search Grounding if throttled or unavailable, and records the resulting sold and active asking quotes in `ValuationHistory.raw_payload["sources"]` with status `ZERO_KEY` or `SEARCH_GROUNDING`

#### Scenario: Grounded search prices structured into comps quote
- **WHEN** Gemini AI appraisal returns Google Search Grounding citations containing market prices for the item
- **THEN** the system parses the citations into structured high, low, and median market pricing quotes and feeds them into the comps reconciliation pipeline

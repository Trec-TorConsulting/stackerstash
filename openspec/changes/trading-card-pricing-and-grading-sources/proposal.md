# Proposal

## Why

The trading card section currently has minimal pricing and grading integration compared to coins—only basic PSA cert lookup, basic PriceCharting price lookup, and four comp links (`eBay Sold`, `TCGplayer`, `PriceCharting`, `130point`). Collectors need comprehensive market pricing, population/rarity context, and grading verification across all card types (Sports, Pokémon, MTG, Yu-Gi-Oh!, Lorcana, One Piece, Non-Sport) using the industry's primary grading and pricing platforms: PSA, Beckett (BGS), TAG Grading, PriceCharting, Card Ladder, TCGplayer, and Collectr.

## What Changes

- **PSA (`psacard.com`)**: Expand the existing `PSA_API_TOKEN` integration to capture `SpecID`, population counts (`TotalPopulation`, `PopulationHigher`), label/qualifier attributes, and surface a direct link to PSA Population Report & Auction Prices Realized.
- **PriceCharting (`pricecharting.com`)**: Expand the existing `PRICECHARTING_API_KEY` integration to normalize ungraded and graded price tiers (PSA 7–10, BGS 9.5/10, CGC 10, SGC 10, TAG 10) across all trading card categories (TCG and Sports) and cache results.
- **TCGplayer (`tcgplayer.com`)**: Add optional BYOK `TCGPLAYER_CLIENT_ID` / `TCGPLAYER_CLIENT_SECRET` OAuth2 client-credentials support for existing keyholders (Market, Low, Mid, High, and Buylist pricing), while keeping enhanced deep-link search for all users (since TCGplayer no longer issues new public API keys and prohibits scraping).
- **TAG Grading (`taggrading.com`)**: Add TAG DIG Report deep-linking (`https://my.taggrading.com/card/{cert}` / `https://tagd.co/{cert}`) and structured storage for TAG's 1000-point score and 4-category sub-grades (Centering, Corners, Edges, Surface) for front and back, since TAG has no public API.
- **Beckett (`beckett.com`)**: Add Beckett Online Price Guide / Marketplace deep-link search in comp links and structured BGS sub-grade support (Centering, Corners, Edges, Surface), since Beckett has no public API.
- **Card Ladder (`cardladder.com`)**: Add Card Ladder deep-link search in comp links for sports and TCG cards, since Card Ladder has no public API.
- **Collectr (`getcollectr.com`)**: Add optional BYOK `COLLECTR_API_KEY` provider support (gated behind partner/approved key configuration) plus Collectr deep-link/reference support.

## Capabilities

### New Capabilities
<!-- None; all changes extend existing cohesive capabilities. -->

### Modified Capabilities
- `multi-source-appraisal-engine`: Expand trading card provider orchestration, BYOK credentials (`TCGPLAYER_*`, `COLLECTR_API_KEY`), PSA population/spec extraction, and PriceCharting multi-grade/all-card-type pricing.
- `trading-card-specs-and-catalog`: Add structured grading sub-grades (BGS 10-pt and TAG 1000-pt/front-back), PSA population & `SpecID` metadata, and external catalog/source IDs.
- `marketplace-comps-and-grounding`: Add trading card comp links for Beckett, Card Ladder, TAG DIG Report, PSA Auction Prices/Pop Report, and Collectr.

## Impact

- **Backend**: `backend/apps/accounts/models.py` (new `ProviderCredential` choices + migration), `backend/apps/valuation/providers.py` (PSA pop fields, PriceCharting multi-grade, optional TCGplayer & Collectr providers), `backend/apps/valuation/services.py` (card appraisal orchestration), `backend/apps/catalog/models.py` / `specs` normalization.
- **Frontend**: `frontend/src/lib/compLinks.ts` (new card comp links), `frontend/src/pages/SettingsPage.tsx` (BYOK credential fields), `frontend/src/components/valuation/CardSpecsCard.tsx` (display TAG 1000-pt/sub-grades, BGS sub-grades, PSA pop).
- **Compliance**: Respects ToS for all 7 platforms—no unauthorized web scraping; uses official APIs where available (BYOK) and official deep-links where APIs are closed or restricted.

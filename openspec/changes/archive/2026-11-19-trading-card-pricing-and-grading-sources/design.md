# Design

## Context

See `proposal.md` for motivation. Currently, Stackers Stash has:
- `ProviderCredential` choices in `backend/apps/accounts/models.py` including `PSA_API_TOKEN` and `PRICECHARTING_API_KEY`.
- `CERT_VERIFICATION_URLS` in `backend/apps/valuation/providers.py` with `PSA`, `BGS`, `CGC`, `SGC`, and `TAG`.
- `buildCompLinks` in `frontend/src/lib/compLinks.ts` with 4 card comp links (`ebay-sold`, `tcgplayer`, `pricecharting`, `130point`).

A review of the 7 requested platforms shows two distinct integration tiers:
1. **Official APIs (BYOK)**:
   - **PSA** (`api.psacard.com/publicapi/cert/GetByCertNumber/{certNumber}`): Bearer token, free tier capped at 100 calls/day. Returns `SpecID`, `TotalPopulation`, `PopulationHigher`, label/qualifier, and card metadata.
   - **PriceCharting** (`pricecharting.com/api/product`): Paid Legendary/Retail tier (`?t=TOKEN`). Returns ungraded (`loose-price`) and graded tiers (`psa-10-price`, `bgs-9-5-price`, etc.) for both TCG and Sports cards.
   - **TCGplayer** (`api.tcgplayer.com`): OAuth2 client-credentials (`/token` -> `/pricing/product/{id}`). **No longer issues new public developer keys**, and scraping violates ToS. Support as optional BYOK for existing keyholders.
   - **Collectr** (`getcollectr.com/api`): Restricted partner API. Support as optional BYOK for approved partners.
2. **No Public API (Deep-Link Comps + Structured Metadata)**:
   - **TAG Grading** (`taggrading.com`): No public API; deterministic DIG Report URLs (`https://my.taggrading.com/card/{cert}`, `https://tagd.co/{cert}`) and 1000-pt score + front/back sub-grades.
   - **Beckett** (`beckett.com`): No public API for BGS cert lookup or Online Price Guide; cert lookup URL + Beckett search deep-link + BGS sub-grades.
   - **Card Ladder** (`cardladder.com`): No public API; deep-link search in `compLinks.ts`.

## Goals / Non-Goals

**Goals:**
- Maximize market pricing, population, and grading data for all trading card types while strictly respecting each platform's Terms of Service.
- Keep all new API integrations optional (BYOK) so users without paid/partner keys still get rich deep-link comps and cert verification.
- Cache all API responses in `CertCache` / `ValuationRecord` to minimize rate-limit impact (especially PSA's 100 calls/day free cap).

**Non-Goals:**
- Automated web scraping or headless browser crawling of TCGplayer, Beckett, Card Ladder, TAG, or Collectr.
- Bulk CSV database ingestion from PriceCharting (can be added later if needed; single-item REST API + caching is sufficient for on-demand appraisal).

## Decisions

1. **BYOK-only for restricted/paid APIs (`TCGPLAYER_CLIENT_ID`, `TCGPLAYER_CLIENT_SECRET`, `COLLECTR_API_KEY`)**:
   - *Rationale*: TCGplayer closed public key issuance and Collectr is partner-gated. Supporting them as optional `ProviderCredential` entries lets keyholders get live Market/Low/Mid/High/Buylist data without blocking standard users.
   - *Alternative considered*: Scraping public web pages — rejected due to ToS violations and fragility.
2. **Unified `sub_grades` & `tag_score` in `CollectionItem.attributes` JSONField**:
   - *Rationale*: Avoids rigid schema migrations for every grading company's scoring system while allowing `CardSpecsCard.tsx` to render BGS 10-pt sub-grades and TAG 1000-pt + front/back sub-grades cleanly.
3. **Deep-link comps in `frontend/src/lib/compLinks.ts`**:
   - *Rationale*: Zero backend overhead, instant availability for all users, and consistent with how coin comps (`Heritage`, `GreatCollections`, `Stack's Bowers`) are implemented.

## Risks / Trade-offs

- **PSA 100 calls/day free-tier limit** → Mitigation: Always check `lookup_cert_cache("PSA", cert)` before calling `api.psacard.com`, and cache `psa_spec_id`, `total_population`, and `population_higher`.
- **PriceCharting field naming differences across card categories** → Mitigation: Normalize graded tier keys (`bgs-9-5-price`, `psa-10-price`, `cgc-10-price`, etc.) with explicit fallback order and unit tests.
- **TCGplayer / Collectr token expiration** → Mitigation: Cache OAuth2 bearer token in memory/Redis with `expires_in` buffer and retry once on `401`.

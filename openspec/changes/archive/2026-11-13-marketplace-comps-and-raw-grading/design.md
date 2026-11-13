# Design

## Context

See `proposal.md` for motivation and `specs/` for behavioral requirements. The concurrent appraisal engine (`backend/apps/valuation/services.py`) and multimodal AI (`backend/apps/vision/services.py`) already support eBay Marketplace Insights sold comps and structured AI output, while `CollectionItem` already has an `estimated_grade` field (`CharField(max_length=32)`). This change extends those foundations without altering the existing job/worker architecture.

## Goals / Non-Goals

**Goals:**
- Ensure eBay integration works for standard developer accounts via Browse API fallback (`EBAY_ACTIVE_ASK`) while preferring Sold Comps (`COMPS`) when available.
- Provide zero-key comp verification links for every item regardless of BYOK configuration.
- Give raw/ungraded/unslabbed items a transparent, photo-backed Sheldon/PMG `estimated_grade`, grade range, surface rationale, and grading ROI indicator.
- Keep `SettingsPage.tsx` clean and self-explanatory as the number of BYOK providers grows.

**Non-Goals:**
- Scraping auction websites or bypassing marketplace authentication/anti-bot gates.
- Guaranteeing third-party grading outcomes (all estimated grades are explicitly badged as uncertified AI estimates).

## Decisions

### 1. eBay Two-Tier Lookup (`COMPS` -> `EBAY_ACTIVE_ASK`)
- **Choice**: In `lookup_ebay_sold_comps`, reuse the OAuth client-credentials token across two endpoints:
  1. Try `buy/marketplace_insights/v1_beta/item_sales/search` (scope `buy.marketplace.insights`).
  2. If token scope is rejected or the endpoint returns `403`/`404`, request an `api_scope` token and query `buy/browse/v1/item_summary/search?q=...&limit=15`, returning `{ "source": "EBAY_ACTIVE_ASK", "is_ask": True, "low", "median", "high", "count" }`.
- **Rationale**: Lets any user with a free eBay Developer key get real market data immediately while rewarding approved accounts with realized sold prices. Note: `EBAY_ACTIVE_ASK` is weighted below `COMPS` and `PCGS`/`GREYSHEET`/`NUMISMEDIA` in reconciliation so asking prices don't inflate market value over sold comps.

### 2. Zero-Key Comp URL Builder
- **Choice**: Implement `build_comp_links(item)` (shared helper on backend or pure utility in `frontend/src/lib/compLinks.ts`) constructing URL-encoded queries from `year`, `mint_mark`, `title`, `grading_service`, and `grade` for:
  - eBay Sold & Completed (`https://www.ebay.com/sch/i.html?_nkw=...&LH_Sold=1&LH_Complete=1`)
  - Heritage Auctions (`https://coins.ha.com/c/search/results.zx?term=...`)
  - GreatCollections (`https://www.greatcollections.com/search.php?q=...`)
  - Stack's Bowers Archive (`https://archive.stacksbowers.com/?q=...`)
- **Rationale**: Zero latency, zero API key requirement, and gives collectors instant verification at coin shows or desk reviews.

### 3. Gemini Search Grounding (`google_search` tool)
- **Choice**: In `estimate_item_value_with_ai`, optionally pass `"tools": [{"google_search": {}}]` when calling Gemini 2.5 Flash, and extract `groundingMetadata.groundingChunks` (title + URI) into `raw_payload["grounded_sources"]` when present. If the grounded call fails or returns non-JSON, fall back cleanly to standard ungrounded JSON mode.
- **Rationale**: Grounded search lets Gemini reference current dealer/auction prices while keeping JSON parsing resilient via fallback.

### 4. Raw Grade Estimation Fields & Grading ROI
- **Choice**: Add `estimated_grade_range` (`CharField(max_length=32)`), `estimated_grade_rationale` (`TextField`), and `grading_upside_usd` (`DecimalField(max_digits=10, decimal_places=2, null=True)`) to `CollectionItem`. Only run raw grade estimation when `grading_service == "NONE"` and `category in {"COIN", "PAPER", "FLIPPER", "ROUND"}`. Respect `specs_provenance["estimated_grade"] == "USER"` so manual overrides are never overwritten.
- **Rationale**: Keeps certified slabs untouched while giving raw-coin and raw-note collectors actionable condition and slabbing-ROI insights.

## Risks / Trade-offs

- **Active eBay Asks Can Skew High** → Label clearly as `EBAY_ACTIVE_ASK` (not Sold), trim top/bottom 10% outliers, and rank below realized comps and price guides.
- **Gemini `google_search` Tool + `responseMimeType: application/json` Compatibility** → Some Gemini API versions restrict combining `google_search` with strict JSON mime type; wrap in a try/fallback to standard JSON mode so appraisals never fail.
- **Subjectivity of Photo-Based Grading** → Always display `estimated_grade_range` alongside `estimated_grade`, badge as *Uncertified AI Estimate*, and explain lighting/photo-resolution limitations when confidence is low.


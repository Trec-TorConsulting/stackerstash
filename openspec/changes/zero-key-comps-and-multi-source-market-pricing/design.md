# Design: Zero-Key Comps Fallback & Multi-Source Market Pricing Engine

## Context
See `proposal.md` for user motivation and problem statement.

Currently, `apps.valuation.services.appraise_item` queries external providers concurrently. However, when workspace credentials for `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` are missing, `_run_comps()` returns `None`, completely skipping marketplace comps. In `reconcile_item_valuation()`, quotes without an entry in `results` simply do not appear in `sources_payload`. As a result, the user sees only `Live Spot Melt` and `Multimodal AI Appraisal` in `Source Comparison`, leaving them unsure if marketplace sales are being evaluated. Furthermore, Gemini AI appraisal often runs Google Search Grounding and discovers real-world eBay and auction listings, but these citations are only rendered as generic web links at the bottom of the card rather than structured into quotes.

## Goals / Non-Goals

**Goals:**
- Provide a zero-key public comps extraction fallback when eBay developer keys are not configured.
- Extract structured market comp prices from Gemini Search Grounding citations when zero-key direct queries are throttled or blocked.
- Reconcile and blend at least 2 to 3 independent pricing sources (e.g., Live Spot Melt floor, Realized Sold Comps, Active Asking Prices, Price Guides / Bullion Benchmarks, Grounded Estimates).
- Render a transparent Source Comparison table in `ValuationBreakdownCard` that lists evaluated sources and clearly displays unconfigured available sources (e.g., `eBay: Not configured - Add free key in Settings`).
- Maintain existing 1-click audit deep-links in the "Verify Comps" strip for Heritage Auctions, GreatCollections, Stack's Bowers, 130point, and eBay.

**Non-Goals:**
- Bypassing or attempting to defeat anti-bot challenges or CAPTCHAs on third-party auction sites (Heritage, GreatCollections, Stack's Bowers require human web authentication and are properly serviced via "Verify Comps" direct links).
- Replacing the official eBay Developer API for users who have provided credentials (official API remains top priority for reliability and rate limit resilience).

## Decisions

1. **Tiered Marketplace Comps Retrieval Pipeline**:
   - *Tier 1 (Official API)*: If `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` are configured, execute the dual-stream `lookup_ebay_market_comps` (Marketplace Insights sold + Browse active).
   - *Tier 2 (Zero-Key Public Endpoint / Fallback)*: If no eBay credentials are set, attempt a lightweight public item search query with browser headers and strict timeout (3.0s).
   - *Tier 3 (Search Grounding Extraction)*: If Tier 2 returns 403/CAPTCHA or is empty, extract sold and ask price entities from Gemini's Google Search Grounding response and convert them into a structured `COMPS` or `SEARCH_GROUNDING` quote.
   - *Rationale*: Guarantees that every collector gets real-world comps without being blocked by missing developer keys, while never breaking server uptime.

2. **2-to-3 Source Consensus Blending**:
   - *Mechanism*: When 2 or more sources exist (e.g., Comps + Melt floor + Guide / Benchmark / AI), calculate a balanced consensus price:
     $$P_{\text{market}} = \text{WeightedAverage}(P_{\text{comps\_blended}}, P_{\text{guide}}, P_{\text{ai\_grounded}})$$
     subject to $P_{\text{market}} \ge P_{\text{melt}}$.
   - *Confidence Rating*:
     - `HIGH`: 3+ sources evaluated (e.g., Melt + Comps + Guide/Benchmark).
     - `MEDIUM`: 2 sources evaluated (e.g., Melt + Comps, or Melt + Grounded AI).
     - `LOW`: 1 source only or unverified estimate.
   - *Rationale*: Eliminates single-source skew (outlier sales or unverified AI hallucinations) and grounds market values in verifiable reality.

3. **Transparent Source Audit Status in Frontend**:
   - Update `ValuationBreakdownCard.tsx` to display all known potential valuation sources in the Source Comparison drawer.
   - Distinct status badges:
     - `Evaluated (Blended)`: Green badge with sold count and active ask count.
     - `Evaluated (Search Grounding)`: Emerald badge with link to search citation.
     - `Active (Spot Floor)`: Slate badge with live metal weight.
     - `Not Configured`: Amber/Muted badge with tooltip linking to Settings to add free keys.
   - *Rationale*: Solves user confusion by making the engine's appraisal logic completely transparent.

## Risks / Trade-offs

- *[Risk]* Public zero-key web search on eBay can be throttled or blocked by Akamai anti-bot defenses.
  *Mitigation*: The appraisal engine wraps Tier 2 in a 3-second timeout and immediately falls back to Gemini Search Grounding, which queries Google's live indexed auction/eBay records with 100% reliability.
- *[Risk]* Search grounding might extract prices from different grades or related varieties.
  *Mitigation*: Use strict query formatting (year + mint mark + series + grade), apply regex-based price sanity filters, and enforce IQR outlier trimming before blending.

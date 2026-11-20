# Proposal: Zero-Key Comps Fallback and Multi-Source Market Pricing Engine

## Why
Collectors and stackers need real-world secondary market valuations backed by 2 to 3 independent pricing sources (such as realized sold comps, active asking supply, live metal melt floor, and price guides) so their portfolio values reflect actual market clearance prices rather than isolated guesses or ungrounded estimates. Currently, if a user has not configured private eBay Developer API credentials (`EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET`), the appraisal engine silently skips marketplace comps, leaving the item with only melt value or a single ungrounded AI estimate, while omitting eBay and auction sources from the Source Comparison table without explanation.

By introducing resilient zero-key comps extraction with automated fallback to search-grounded market comps, expanding multi-source synthesis across secondary market channels, and giving full visibility into evaluated vs. unconfigured sources in the UI, collectors get verified multi-source market pricing out of the box with zero required API keys.

## What Changes
- **Zero-Key Marketplace Comps with Search-Grounding Fallback**:
  - When workspace eBay credentials are not configured, the appraisal engine attempts lightweight zero-key public comps extraction (with robust request headers and timeout isolation).
  - If zero-key direct extraction is throttled or unavailable, the engine automatically falls back to Gemini Search Grounding to extract live sold sales and active listing prices directly from search citations.
  - When eBay credentials are provided, the system uses the official dual-stream eBay API (Marketplace Insights sold listings + Browse API active asks).
- **Multi-Source Market Valuation Blending**:
  - Synthesize a balanced market value ($P_{\text{market}}$) using at least 2 to 3 independent sources when available (e.g. Live Spot Melt floor, Realized Sold Comps, Active Asking Prices, Price Guides / Bullion Benchmarks, and Grounded AI estimates).
  - Prioritize realized clearance prices while using active asks and dealer benchmarks to establish supply boundaries, strictly preserving the metal melt floor ($P_{\text{market}} \ge P_{\text{melt}}$).
- **Transparent Source Comparison Table & UI Status**:
  - Update `ValuationBreakdownCard`'s Source Comparison drawer to display all evaluated sources and explicitly show status for unconfigured sources (e.g. `Evaluated (Blended)`, `Evaluated (Search Grounding)`, `Not Configured (Add keys in Settings)`).
  - Clarify the role of manual "Verify Comps" links (Heritage Auctions, GreatCollections, Stack's Bowers, 130point) as zero-key 1-click external auction audit links.
- **Appraisal Progress & Audit Transparency**:
  - Update `AppraisalProgressBanner` and `ValuationHistory.raw_payload` to document each evaluated and fallback source path for an audit-ready valuation trail.

## Capabilities

### Modified Capabilities
- `marketplace-comps-and-grounding`: Add zero-key comps retrieval with search-grounding fallback, structured grounding citation extraction, and resilient multi-source comp synthesis.
- `multi-source-appraisal-engine`: Implement resilient multi-source aggregation combining 2 to 3 independent market inputs into balanced market value and confidence scoring.
- `valuation-explainability-and-collectibility`: Surface all evaluated, grounded, and unconfigured sources in the Source Comparison drawer with clear status badges and multi-source driver breakdown.

## Impact
- **Backend**:
  - `backend/apps/valuation/providers.py`: Add zero-key public comps query helper, fallback logic to search grounding, and error-resilient price extraction.
  - `backend/apps/valuation/services.py`: Enhance `reconcile_item_valuation` and `appraise_item` to reconcile zero-key/grounded comps, mark source statuses, and compute 2-3 source blended pricing.
  - `backend/apps/vision/services.py`: Structure Gemini Google Search grounding outputs so live search pricing citations feed directly into valuation sources.
- **Frontend**:
  - `frontend/src/components/valuation/ValuationBreakdownCard.tsx`: Render comprehensive Source Comparison table with status badges (`BLENDED`, `GROUNDED`, `NOT CONFIGURED`, `LINK ONLY`) and multi-source breakdown.
  - `frontend/src/components/valuation/AppraisalProgressBanner.tsx`: Update step statuses to reflect fallback and multi-source completion.
- **Tests**:
  - Unit and integration tests in `backend/tests/test_valuation_appraisal.py`, `backend/tests/test_valuation_ebay_comps.py`, and `frontend/src/__tests__/valuation.test.tsx`.

# Proposal: Uplift Market Value Using Blended Sold & Active Asking Comps

## Why
Currently, the appraisal engine treats marketplace comps as a binary fallback: it either fetches realized sold listings OR active asking prices with an arbitrary 15% discount factor. Furthermore, active asking prices are deprioritized below ungrounded AI estimates, while sold transactions and active supply are never blended. 

In secondary markets (coins, paper currency, bullion, and trading cards), real-world market value is determined by the intersection of realized clearance prices (what buyers actually paid) and current asking prices (current market supply and replacement cost). Averaging realized sold comps with the mean active asking prices produces an accurate, real-world Market Value that eliminates speculative skew and gives collectors verified, audit-ready valuations.

## What Changes
- **Dual-Stream eBay Market Data Collection**:
  - Update eBay comps lookup to query both realized sold sales (via Marketplace Insights / Sold) and active listing summaries (via Browse API) in parallel, rather than falling back only when the sold endpoint fails.
- **Real-World Comps Blending Engine**:
  - Calculate trimmed mean / median for realized sold comps ($P_{\text{sold}}$) and mean / trimmed mean for active asking listings ($P_{\text{ask}}$).
  - Compute a balanced real-world market valuation by averaging realized sold comps with mean active asking prices ($P_{\text{market}} = \frac{P_{\text{sold}} + P_{\text{ask}}}{2}$), with robust fallbacks when only sold or only active listings exist.
- **Valuation Reconciliation Uplift**:
  - Prioritize the blended real-world comps value (`COMPS_BLENDED`) above unverified AI estimates and generic static catalogs in `reconcile_item_valuation`.
  - Maintain the precious-metal melt floor invariant ($P_{\text{market}} \ge P_{\text{melt}}$).
- **Explainability & Breakdown Transparency in UI**:
  - Display the dual-stream comps synthesis in `ValuationBreakdownCard` and key value drivers, explicitly showing the realized sold average, active asking mean, sample counts, and the resulting blended market value.
  - Enhance "Verify Comps" links to seamlessly audit both sold and active listings.

## Capabilities

### Modified Capabilities
- `marketplace-comps-and-grounding`: Add dual-stream sold and active asking listings harvesting and blended real-world comp calculation.
- `multi-source-appraisal-engine`: Uplift source reconciliation to prioritize blended real-world comps over unverified estimates and condition-adjust them.
- `valuation-explainability-and-collectibility`: Surface the blended comps formula, sample counts, and sold vs. asking comparison in valuation drivers and breakdown UI.

## Impact
- **Backend**:
  - `backend/apps/valuation/providers.py`: Update `lookup_ebay_sold_comps` (or introduce `lookup_ebay_market_comps`) to retrieve and aggregate both sold sales and active asking listings, returning sold metrics, active ask metrics, and the blended mean.
  - `backend/apps/valuation/services.py`: Update `_run_comps`, `sources_payload`, quote ranking, and driver generation to incorporate blended comps.
- **Frontend**:
  - `frontend/src/components/valuation/ValuationBreakdownCard.tsx`: Display the sold vs. active asking comparison table and blended market value breakdown.
- **Tests**:
  - Backend tests in `backend/apps/valuation/tests/` verifying blended calculations, outlier trimming, and quote reconciliation.
  - Frontend component tests in `frontend/src/__tests__/valuation.test.tsx`.

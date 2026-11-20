# Design: Uplift Market Value Using Blended Sold & Active Asking Comps

## Context
See `proposal.md` for motivation and background.

Currently:
- `backend/apps/valuation/providers.py` implements `lookup_ebay_sold_comps`, which treats eBay sold transactions and active asking listings as mutually exclusive fallbacks.
- When sold items exist, active market asking listings are ignored; when only active asking listings exist, an arbitrary 15% discount is applied and the quote is ranked below AI estimates.
- `services.py` reconciles market value by taking the highest-ranked quote from `quotes[0]`.

## Goals / Non-Goals

**Goals:**
- Concurrently harvest both realized sold listings and active asking listings from eBay when credentials are configured.
- Compute robust statistics for each stream:
  - Sold listings: sample count $N_{\text{sold}}$, price range $[L_{\text{sold}}, H_{\text{sold}}]$, and median price $P_{\text{sold}}$.
  - Active asking listings: sample count $N_{\text{ask}}$, price range $[L_{\text{ask}}, H_{\text{ask}}]$, and trimmed mean price $P_{\text{ask}}$.
- Calculate a synthesized real-world market value:
  $$P_{\text{market}} = \frac{P_{\text{sold}} + P_{\text{ask}}}{2}$$
  with fallback to $P_{\text{sold}}$ if active listings are absent, or $P_{\text{ask}} \times 0.85$ if sold transactions are unavailable.
- Uplift this blended market value in the reconciliation pipeline to supersede unverified AI estimates and static fixtures.
- Display transparent explainability in `ValuationBreakdownCard` and drivers, showing collectors both the sold clearance price and the active asking supply mean.

**Non-Goals:**
- Unsanctioned scraping of eBay (strictly uses official eBay Marketplace Insights and Browse REST APIs).
- Violating the bullion melt floor invariant ($P_{\text{market}} \ge P_{\text{melt}}$).

## Decisions

### Decision 1: Dual-Stream eBay Fetcher in `providers.py`
Refactor `lookup_ebay_sold_comps` (or introduce `lookup_ebay_market_comps`) to:
1. Request OAuth tokens for both `buy.marketplace.insights` and `browse` scopes.
2. Query `/buy/marketplace_insights/v1_beta/item_sales/search` for realized sold records.
3. Query `/buy/browse/v1/item_summary/search` for active asking records.
4. Filter out noisy listings (`_filter_comp_listings`: excludes "lot", "reprint", "copy", "box only", etc.) and apply 10% outlier trimming (`_trim_outliers`).
5. Return a unified dictionary:
   ```python
   {
       "source": "COMPS",
       "is_blended": True,
       "value": blended_val,
       "low": min(sold_low, ask_low),
       "high": max(sold_high, ask_high),
       "count": n_sold + n_ask,
       "sold": {"count": n_sold, "low": sold_low, "high": sold_high, "median": sold_med},
       "active_ask": {"count": n_ask, "low": ask_low, "high": ask_high, "mean": ask_mean},
   }
   ```

*Alternatives Considered:* Doing sold-only or active-only. Rejected because neither alone reflects both clearance price and current asking supply.

### Decision 2: Reconciliation & Priority Uplift in `services.py`
In `reconcile_item_valuation`:
1. When `comps_res` contains a blended value or sold median, append `(CollectionItem.ValuationSource.COMPS, blended_val)` with high priority.
2. Priority hierarchy:
   1. Official Cert API (PCGS Cert, PMG Cert, PSA Spec)
   2. Blended Real-World Comps (`COMPS` with sold + ask average)
   3. Condition-adjusted Price Guides (Greysheet, PriceCharting, TCGplayer)
   4. Multimodal AI Estimate
   5. Active Asking Comps (unblended)
   6. Bullion Dealer / Exchange Benchmarks
   7. Spot Melt Floor (strict lower bound)
3. Ensure confidence is marked `HIGH` when verified comps with $\ge 3$ samples are combined with a price guide or benchmark, and `MEDIUM` when verified comps are available alone.

### Decision 3: UI Explainability & Drivers
In `services.py` driver generation:
- Emit a clear driver:
  `"Real-world market comps: $Z.ZZ (blended average of N sold sales [median $X.XX] and M active asking listings [mean $Y.YY])."`
In `ValuationBreakdownCard.tsx`:
- Render the dual-stream breakdown under Sources:
  - Sold Comps row: count, low-high, median.
  - Active Asks row: count, low-high, mean.
  - Blended Real-World Market Value callout badge.

## Risks / Trade-offs

- **[Risk]** Marketplace Insights sold API permissions are restricted on some developer accounts (returning 403).
  → **Mitigation:** The dual-stream fetcher handles 403 on the sold endpoint gracefully; if sold data is inaccessible, it seamlessly uses the active asking listings with the calibrated discount factor and flags `is_blended: False`.
- **[Risk]** Active asking listings can have extreme high outliers (e.g. unrealistic seller ask).
  → **Mitigation:** Strict 10% upper and lower outlier trimming (`_trim_outliers`) is applied to active asking prices before calculating the mean.

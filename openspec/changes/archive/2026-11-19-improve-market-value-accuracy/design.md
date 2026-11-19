# Design: Improve Market Value Accuracy Across All Item Categories

## Context

`appraise_item` in `backend/apps/valuation/services.py` currently orchestrates spot prices, cert lookups, numismatic/card/bullion/Goldback providers, eBay comps, and AI fallback. However, all categories share three accuracy bottlenecks:
1. **Unfiltered / un-weighted comps**: `lookup_ebay_sold_comps` and `_lookup_ebay_browse_active` in `backend/apps/valuation/providers.py` can ingest bulk lots, replicas, or mismatched grades, and active-listing fallbacks are not consistently discounted.
2. **No melt floor or grade-tier blending**: Precious-metal items can occasionally be valued below `melt_value_unit` when noisy comps win, and raw vs. graded items lack consistent condition-multiplier blending.
3. **No scheduled staleness refresh**: Only `refresh_spot_prices` updates `SPOT_MELT` items; numismatic, paper, Goldback, and trading card items remain at their last manual appraisal indefinitely.

## Goals / Non-Goals

- **Goals**:
  - Improve market value accuracy across Bullion, Numismatic Coins, Paper Currency, Goldbacks, and Trading Cards using a hybrid approach (stronger free/no-key sources + optional API-keyed providers).
  - Enforce a precious-metal melt floor (`market_value_unit >= melt_value_unit`).
  - Add scheduled background re-appraisal for stale items while respecting `USER` manual value locks.
  - Surface valuation freshness (`valued_at`) and manual lock controls in the UI.
- **Non-Goals**:
  - Requiring paid API subscriptions for baseline functionality (all paid providers remain optional workspace credentials).
  - Replacing existing `ValuationHistory` schema.

## Decisions

1. **Source Priority & Blending**:
   - Rank candidates in `appraise_item`: `(1) Cert-verified API (PCGS/NGC/PMG/PSA) -> (2) Exact-grade/finish sold comps (trimmed median) -> (3) Condition-adjusted price guide (Greysheet, Numista, TCGplayer, Scryfall, PriceCharting) -> (4) Bullion dealer / Goldback benchmark -> (5) Discounted active comps -> (6) AI estimate / Spot melt`.
   - Always clamp `final_val >= melt_value_unit` when `fine_troy_oz > 0` and `metal_type != NONE`.
2. **Comp Filtering & Outlier Trimming**:
   - Add a shared `_filter_comp_listings(listings, item)` helper in `providers.py` to exclude titles matching lot/bulk/replica/empty-box patterns and grade/finish mismatches, then apply IQR trimming (`_trim_outliers`) before computing median, low, and high.
   - Apply a configurable ask-to-sold discount (default `0.85`) when falling back to active listings.
3. **Scheduled Stale Re-Appraisal**:
   - Add `reappraise_stale_items` in `backend/apps/valuation/tasks.py` (configurable `VALUATION_STALE_DAYS`, default 7 days, batch size limit) that skips items with `specs_provenance.get("market_value_unit") == "USER"`.
4. **Freshness & Lock UX**:
   - Expose `is_stale` / `valued_at` age and `market_value_locked` in item serializers and render a freshness badge + re-appraise / lock toggle in `ValuationBreakdownCard.tsx`, `ItemDetailPage.tsx`, and `CollectionPage.tsx`.

# Proposal: Improve Market Value Accuracy Across All Item Categories

## Why

Market values in Stackers Stash can drift or become inaccurate across all item categories (bullion/melt, numismatic coins, paper currency, Goldbacks, and trading cards) because:
1. **Noisy or un-weighted comps**: Marketplace comps can include mismatched grades, lots/bulk listings, or un-trimmed outliers, and active listings can skew estimates when sold comps are sparse.
2. **Grade & condition gaps**: Raw items and graded slabs do not consistently apply grade-specific price-guide multipliers or cert-verified population/price data.
3. **Stale valuations**: Item `market_value_unit` only updates on manual appraisal or spot-price melt fallback, leaving numismatic, currency, and card premiums stale over time.
4. **Limited hybrid source coverage**: Free/no-key sources (Numista, Scryfall, Pokémon TCG, Goldback, filtered eBay comps) and optional paid/API-keyed sources (Greysheet, PCGS, eBay Browse/Marketplace Insights, TCGplayer, PriceCharting) are not uniformly prioritized by confidence and recency.

## What Changes

- **Grade- & Condition-Aware Source Weighting**: Rank and blend valuation sources by reliability, recency, and grade/condition match (cert-verified APIs > exact-grade sold comps > condition-adjusted guides > bullion dealer/exchange benchmarks > spot melt floor), and enforce a precious-metal melt floor where applicable.
- **Comp Filtering & Outlier Trimming**: Filter eBay/marketplace comps by title relevance (excluding lots, replicas, and mismatched grades/variants) and apply IQR/median outlier trimming before computing `market_value_unit`, `market_value_low`, and `market_value_high`.
- **Hybrid Free + Optional Paid Provider Enhancements**: Strengthen free/no-key lookups across all 5 categories while cleanly supporting optional workspace-configured API keys for higher-precision pricing.
- **Scheduled Background Re-Appraisal**: Add a periodic background re-appraisal job for stale items (configurable TTL and spot-drift threshold) that respects `USER` manual value locks/overrides.
- **Freshness & Override UX**: Display valuation freshness (`valued_at` age / stale indicator) and source confidence in item detail and collection views, with one-click re-appraise and manual value lock controls.

## Capabilities

### New Capabilities
<!-- None; all changes extend existing valuation and appraisal capabilities. -->

### Modified Capabilities
- `multi-source-appraisal-engine`: Add grade/condition-aware source weighting, precious-metal melt-floor enforcement, and scheduled background re-appraisal for stale items.
- `marketplace-comps-and-grounding`: Add comp relevance filtering (lot/replica/grade-mismatch exclusion) and IQR/median outlier trimming for market value ranges.
- `valuation-explainability-and-collectibility`: Surface valuation freshness/staleness indicators and manual value lock/override state in the UI.

## Impact

- **Backend**: `backend/apps/valuation/services.py`, `backend/apps/valuation/providers.py`, `backend/apps/valuation/tasks.py`, `backend/apps/valuation/api.py`, `backend/apps/valuation/models.py`
- **Frontend**: `frontend/src/pages/ItemDetailPage.tsx`, `frontend/src/pages/CollectionPage.tsx`, `frontend/src/components/valuation/ValuationBreakdownCard.tsx`
- **Tests**: `backend/tests/test_providers.py`, `backend/tests/test_valuation_and_vision.py`, `backend/tests/test_comprehensive_appraisal.py`, `frontend/src/__tests__/valuation.test.tsx`

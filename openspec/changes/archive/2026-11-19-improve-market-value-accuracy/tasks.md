# Tasks: Improve Market Value Accuracy

## 1. Backend Comp Filtering & Source Weighting
- [x] 1.1 Add `_filter_comp_listings` in `backend/apps/valuation/providers.py` to exclude bulk lots, replicas/copies, empty boxes/slabs, and grade/finish mismatches before `_trim_outliers`.
- [x] 1.2 Apply configurable ask-to-sold discount (default `0.85`) and reduced confidence when `_lookup_ebay_browse_active` is used as a fallback for sold comps.
- [x] 1.3 Update `appraise_item` in `backend/apps/valuation/services.py` to rank/weight sources by provenance, recency, and grade/condition match, and enforce `market_value_unit >= melt_value_unit` for precious-metal items.

## 2. Scheduled Background Re-Appraisal
- [x] 2.1 Add `reappraise_stale_items` task in `backend/apps/valuation/tasks.py` with configurable `VALUATION_STALE_DAYS` (default 7) and batch limit.
- [x] 2.2 Ensure `reappraise_stale_items` skips overwriting `market_value_unit` when `specs_provenance.get("market_value_unit") == "USER"` while still refreshing `melt_value_unit`.
- [x] 2.3 Add management command or scheduler hook to trigger `reappraise_stale_items` periodically.

## 3. Frontend Freshness & Manual Lock UX
- [x] 3.1 Display valuation freshness (`valued_at` age and stale badge) in `ValuationBreakdownCard.tsx`, `ItemDetailPage.tsx`, and `CollectionPage.tsx`.
- [x] 3.2 Add one-click re-appraise and manual value lock/override toggle on `ItemDetailPage.tsx`.

## 4. Verification
- [x] 4.1 Add unit tests in `backend/tests/test_providers.py` and `backend/tests/test_valuation_and_vision.py` for comp filtering, melt-floor clamping, active-listing discount, and `USER` override preservation.
- [x] 4.2 Add frontend tests in `frontend/src/__tests__/valuation.test.tsx` for stale-valuation indicator and manual lock toggle.

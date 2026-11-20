# Tasks: Uplift Market Value Using Blended Sold & Active Asking Comps

## 1. Dual-Stream eBay Comps Provider Implementation

- [x] 1.1 Update `lookup_ebay_sold_comps` (or implement `lookup_ebay_market_comps`) in `backend/apps/valuation/providers.py` to query both realized sold listings and active asking listings in parallel, compute sold median and active asking mean, and calculate the blended real-world market value; verify with unit tests in `backend/apps/valuation/tests/test_ebay_comps.py`.
- [x] 1.2 Implement graceful fallback handling in `providers.py` when only sold sales or only active asking listings are returned, and verify with unit tests covering 403/404 sold endpoint edge cases.

## 2. Appraisal Engine Reconciliation and Priority Uplift

- [x] 2.1 Update `reconcile_item_valuation` in `backend/apps/valuation/services.py` to elevate blended real-world comps above unverified AI estimates and static catalogs in the quote hierarchy, and verify with tests in `backend/apps/valuation/tests/test_appraisal.py`.
- [x] 2.2 Enhance valuation driver generation in `services.py` to record itemized breakdown text detailing the realized sold average, active asking mean, sample counts, and blended calculation, and verify with pytest.

## 3. Frontend Valuation Breakdown and Comps Verification UI

- [x] 3.1 Update `frontend/src/components/valuation/ValuationBreakdownCard.tsx` to render the dual-stream comps breakdown (Sold Comps vs. Active Asks and Blended Value badge), and verify with tests in `frontend/src/__tests__/valuation.test.tsx`.
- [x] 3.2 Update `frontend/src/lib/compLinks.ts` to ensure Verify Comps deep-links cover both sold transactions and active listings, and verify with tests in `frontend/src/__tests__/valuation.test.tsx`.

## 4. End-to-End Verification

- [x] 4.1 Run backend pytest suite (`pytest backend/`) and frontend test suite (`npm run test:run`) to ensure zero regressions in valuation and comps calculations.

## Workflow follow-up

- Review artifacts with the user before applying.
- Apply the change via OpenSpec apply workflow (`/opsx-apply`).

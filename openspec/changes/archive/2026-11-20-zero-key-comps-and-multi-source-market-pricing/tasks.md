# Tasks

## 1. Zero-Key & Search Grounding Comps Extraction

- [x] 1.1 Implement zero-key public comps query helper in `backend/apps/valuation/providers.py` with browser headers, strict timeout, and graceful 403/block handling; verify with unit tests in `backend/tests/test_valuation_ebay_comps.py`.
- [x] 1.2 Implement extraction of structured sold and asking price quotes from Gemini Google Search Grounding citations in `backend/apps/vision/services.py`; verify with unit tests in `backend/tests/test_ai_appraisal.py`.
- [x] 1.3 Update `backend/apps/valuation/services.py` (`_run_comps`) to orchestrate Tier 1 (Official eBay API) -> Tier 2 (Zero-Key Public Endpoint) -> Tier 3 (Search Grounding Extraction); verify fallback cascading in `backend/tests/test_valuation_appraisal.py`.

## 2. Multi-Source Consensus Blending Engine

- [x] 2.1 Update `reconcile_item_valuation` in `backend/apps/valuation/services.py` to synthesize a balanced consensus market value combining 2 to 3 independent sources (Melt floor, Realized Sold Comps, Active Asking Prices, Price Guides, and Grounded AI estimates); verify with unit tests in `backend/tests/test_valuation_appraisal.py`.
- [x] 2.2 Update confidence scoring and valuation drivers in `reconcile_item_valuation` to reflect 2-to-3 source consensus and explicit sample counts; verify with tests in `backend/tests/test_valuation_appraisal.py`.

## 3. Frontend Transparency & Source Comparison UI

- [x] 3.1 Update `frontend/src/components/valuation/ValuationBreakdownCard.tsx` to display evaluated quotes alongside unconfigured sources with descriptive status badges (`Blended`, `Search Grounding`, `Not Configured`); verify rendering in `frontend/src/__tests__/valuation.test.tsx`.
- [x] 3.2 Update `frontend/src/components/valuation/AppraisalProgressBanner.tsx` to reflect multi-source appraisal steps and fallback states; verify with Vitest in `frontend/src/__tests__/valuation.test.tsx`.
- [x] 3.3 Run comprehensive frontend test suite and backend test suite with `npm test` and `pytest backend/tests/test_valuation_appraisal.py`; verify all tests pass without errors.

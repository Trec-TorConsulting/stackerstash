# Tasks

## 1. Raw Grade Schema & API Exposure

- [x] 1.1 Add `estimated_grade_range`, `estimated_grade_rationale`, and `grading_upside_usd` to `CollectionItem` in `backend/apps/catalog/models.py`, generate/apply Django migrations, and verify `python manage.py check` passes.
- [x] 1.2 Expose `estimated_grade_range`, `estimated_grade_rationale`, and `grading_upside_usd` in `ItemOut`, `ItemPatch`, and `_item_to_out` in `backend/apps/catalog/api.py`, and record `"USER"` in `specs_provenance["estimated_grade"]` when `estimated_grade` is manually patched; verify with catalog tests (`pytest`).

## 2. eBay Browse Fallback, Bullion Benchmarks & Grounded AI

- [x] 2.1 Update `lookup_ebay_sold_comps` in `backend/apps/valuation/providers.py` to fall back to the eBay Browse API (`EBAY_ACTIVE_ASK`) on 403/404, add `lookup_bullion_dealer_benchmark` for standard bullion items, and verify both with mocked `httpx` unit tests (`pytest`).
- [x] 2.2 Update `estimate_item_value_with_ai` in `backend/apps/vision/services.py` to: (a) support optional Gemini `google_search` grounding with JSON-mode fallback, and (b) return `estimated_grade`, `estimated_grade_range`, `estimated_grade_rationale`, and `grading_upside_usd` for raw gradeable items (`grading_service == "NONE"`); verify with unit tests covering raw vs. slabbed items and grounded/ungrounded responses.
- [x] 2.3 Wire `EBAY_ACTIVE_ASK`, bullion benchmark drivers, grounded citations, and raw grade enrichment (preserving `"USER"` `estimated_grade`) into `appraise_item` in `backend/apps/valuation/services.py`, and verify with integration tests (`pytest`).

## 3. Modern Collector UI: Comp Links, Estimated Grade & Settings

- [x] 3.1 Create `frontend/src/lib/compLinks.ts` to build pre-filled comp search URLs (eBay Sold, Heritage Auctions, GreatCollections, Stack's Bowers) and render the **Verify Comps** strip + `EBAY_ACTIVE_ASK` labeling in `ValuationBreakdownCard.tsx`.
- [x] 3.2 Build `EstimatedGradeCard.tsx` under `frontend/src/components/valuation/` (displaying `estimated_grade`, `estimated_grade_range`, `estimated_grade_rationale`, `grading_upside_usd` ROI badge, uncertified disclaimer, and inline grade override) and integrate it into `ItemDetailPage.tsx` for raw gradeable items.
- [x] 3.3 Group BYOK provider credentials in `frontend/src/pages/SettingsPage.tsx` into clear categories (*AI Vision*, *Price Guides & Certs*, *Marketplaces & Catalogs*) with concise descriptions, and add Vitest tests for `EstimatedGradeCard`, `compLinks`, and `SettingsPage` (`npm test`).

## 4. Documentation & End-to-End Verification

- [x] 4.1 Update `docs/USER_GUIDE.md` to document eBay Sold/Active Ask comps, zero-key comp verification links, and Raw Estimated Grade & Grading ROI.
- [x] 4.2 Run full backend test suite (`pytest`), frontend test suite (`npm test`), and production build (`npm run build`) to confirm end-to-end readiness.


# Proposal

## Why

Collectors need real-world marketplace comparables (even without enterprise eBay partner credentials) and an honest, photo-backed **Estimated Grade** for raw, ungraded, or unslabbed coins and banknotes so they know what their items actually trade for today and whether third-party certification (PCGS/NGC/PMG/CACG) is financially worthwhile. Adding eBay Browse API fallback, Gemini Search grounding, bullion dealer benchmarks, zero-key comp verification links, and raw-item grade estimation completes the end-to-end collector valuation experience.

## What Changes

- **eBay Browse API Fallback & BYOK Settings UX**: Update `lookup_ebay_sold_comps` in `backend/apps/valuation/providers.py` to fall back to the eBay Browse API (`item_summary/search` active listings) when the Marketplace Insights sold-listings API returns `403`/`404`, clearly tagging the quote as `EBAY_ACTIVE_ASK` vs. `COMPS` (Sold), and organize `SettingsPage.tsx` BYOK inputs with clear provider descriptions and setup hints.
- **Zero-Key One-Click Comp Links**: Generate pre-filled comp research URLs (eBay Sold & Completed, Heritage Auctions, GreatCollections, Stack's Bowers Archive) on the backend/frontend and render them in `ValuationBreakdownCard.tsx` so every item has instant comp verification even with zero API keys.
- **Gemini Search Grounding & Bullion Premium Benchmarks**: Enable optional Gemini `google_search` tool grounding during AI appraisal to cite live dealer/auction comps, and add bullion dealer premium benchmarks for standard bullion items (e.g., ASEs, Maples, Krugerrands, generic rounds/bars).
- **Raw / Ungraded Item Grade Estimation & Grading ROI**: Upgrade `estimate_item_value_with_ai` and `CollectionItem` to estimate a Sheldon/PMG grade (`estimated_grade`, `estimated_grade_range`, `estimated_grade_rationale`, `grading_upside_usd`) for raw/unslabbed items (`grading_service == "NONE"`), and display an **Estimated Grade & Grading ROI** card on `ItemDetailPage.tsx` clearly badged as an uncertified estimate.

## Capabilities

### New Capabilities
- `marketplace-comps-and-grounding`: Multi-tier marketplace comparables combining eBay Sold Comps, eBay Browse Active Ask fallback, Gemini Search grounding, bullion dealer premium benchmarks, zero-key comp verification links, and organized BYOK settings UX.
- `raw-item-grade-estimation`: Photo-backed Sheldon/PMG grade estimation, grade range, surface/wear rationale, and third-party grading ROI analysis for raw, ungraded, and unslabbed items.

### Modified Capabilities
- (None — existing specs require no requirement modifications.)

## Impact

- **Backend**: `backend/apps/catalog/models.py` & `api.py` (`estimated_grade_range`, `estimated_grade_rationale`, `grading_upside_usd`), `backend/apps/valuation/providers.py` (eBay Browse fallback, comp link builder, bullion premium helper), `backend/apps/valuation/services.py`, `backend/apps/vision/services.py` (raw grade estimation + Gemini `google_search` grounding), plus migrations and tests.
- **Frontend**: `frontend/src/components/valuation/ValuationBreakdownCard.tsx` (Verify Comps quick links + Active Ask vs. Sold badge), new `EstimatedGradeCard.tsx` on `ItemDetailPage.tsx`, `frontend/src/pages/SettingsPage.tsx` (grouped BYOK provider cards with setup hints), and `frontend/src/lib/api.ts`.


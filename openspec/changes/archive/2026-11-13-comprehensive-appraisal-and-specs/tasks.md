# Tasks

## 1. Data Model, Migrations & BYOK Providers

- [x] 1.1 Extend `CollectionItem` in `backend/apps/catalog/models.py` with numismatic spec fields (`mint_mark`, `mintage`, `variety`, `composition`, `gross_weight_grams`, `diameter_mm`, `thickness_mm`, `edge_type`, `designer`, `catalog_numbers`, `specs_provenance`) and valuation explainability fields (`market_value_low`, `market_value_high`, `valuation_confidence`, `collectibility_tier`, `hold_outlook`, `valuation_drivers`), and generate/apply Django migrations (`python manage.py makemigrations && python manage.py migrate`).
- [x] 1.2 Add `AppraisalJob` model in `backend/apps/valuation/models.py` (status, steps JSON, error_message, timestamps) and `NUMISTA_KEY`, `NUMISMEDIA_KEY`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` choices to `ProviderCredential.Provider` in `backend/apps/accounts/models.py`, then generate/apply migrations and verify `python manage.py check` passes.
- [x] 1.3 Expose the new spec and explainability fields in `ItemOut`, `ItemIn`/`ItemPatchIn`, and `_item_to_out` in `backend/apps/catalog/api.py`, and verify with API schema/CRUD tests (`pytest` on catalog tests).

## 2. Multi-Source Providers & Multimodal AI Appraisal

- [x] 2.1 Add provider clients in `backend/apps/valuation/providers.py` for NumisMedia FMV, Numista catalog/spec lookup, NGC/PMG/CACG/ANACS cert metadata enrichment, and eBay sold comps (with outlier trimming and 10s timeouts), and verify each provider with mocked `httpx` unit tests.
- [x] 2.2 Upgrade `estimate_item_value_with_ai` in `backend/apps/vision/services.py` to attach up to 3 item photos (`OBVERSE`, `REVERSE`, `SLAB`) for Gemini and Ollama vision models and return structured `low_usd`, `mid_usd`, `high_usd`, `valuation_drivers`, `collectibility_tier`, `hold_outlook`, and `inferred_specs`, with unit tests covering both photo-backed and text-only fallbacks.

## 3. Parallel Appraisal Engine & Progressive Job API

- [x] 3.1 Replace the early-exit waterfall in `backend/apps/valuation/services.py` with a concurrent `ThreadPoolExecutor` pipeline that always computes melt floor, runs all available providers + AI in parallel, enforces the melt-floor invariant (`max(numismatic, melt)`), reconciles confidence (`HIGH`/`MEDIUM`/`LOW`) and Low/Mid/High range, preserves user-edited specs (`specs_provenance`), and persists the full per-source payload in `ValuationHistory.raw_payload`.
- [x] 3.2 Implement `AppraisalJob` lifecycle orchestration (idempotent active-job deduplication, daemon-thread execution, `?sync=true` option for tests) and update `POST /valuation/items/{id}/appraise` plus add `GET /valuation/jobs/{job_id}` in `backend/apps/valuation/api.py`.
- [x] 3.3 Write backend integration tests verifying: bullion coin without BYOK still runs AI/comps, melt-floor invariant holds when spot spikes, provider timeout isolation works, user-edited specs are preserved, and double-click deduplication returns the active job (`pytest`).

## 4. Modern Collector UI ("Why It's Valued Here", Collectibility & Specs)

- [x] 4.1 Update `frontend/src/lib/api.ts` types (`CollectionItem`, `AppraisalJob`, `ValuationSourceQuote`) and add `getAppraisalJob(jobId)` and `getItemValuations(itemId)` client helpers.
- [x] 4.2 Build `AppraisalProgressBanner.tsx`, `ValuationBreakdownCard.tsx` (Market/Melt/Premium % stacked bar, Low–Mid–High range bar, Confidence pill, "Why It's Valued Here" drivers, Source Comparison table), `CollectibilityThesisCard.tsx` (Tier badge, Hold Outlook, grading/liquidity guidance), and `NumismaticSpecsCard.tsx` (2-column spec grid with provenance tags and inline edit support) under `frontend/src/components/valuation/`.
- [x] 4.3 Integrate the new components and job-polling hook into `frontend/src/pages/ItemDetailPage.tsx`, and verify component rendering, progressive polling states, and inline spec editing with Vitest (`npm test`).

## 5. PWA Offline Coin-Show Cache & Documentation

- [x] 5.1 Configure Workbox `runtimeCaching` in `frontend/vite.config.ts` (`NetworkFirst` for item/valuation APIs, `CacheFirst` for `/media/*` photos) and add `frontend/src/lib/offlineCache.ts` (IndexedDB storage for appraised items, specs, and breakdown) wired into `ItemDetailPage.tsx` with an offline indicator and disabled "Appraise Now" guard when offline.
- [x] 5.2 Add Vitest tests for offline cache hydration/fallback and update `docs/USER_GUIDE.md` to document the multi-source appraisal engine, "Why It's Valued Here" breakdown, numismatic specs, and offline coin-show mode.
- [x] 5.3 Run full backend test suite (`pytest`), frontend test suite (`npm test`), and production build (`npm run build`) to confirm end-to-end readiness.


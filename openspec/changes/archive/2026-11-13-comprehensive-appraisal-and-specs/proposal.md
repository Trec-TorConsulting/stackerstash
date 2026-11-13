# Proposal

## Why

Stackers Stash currently runs a short-circuiting valuation waterfall in `appraise_item` that stops at the first non-empty source—meaning any bullion-weighted coin without PCGS or Greysheet BYOK credentials stops at `SPOT_MELT` and never evaluates numismatic value, market comps, or AI photo analysis—and `ItemDetailPage` displays only a single market number without explaining *why* an item is worth that amount, what its numismatic specifications are, or whether it is a bullion hold or a scarce collectible. Upgrading to a parallel, multi-source appraisal engine with structured coin specs, transparent valuation explainability, and PWA-first progressive/offline support makes Stackers Stash the single source of truth for collectors to know, track, and understand the real value of their collections.

## What Changes

- **Parallel Multi-Source Appraisal Engine**: Replace the early-exit waterfall in `backend/apps/valuation/services.py` with a non-short-circuiting, concurrent appraisal pipeline that always computes live melt value *and* evaluates all available numismatic/market sources (PCGS, NGC/PMG/CACG/ANACS cert enrichment, Greysheet, NumisMedia FMV, realized sold comps, and multimodal AI appraisal), recording every source quote, confidence score, and Low/Mid/High range in `ValuationHistory`.
- **Numismatic Specs Enrichment**: Extend `CollectionItem` and API schemas with structured numismatic and physical specifications (mint mark, mintage, variety/VAM/error, alloy/composition, gross weight, diameter, thickness, edge, catalog references such as KM#/PCGS#/Red Book, and designer), auto-populated from Numista/PCGS/AI during appraisal and editable by the collector.
- **Multimodal AI Appraisal & Collectibility Assessment**: Upgrade `estimate_item_value_with_ai` in `backend/apps/vision/services.py` to analyze uploaded obverse/reverse/slab photos alongside metadata, returning a Low/Fair/High USD range, itemized `valuation_drivers`, `collectibility_tier` (`BULLION`, `SEMI_NUMISMATIC`, `KEY_DATE_COLLECTIBLE`, `NUMISMATIC`), and an actionable `hold_outlook` (including raw-to-graded upside where relevant).
- **"Why It's Valued Here" & Specs UI**: Redesign the valuation and details experience on `ItemDetailPage.tsx` with modern, clean cards for **Valuation Breakdown** (melt vs. collector premium % bar, Low/Mid/High range, source confidence badge, itemized value drivers, and source comparison), **Collectibility & Hold Thesis**, and **Numismatic Specs**.
- **PWA Progressive Appraisal & Offline Coin-Show Cache**: Add non-blocking async/progressive appraisal job tracking (`POST /valuation/items/{id}/appraise` returning immediate melt refresh + job status polling) and offline-first IndexedDB/Service Worker caching of the latest appraisal breakdown, specs, and photos so collectors have full valuation context at coin shows and local coin shops even without connectivity.

## Capabilities

### New Capabilities
- `multi-source-appraisal-engine`: Concurrent multi-source valuation pipeline aggregating live spot melt, third-party cert/price guides (PCGS, Greysheet, NumisMedia, NGC/PMG/CACG/ANACS), realized sold comps, and multimodal AI into a reconciled market range, confidence score, and full `ValuationHistory` audit trail.
- `numismatic-specs-enrichment`: Structured numismatic and physical specification storage, automatic lookup/enrichment (Numista, PCGS, AI), and manual editing for coins, bullion, and currency.
- `valuation-explainability-and-collectibility`: Structured "Why It's Valued Here" rationale, melt-vs-premium analytics, collectibility tiering, hold outlook, and modern collector-grade UI presentation on item detail views.
- `pwa-progressive-and-offline-appraisal`: Non-blocking progressive appraisal execution with real-time step status and offline PWA caching of valuation breakdowns, specs, and item media.

### Modified Capabilities
- (None — `k3s-deployment` is the only existing spec and requires no requirement changes.)

## Impact

- **Backend**: `backend/apps/catalog/models.py`, `backend/apps/catalog/api.py`, `backend/apps/valuation/models.py`, `backend/apps/valuation/providers.py`, `backend/apps/valuation/services.py`, `backend/apps/valuation/api.py`, `backend/apps/vision/services.py`, `backend/apps/accounts/models.py` (new BYOK provider keys for Numista / eBay / NumisMedia as applicable), plus Django migrations and unit/integration tests.
- **Frontend (PWA)**: `frontend/src/pages/ItemDetailPage.tsx`, new modular components (`ValuationBreakdownCard`, `CollectibilityThesisCard`, `NumismaticSpecsCard`, `AppraisalProgressBanner`), `frontend/src/lib/api.ts`, offline IndexedDB cache helper, and `frontend/vite.config.ts` Workbox runtime caching rules.
- **External Integrations**: Gold-API (existing), PCGS Public API (existing), Greysheet CDN (existing), Numista API, NumisMedia FMV, eBay Browse/Marketplace Insights (sold comps), and Gemini / Ollama multimodal vision.


# Design

## Context

See `proposal.md` for motivation and `specs/` for behavioral requirements. Currently, Stackers Stash runs a synchronous, early-exit `appraise_item` function in `backend/apps/valuation/services.py`, stores items in `CollectionItem` (`backend/apps/catalog/models.py`), and renders a single Market/Melt pair on `frontend/src/pages/ItemDetailPage.tsx`. The stack is Django + Django Ninja (SQLite locally, PostgreSQL in HomeLab K3S) with a React 19 + Vite + Tailwind v4 + `vite-plugin-pwa` frontend.

## Goals / Non-Goals

**Goals:**
- Execute melt, specs enrichment, price guides, realized comps, and multimodal AI concurrently with per-provider fault isolation.
- Never value a precious-metal item below its live melt floor, while surfacing full numismatic upside above melt.
- Keep local development and K3S production simple (no mandatory Redis/Celery broker) while delivering non-blocking progressive UX in the PWA.
- Decompose `ItemDetailPage.tsx` into clean, modern, accessible cards for Valuation Breakdown, Collectibility & Hold Thesis, and Numismatic Specs.
- Enable offline coin-show viewing of appraised items, specs, and photos.

**Non-Goals:**
- Building an automated live-bidding or marketplace listing engine.
- Scraping third-party websites in violation of terms of service (all external lookups use official APIs, BYOK credentials, or user-triggered AI analysis).
- Modifying K3S Helm charts or deployment topology (`k3s-deployment` spec remains unchanged).

## Decisions

### 1. Concurrent Provider Execution via `ThreadPoolExecutor` + DB-Backed `AppraisalJob`
- **Choice**: Run providers concurrently using Python's `concurrent.futures.ThreadPoolExecutor(max_workers=5)` inside a background daemon thread tracked by a new `AppraisalJob` model in `apps/valuation/models.py` (with an optional `?sync=true` flag for automated tests and CLI scripts).
- **Rationale**: Requires zero new infrastructure (no Redis/Celery sidecars in Docker Compose or K3S), works identically on SQLite and PostgreSQL, and keeps `POST /valuation/items/{id}/appraise` fast (<300ms after immediate melt refresh).
- **Alternatives Considered**:
  - *Celery + Redis*: Overkill for single-workspace/homelab scale and adds operational complexity to K3S deployment.
  - *Synchronous HTTP request*: Times out or freezes UI for 15–30s when 4–5 external APIs + multimodal AI run together.

### 2. Data Model Extensions (`CollectionItem`, `ValuationHistory`, `AppraisalJob`, `ProviderCredential`)
- **Choice**:
  - Extend `CollectionItem` with:
    - Specs: `mint_mark`, `mintage`, `variety`, `composition`, `gross_weight_grams`, `diameter_mm`, `thickness_mm`, `edge_type`, `designer`, `catalog_numbers` (JSONField), `specs_provenance` (JSONField mapping field -> `"USER"` | `"NUMISTA"` | `"PCGS"` | `"AI"`).
    - Valuation explainability: `market_value_low`, `market_value_high`, `valuation_confidence` (`HIGH`/`MEDIUM`/`LOW`), `collectibility_tier` (`BULLION`/`SEMI_NUMISMATIC`/`KEY_DATE_COLLECTIBLE`/`NUMISMATIC`), `hold_outlook` (TextField), `valuation_drivers` (JSONField list of strings).
  - Add `AppraisalJob` model (`id`, `item`, `workspace`, `status`, `steps` JSONField, `error_message`, `created_at`, `completed_at`).
  - Add `ProviderCredential.Provider` choices for `NUMISTA_KEY`, `NUMISMEDIA_KEY`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`.
- **Rationale**: Storing the latest explainability summary directly on `CollectionItem` makes list/detail hydration and offline caching fast without extra joins, while `ValuationHistory.raw_payload` retains the full per-provider audit trail.
- **Alternatives Considered**: Separate 1:1 `CoinSpecification` table — rejected to avoid extra migrations/joins across `ItemOut`, CSV import/export, and offline cache serialization.

### 3. Valuation Reconciliation & Melt-Floor Invariant
- **Choice**:
  1. Always compute `melt_value_unit` from latest `SpotPriceSnapshot`.
  2. Collect all available quotes (`PCGS`, `GREYSHEET`, `NUMISMEDIA`, `COMPS_MEDIAN`, `AI_ESTIMATE`).
  3. Select primary `numismatic_quote` by authority precedence: `PCGS` (exact cert) > `GREYSHEET` > `NUMISMEDIA` > `COMPS_MEDIAN` > `AI_ESTIMATE`.
  4. Enforce **melt floor invariant**: `market_value_unit = max(numismatic_quote or 0, melt_value_unit)`. If melt exceeds the numismatic quote, `valuation_source = SPOT_MELT` and a driver notes that metal value currently exceeds collector premium.
  5. Compute `market_value_low` and `market_value_high` from comp spread, AI range, or ±10% around single-source guide values.
  6. Assign `valuation_confidence`: `HIGH` (verified cert/guide + corroborating comps or >=2 agreeing sources), `MEDIUM` (single guide, >=3 comps, or photo-backed AI), `LOW` (text-only AI or melt-only fallback).
- **Rationale**: Prevents rare coins from being undervalued at melt while also preventing stale price guides from undervaluing bullion when spot spikes.

### 4. Multimodal AI Prompting & Structured Output
- **Choice**: Update `estimate_item_value_with_ai` in `backend/apps/vision/services.py` to attach up to 3 item photos (prioritizing `OBVERSE`, `REVERSE`, `SLAB`) for both Gemini (`gemini-2.5-flash`) and Ollama vision fallback, requesting a strict JSON schema with `low_usd`, `mid_usd`, `high_usd`, `valuation_drivers[]`, `collectibility_tier`, `hold_outlook`, and `inferred_specs`.
- **Rationale**: Visual inspection of luster, wear, toning, mint mark, and slab label dramatically improves raw-coin accuracy and powers the "Why It's Valued Here" narrative even when paid price-guide APIs aren't configured.

### 5. Modern UI Architecture & PWA Offline Caching
- **Choice**:
  - Extract modular components under `frontend/src/components/valuation/`:
    - `AppraisalProgressBanner.tsx` (animated step chips for Melt, Specs, Guides, Comps, AI)
    - `ValuationBreakdownCard.tsx` (Market/Melt/Premium % stacked bar, Low–Mid–High range slider/marker, Confidence pill, "Why It's Valued Here" drivers, collapsible Source Comparison table)
    - `CollectibilityThesisCard.tsx` (Collectibility Tier badge, Hold Outlook, grading/liquidity guidance)
    - `NumismaticSpecsCard.tsx` (clean 2-column spec grid with provenance badges and inline edit mode)
  - Add Workbox `runtimeCaching` in `frontend/vite.config.ts` (`NetworkFirst` for `/api/catalog/items/*` and `/api/valuation/*`, `CacheFirst` for `/media/*`) plus a lightweight IndexedDB cache (`frontend/src/lib/offlineCache.ts`) for offline coin-show resilience.
- **Rationale**: Keeps `ItemDetailPage.tsx` maintainable and delivers a crisp, modern dark-luxury collector UI that works seamlessly online and offline.

## Risks / Trade-offs

- **External API Rate Limits / Missing BYOK Keys** → Every provider is optional and isolated with a 10s timeout; when no BYOK price guides are set, the engine still delivers live melt + multimodal AI + specs without failing.
- **SQLite Write Locking Under Concurrent Threads** → Only the main orchestration thread writes to Django models after `ThreadPoolExecutor` finishes gathering HTTP responses; worker threads perform read-only HTTP calls.
- **AI Hallucination on Rare Varieties / Mintages** → `specs_provenance` clearly tags AI-inferred fields vs. verified catalog/user fields, and `is_estimate` / `valuation_confidence` badges transparently communicate data quality to the user.

## Migration Plan

1. Add nullable/defaulted fields to `CollectionItem`, `AppraisalJob`, and `ProviderCredential.Provider` via standard Django `makemigrations`.
2. Deploy backward-compatible API fields (`ItemOut` additions are optional/defaulted) so existing clients continue working.
3. Roll out frontend PWA update; `VitePWA` `registerType: "autoUpdate"` updates service worker caches automatically on next load.


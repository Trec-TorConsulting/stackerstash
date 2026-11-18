# Design

## Context

Stackers Stash currently models all collectibles through `CollectionItem` (`backend/apps/catalog/models.py`), `auto_sort.py`, a local-first Vision AI + OCR pipeline (`backend/apps/vision/`), and a concurrent multi-source appraisal engine (`backend/apps/valuation/`). See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Make `CARD` (Trading / Collectible Cards, including Pokémon, MTG, Yu-Gi-Oh!, Lorcana, One Piece, and Sports cards) and card-graded slabs (`PSA`, `BGS`, `CGC`, `SGC`, `TAG`) first-class citizens across the data model, camera/vision pipeline, grade estimator, appraisal engine, and UI.
- Preserve 100% backwards compatibility and zero regressions for coins, paper currency, bars, rounds, and Goldbacks.
- Keep zero-key / local-first defaults strong (public Pokémon TCG API, Scryfall API, local OCR, eBay Sold/TCGplayer/PriceCharting/130point zero-key links) while supporting optional BYOK keys for PriceCharting, TCGplayer, and PSA.

**Non-Goals:**
- Building a deck-builder, tournament legality tracker, or live multiplayer trade marketplace.
- Importing multi-gigabyte offline card image databases into the container image; reference matching uses lightweight JSON/API caches with `ServerReferenceCache`.

## Decisions

### 1. Data Model: Explicit `Category.CARD` + Structured `attributes` vs. Dedicated Columns
- **Decision:** Add `CARD = "CARD", "Trading Card"` to `CollectionItem.Category` and `SortCategory`, add `PSA`, `BGS`, `CGC`, `SGC`, `TAG` to `CollectionItem.GradingService`, and store card-specific metadata (`card_game`, `set_name`, `set_code`, `card_number`, `rarity`, `card_finish`, `card_edition`, `language`, `raw_condition`) in a validated schema within `CollectionItem.attributes` (exposed as first-class fields on the Django Ninja serializer/API and TypeScript `CollectionItem` interface), while using `CollectionItem.series` for `set_name` when convenient and `CollectionItem.catalog_numbers` for `pokemon_tcg_id`, `tcgplayer_id`, `scryfall_id`, and `pricecharting_id`.
- **Rationale:** Avoids bloating the `CollectionItem` table with 10+ sparse nullable columns for coins/bars while still giving API consumers, CSV import/export, search, and UI components strongly-typed card fields.
- **Alternative Considered:** A separate `TradingCardDetails` 1:1 model. Rejected to keep polymorphic queries, sorting, filtering, and `ValuationHistory` unified on `CollectionItem`.

### 2. Card vs. Numismatic Helper (`is_card_item`)
- **Decision:** Add a single shared predicate `is_card_item(item)` on `CollectionItem` (true if `category == CARD` or `sort_category == CARD` or `grading_service in {PSA, BGS, CGC, SGC, TAG}` or `attributes.get("card_game")` is truthy) and mirror it in `frontend/src/lib/format.ts`.
- **Rationale:** Ensures `SLAB` items for PSA-graded Pokémon cards route cleanly to `Trading Cards` in `auto_sort.py`, `CardSpecsCard` on `ItemDetailPage`, 1–10 TCG grade estimation, card pricing providers, and card comp links—without ever colliding with PCGS/NGC coin slabs.

### 3. Vision Identification & Slab OCR
- **Decision:** Update `IDENTIFICATION_PROMPT` in `backend/apps/vision/services.py` to include a dedicated `CARD` / `SLAB` branch extracting `card_game`, `set_name`, `set_code`, `card_number`, `rarity`, `card_finish`, `card_edition`, `language`, and `PSA`/`BGS`/`CGC`/`SGC`/`TAG` slab labels. Extend `ocr.py` barcode/label parsing to recognize PSA 8-digit cert barcodes, CGC 10-digit cert numbers, and BGS label layouts.
- **Rationale:** Keeps the existing local-first cascade (image hash cache → barcode/QR → local OCR → text LLM → Vision AI) unified.

### 4. Raw Card Grading (1–10 Scale + Raw Condition)
- **Decision:** In `estimate_raw_item_grade()` (`backend/apps/vision/services.py`), branch on `is_card_item(item)`: prompt the model to evaluate **centering, corners, edges, and surface** on the **1–10 TCG/Sports scale** plus standard raw condition (`NM`, `LP`, `MP`, `HP`, `DMG`), and calculate `grading_upside_usd` against typical card grading fees (~$20–$25/card) rather than coin grading fees.

### 5. Concurrent Appraisal Engine & Providers
- **Decision:** In `backend/apps/valuation/services.py` and `providers.py`:
  - When `is_card_item(item)` is true, skip `SPOT_MELT`, `PCGS`, `GREYSHEET`, `NUMISMEDIA`, `NUMISTA`, and `GOLDBACK`.
  - Run card-applicable providers concurrently alongside eBay sold/active comps and AI appraisal:
    1. **Pokémon TCG API** (`api.pokemontcg.io/v2/cards` — works without key at standard rate limit, optional `POKEMON_TCG_API_KEY` for higher quota) returning TCGplayer market/low/mid/high by finish (`normal`, `holofoil`, `reverseHolofoil`, `1stEditionHolofoil`).
    2. **Scryfall API** (`api.scryfall.com/cards/named` — zero-key) for Magic: The Gathering USD/foil prices.
    3. **PriceCharting API** (optional BYOK `PRICECHARTING_API_KEY`) for ungraded, PSA 9, PSA 10, BGS 9.5, and CGC 10 card prices across Pokémon, Sports, Yu-Gi-Oh!, and MTG.
    4. **PSA Cert Lookup** (optional BYOK `PSA_API_TOKEN`) for verified slab metadata & pop report context.
  - Cache all external responses in `ServerReferenceCache` to minimize API calls.

### 6. Card-Aware UI & Comp Links
- **Decision:**
  - `frontend/src/lib/compLinks.ts`: Branch `buildCompLinks` on `isCardItem(item)` to emit **eBay Sold**, **TCGplayer**, **PriceCharting**, and **130point** (sports/TCG sold comps) instead of Heritage/GreatCollections/Stack's Bowers.
  - `frontend/src/components/valuation/CardSpecsCard.tsx`: New component matching `NumismaticSpecsCard.tsx` styling, rendered when `isCardItem(item)` is true.
  - `DashboardPage.tsx` & `CollectionPage.tsx`: Add `Trading Cards` filter/group, and ensure non-bullion card items don't inflate "Melt Value" warnings or show coin-only quick-add presets when browsing cards.

## Risks / Trade-offs

- **[Risk] Public API rate limits (Pokémon TCG API / Scryfall)** → **Mitigation:** Cache card lookups aggressively in `ServerReferenceCache` (24h+ TTL for static card specs, 6h–12h for prices) and isolate provider timeouts so eBay comps and AI estimates still succeed.
- **[Risk] Ambiguity between `SLAB` coins and `SLAB` cards** → **Mitigation:** `is_card_item()` checks `grading_service` (`PSA`/`BGS`/`CGC`/`SGC`/`TAG`) and `card_game` attributes; `auto_sort.py` maps them deterministically to `SortCategory.CARD`.
- **[Risk] CSV import backwards compatibility** → **Mitigation:** All new card CSV columns are optional; existing coin/bullion CSVs import identically without schema changes.

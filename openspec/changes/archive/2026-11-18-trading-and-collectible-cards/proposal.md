# Proposal

## Why

Stackers Stash currently scores ~4/10 for tracking trading cards, Pokémon cards, and other collectible cards: while its generic container hierarchy (`BINDER`, `BOX`), multi-photo capture (`rect` / `slab`), eBay comps, and `attributes` JSON field work for basic logging, the data model, grading services, AI vision prompts, raw grade estimator, valuation providers, and UI are specialized for coins, bullion, and paper currency. Expanding first-class support for collectible cards unlocks a 10/10 multi-asset collector experience (Pokémon, Magic: The Gathering, Yu-Gi-Oh!, Sports, One Piece, Lorcana, and more) on the same local-first, privacy-respecting platform.

## What Changes

- Add `CARD` (`Trading / Collectible Card`) as a first-class `CollectionItem.Category` and `SortCategory`, along with card-specific grading services (`PSA`, `BGS`, `CGC`, `SGC`, `TAG`) and cert verification URLs.
- Introduce structured card metadata and enrichment (`trading-card-specs-and-catalog`): game/sport franchise, set name & code, card number (e.g., `4/102`), rarity, finish/parallel (Holo, Reverse Holo, Full Art, Alt Art, Refractors), edition (1st Edition, Shadowless, Unlimited), language, raw condition (`NM`, `LP`, `MP`, `HP`, `DMG`), and external catalog IDs (TCGplayer, Pokémon TCG, Scryfall, PriceCharting), rendered in a dedicated `CardSpecsCard` on `ItemDetailPage`.
- Update `auto-sort-classification` to classify raw cards and card-graded slabs under `Trading Cards` (`CARD`), sub-categorized by Franchise / Game / Sport (e.g., `Pokémon`, `Magic: The Gathering`, `Sports — Baseball`, `Yu-Gi-Oh!`, `Other Cards`).
- Extend `vision-identification` OCR, barcode/QR parsing, and Vision AI prompts to identify trading cards and PSA/BGS/CGC/SGC/TAG slabs accurately.
- Extend `raw-item-grade-estimation` to evaluate raw `CARD` items on the 1–10 TCG/Sports grading scale (centering, corners, edges, surface) and raw condition tiers (`NM`/`LP`/`MP`/`HP`/`DMG`), computing grading ROI against card slabbing fees.
- Extend `multi-source-appraisal-engine` and `marketplace-comps-and-grounding` with TCG/card pricing sources (Pokémon TCG API / TCGplayer / PriceCharting / Scryfall), PSA/CGC/BGS cert metadata lookups, and card-specific zero-key comp links (eBay Sold, TCGplayer, PriceCharting, 130point) while hiding coin-only UI (melt floor, Heritage Coins, GreatCollections, Numismatic Specs) for card items.

## Capabilities

### New Capabilities
- `trading-card-specs-and-catalog`: Structured metadata schema, reference catalog matching, API enrichment (Pokémon TCG API, Scryfall, TCGplayer/PriceCharting), and `CardSpecsCard` UI for trading, TCG, and sports cards.

### Modified Capabilities
- `catalog-inventory`: Add `CARD` category, `CARD` sort category, TCG/sports grading services (`PSA`, `BGS`, `CGC`, `SGC`, `TAG`), card-aware filters/presets, and CSV import/export support for card fields.
- `auto-sort-classification`: Add `Trading Cards` (`CARD`) as a canonical primary sort category with Franchise/Game/Sport sub-categories and slab-to-card mapping.
- `vision-identification`: Extend local OCR, slab label/barcode parsing, and Vision AI identification prompts to recognize trading cards, Pokémon/TCG cards, sports cards, and card grading slabs.
- `raw-item-grade-estimation`: Support raw `CARD` condition (`NM`/`LP`/`MP`/`HP`/`DMG`) and 1–10 TCG/Sports grading estimates (centering, corners, edges, surface) with card slabbing ROI.
- `multi-source-appraisal-engine`: Integrate TCG/card market price providers and card cert lookups into the concurrent appraisal engine alongside eBay comps and AI estimates.
- `marketplace-comps-and-grounding`: Route `CARD` and card-slab items to card-relevant zero-key comp links (eBay Sold, TCGplayer, PriceCharting, 130point) and BYOK card provider settings.

## Impact

- **Backend**: `backend/apps/catalog/models.py` (new choices & card metadata/migrations), `auto_sort.py`, `presets.py`, `importer.py`, `reference_catalog.py`; `backend/apps/vision/services.py` & `ocr.py`; `backend/apps/valuation/providers.py` & `services.py`; `backend/apps/accounts/models.py` (optional BYOK provider keys for TCGplayer / PriceCharting / PSA).
- **Frontend**: `frontend/src/lib/api.ts`, `compLinks.ts`, `CollectionPage.tsx`, `ItemDetailPage.tsx`, `ScanAddPage.tsx`, `DashboardPage.tsx`, `SettingsPage.tsx`, and a new `CardSpecsCard.tsx` component (conditionally rendered instead of `NumismaticSpecsCard` for `CARD` items).
- **Tests**: Backend unit/API tests (`test_catalog.py`, `test_auto_sort.py`, `test_valuation_and_vision.py`, `test_providers.py`, `test_importer.py`) and frontend Vitest suites (`itemDetail.test.tsx`, `valuation.test.tsx`, `autoSort.test.tsx`).

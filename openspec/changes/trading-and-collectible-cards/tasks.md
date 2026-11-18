# Tasks

## 1. Backend Catalog Model, Schemas & Migrations
- [x] 1.1 Add `CARD = "CARD", "Trading Card"` to `CollectionItem.Category` and `CollectionItem.SortCategory` in `backend/apps/catalog/models.py`, and add `PSA`, `BGS`, `CGC`, `SGC`, `TAG` to `CollectionItem.GradingService`; generate and apply Django migration.
- [x] 1.2 Add `is_card_item` property/helper on `CollectionItem` (checking `category == CARD`, `sort_category == CARD`, `grading_service` in card graders, or `attributes["card_game"]`).
- [x] 1.3 Expose structured card fields (`card_game`, `set_name`, `set_code`, `card_number`, `rarity`, `card_finish`, `card_edition`, `language`, `raw_condition`) in `backend/apps/catalog/api.py` schemas, create/update handlers (backed by `attributes` + `series`), and full-text search.
- [x] 1.4 Update `backend/apps/catalog/importer.py` to support optional trading card CSV columns (`card_game`, `set_name`, `set_code`, `card_number`, `rarity`, `card_finish`, `card_edition`, `raw_condition`) and card grading services (`PSA`, `BGS`, `CGC`, `SGC`, `TAG`), plus CSV/JSON export.

## 2. Auto-Sort Classification
- [x] 2.1 Update `backend/apps/catalog/auto_sort.py` to classify `CARD` items and card-graded `SLAB` items (`PSA`, `BGS`, `CGC`, `SGC`, `TAG`, or card metadata) into `SortCategory.CARD` (`Trading Cards`).
- [x] 2.2 Add deterministic franchise/game/sport sub-category normalization in `auto_sort.py` (`Pokémon`, `Magic: The Gathering`, `Yu-Gi-Oh!`, `Disney Lorcana`, `One Piece`, `Sports — Baseball`, `Sports — Basketball`, `Sports — Football`, `Other Cards`).
- [x] 2.3 Add unit tests in `backend/tests/test_auto_sort.py` covering raw Pokémon cards, PSA-slabbed cards, sports cards, and manual override preservation.

## 3. Vision Identification & Raw Card Grade Estimation
- [x] 3.1 Update `IDENTIFICATION_PROMPT` and normalization in `backend/apps/vision/services.py` to detect trading cards, Pokémon/TCG cards, sports cards, and `PSA`/`BGS`/`CGC`/`SGC`/`TAG` slabs, returning `category="CARD"` (or `"SLAB"` with card attributes) and `metal_type="NONE"`.
- [x] 3.2 Extend `backend/apps/vision/ocr.py` barcode/QR and label regexes to extract PSA, BGS, CGC, SGC, and TAG cert numbers and grades.
- [x] 3.3 Update `estimate_raw_item_grade()` in `backend/apps/vision/services.py` to include `CARD` items, evaluating centering, corners, edges, and surface on the 1–10 TCG/Sports scale plus `raw_condition` (`NM`/`LP`/`MP`/`HP`/`DMG`), and computing `grading_upside_usd` against card slabbing fees.
- [x] 3.4 Add vision and raw card grading tests in `backend/tests/test_valuation_and_vision.py`.

## 4. Card Pricing, Cert Lookups & Appraisal Engine
- [x] 4.1 Add optional BYOK provider keys (`PRICECHARTING_API_KEY`, `PSA_API_TOKEN`, `POKEMON_TCG_API_KEY`) to `backend/apps/accounts/` workspace secret choices and Settings API.
- [x] 4.2 Implement `lookup_pokemon_tcg_card`, `lookup_scryfall_card`, `lookup_pricecharting_card`, and `lookup_psa_cert` (plus `build_cert_verification_url` for `PSA`, `BGS`, `CGC`, `SGC`, `TAG`) in `backend/apps/valuation/providers.py` with `ServerReferenceCache` caching.
- [x] 4.3 Update `appraise_item()` in `backend/apps/valuation/services.py` to route `is_card_item` items to card pricing providers + eBay comps + AI appraisal while skipping numismatic-only providers (`SPOT_MELT`, `PCGS`, `GREYSHEET`, `NUMISMEDIA`, `NUMISTA`, `GOLDBACK`).
- [x] 4.4 Add provider and appraisal tests in `backend/tests/test_providers.py` and `backend/tests/test_comprehensive_appraisal.py`.

## 5. Frontend UI, Comp Links & Camera Support
- [x] 5.1 Update `frontend/src/lib/api.ts` and `frontend/src/lib/format.ts` with `CARD` category, `PSA`/`BGS`/`CGC`/`SGC`/`TAG` grading services, card attribute types, and `isCardItem()` helper.
- [x] 5.2 Create `frontend/src/components/valuation/CardSpecsCard.tsx` and render it on `ItemDetailPage.tsx` for card items (replacing `NumismaticSpecsCard`), including inline editing of card fields and external catalog links.
- [x] 5.3 Update `frontend/src/lib/compLinks.ts` (`buildCompLinks`) to generate **eBay Sold**, **TCGplayer**, **PriceCharting**, and **130point** links for card items instead of coin auction houses.
- [x] 5.4 Update `CollectionPage.tsx`, `ScanAddPage.tsx`, `GuidedCameraModal.tsx` (defaulting to `rect`/`slab` framing when `CARD` is selected), `DashboardPage.tsx`, and `SettingsPage.tsx` (BYOK card provider inputs).
- [x] 5.5 Add/update Vitest tests in `frontend/src/__tests__/itemDetail.test.tsx`, `valuation.test.tsx`, and `autoSort.test.tsx`.

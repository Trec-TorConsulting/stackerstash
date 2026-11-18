# Tasks

## 1. Credentials & Data Model

- [x] 1.1 Add `TCGPLAYER_CLIENT_ID`, `TCGPLAYER_CLIENT_SECRET`, and `COLLECTR_API_KEY` choices to `ProviderCredential` in `backend/apps/accounts/models.py`, generate the Django migration, and verify `python manage.py migrate --check` passes.

## 2. Backend Providers & Appraisal Engine

- [x] 2.1 Expand `lookup_psa_cert` in `backend/apps/valuation/providers.py` to extract and cache `psa_spec_id`, `total_population`, `population_higher`, and label/qualifier attributes, and verify with unit tests in `backend/tests/test_providers.py`.
- [x] 2.2 Expand `lookup_pricecharting_card` in `backend/apps/valuation/providers.py` to normalize ungraded (`loose-price`) and graded tiers (`PSA 7–10`, `BGS 9.5/10`, `CGC 10`, `SGC 10`, `TAG 10`) for all card types, and verify with unit tests in `backend/tests/test_providers.py`.
- [x] 2.3 Implement optional BYOK `lookup_tcgplayer_price` (OAuth2 `/token` + `/pricing/product/{id}`) and `lookup_collectr_price` in `backend/apps/valuation/providers.py`, wire them into `backend/apps/valuation/services.py` when credentials exist, and verify with mocked unit tests in `backend/tests/test_providers.py`.

## 3. Frontend Comps, Settings & Card Specs UI

- [x] 3.1 Add `Beckett`, `Card Ladder`, and `Collectr` deep-link comps to `buildCompLinks` in `frontend/src/lib/compLinks.ts` for trading card items, and verify with unit tests in `frontend/src/__tests__/valuation.test.tsx`.
- [x] 3.2 Update `frontend/src/components/valuation/CardSpecsCard.tsx` to display PSA population (`TotalPopulation`, `PopulationHigher`), BGS 10-pt sub-grades, and TAG 1000-pt score + front/back sub-grades + DIG Report link, and verify with tests in `frontend/src/__tests__/itemDetail.test.tsx`.
- [x] 3.3 Add `TCGPLAYER_CLIENT_ID`, `TCGPLAYER_CLIENT_SECRET`, and `COLLECTR_API_KEY` inputs to `frontend/src/pages/SettingsPage.tsx` and verify `npm run build` succeeds.

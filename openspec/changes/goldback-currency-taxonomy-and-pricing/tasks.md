# Tasks

## 1. Canonical Goldback Domain Module & Auto-Sort

- [x] 1.1 Create `backend/apps/catalog/goldback.py` with all 9 official Goldback denominations (`1/4`, `1/2`, `1`, `2`, `5`, `10`, `25`, `50`, `100`), exact troy-ounce weights, state series list, `is_goldback_item`, `parse_goldback_denomination`, and `normalize_goldback_fields`.
- [x] 1.2 Update `backend/apps/catalog/auto_sort.py` to include Goldback/Aurum keywords and state series hints so Goldbacks sort into `PAPER › United States`, and add unit tests in `backend/tests/test_catalog.py`.

## 2. Vision AI & Appraisal Grounding

- [x] 2.1 Update `IDENTIFICATION_PROMPT` and `_normalize_candidate()` in `backend/apps/vision/services.py` to cover all 9 Goldback denominations and deterministically normalize Goldback fields.
- [x] 2.2 Update `backend/apps/valuation/providers.py` and `backend/apps/valuation/services.py` to compute the `GOLDBACK_EXCHANGE` benchmark (`~1.95x–2.10x` melt) and ground unverified AI estimates for Goldbacks, and add unit tests in `backend/tests/test_valuation_and_vision.py`.

## 3. Validation

- [x] 3.1 Run `openspec validate goldback-currency-taxonomy-and-pricing --strict` and `backend/.venv/bin/pytest backend/tests/`, confirming all tests pass.

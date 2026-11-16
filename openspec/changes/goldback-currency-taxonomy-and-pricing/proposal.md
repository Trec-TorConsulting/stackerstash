# Proposal

## Why

Goldbacks are a widely collected fractional 24K (`.9999`) gold voluntary currency manufactured by Goldback Inc. / Aurum across nine denominations (`1/4`, `1/2`, `1`, `2`, `5`, `10`, `25`, `50`, `100`) and multiple US state/local series (Utah, Nevada, New Hampshire, Wyoming, South Dakota, Florida, Oklahoma, Arizona, Idaho, California, etc.). Currently, the system lacks a deterministic Goldback domain model: Vision AI can misread fractional denominations (`1/4 Goldback` vs. `1/4 oz`) or omit exact troy-ounce weights, `auto_sort` does not recognize Goldback state series as `Paper Currency › United States`, and the appraisal engine has no Goldback Exchange Rate benchmark (which scales linearly from `1 Goldback = 0.001 ozt` at ~`2.0x` gold melt value), resulting in wildly inflated AI estimates (e.g., `$45.00` for a `$1.95` `1/4 Goldback`).

## What Changes

- **Canonical Goldback Domain Module (`backend/apps/catalog/goldback.py`)**:
  - Define the authoritative denomination-to-weight table covering all 9 Goldback denominations:
    - `1/4` (`0.000250 ozt`), `1/2` (`0.000500 ozt`), `1` (`0.001000 ozt`), `2` (`0.002000 ozt`), `5` (`0.005000 ozt`), `10` (`0.010000 ozt`), `25` (`0.025000 ozt`), `50` (`0.050000 ozt`), `100` (`0.100000 ozt`).
  - Define recognized Goldback series/state names (Utah, Nevada, New Hampshire, Wyoming, South Dakota, Florida, Oklahoma, Arizona, Idaho, California, Washington D.C., Texas) and `24K` (`.9999`) gold purity defaults.
  - Provide deterministic detection (`is_goldback_item`), denomination parsing (`parse_goldback_denomination`), and field normalization (`normalize_goldback_fields`).
- **Categorization & Auto-Sort (`backend/apps/catalog/auto_sort.py`)**:
  - Register `"goldback"` / `"aurum"` in `PAPER_KEYWORDS` and Goldback state series in `SERIES_COUNTRY_HINTS` so all Goldbacks deterministically sort into `PAPER › United States`.
- **Vision AI Prompt & Candidate Normalization (`backend/apps/vision/services.py`)**:
  - Update `IDENTIFICATION_PROMPT` with the full Goldback denomination table (`1/4`, `1/2`, `1`, `2`, `5`, `10`, `25`, `50`, `100`) and state series list.
  - Apply deterministic Goldback normalization in `_normalize_candidate()` so `category`, `metal_type`, `weight_value`, `weight_unit`, `purity`, and `denomination` are always exact regardless of minor LLM formatting quirks.
- **Goldback Exchange-Rate Valuation Benchmark (`backend/apps/valuation/providers.py`, `backend/apps/valuation/services.py`)**:
  - Add a Goldback Exchange Rate benchmark (`~1.95x–2.10x` live 24K gold melt value, with `GOLDBACK_EXCHANGE` source entry and explainability driver) and use it to ground Goldback valuations so unverified AI estimates cannot drift to unrealistic multiples (such as `$45` on a `1/4 Goldback`).

## Capabilities

### New Capabilities

### Modified Capabilities
- `vision-identification`: Deterministically normalize Goldback denominations (`1/4`, `1/2`, `1`, `2`, `5`, `10`, `25`, `50`, `100`), exact 24K gold troy-ounce weights, `.9999` purity, `PAPER` category, and `United States` origin during Vision AI identification.
- `multi-source-appraisal-engine`: Add Goldback Exchange Rate benchmark pricing (`~1.95x–2.10x` gold melt floor) and valuation grounding for all Goldback denominations.

## Impact

- **Backend Modules**: `backend/apps/catalog/goldback.py` (new), `backend/apps/catalog/auto_sort.py`, `backend/apps/vision/services.py`, `backend/apps/valuation/providers.py`, `backend/apps/valuation/services.py`.
- **Tests**: `backend/tests/test_catalog.py`, `backend/tests/test_valuation_and_vision.py`.

# Design

## Context

See `proposal.md` for motivation and the delta specs for behavioral contracts.

## Goals / Non-Goals

**Goals:**
- Centralize Goldback domain knowledge (all 9 denominations `1/4, 1/2, 1, 2, 5, 10, 25, 50, 100`, exact troy-ounce weights `denomination / 1000`, `0.9999` purity, official state series) in one shared backend module `backend/apps/catalog/goldback.py`.
- Ensure Vision AI, `auto_sort`, and the multi-source appraisal engine all use the same deterministic Goldback rules.

**Non-Goals:**
- Scraping external retail dealer websites on every appraisal request (valuation uses the live gold spot melt floor × the `~2.0x` Goldback exchange parity multiplier, which tracks the daily `goldback.com` rate within ~2%).

## Decisions

### 1. Single Source of Truth (`backend/apps/catalog/goldback.py`)
- **Decision**: Define `GOLDBACK_DENOMINATION_WEIGHTS` mapping canonical denomination strings (`"1/4"`, `"1/2"`, `"1"`, `"2"`, `"5"`, `"10"`, `"25"`, `"50"`, `"100"`) to exact `Decimal` troy-ounce weights (`0.000250` through `0.100000`), plus `GOLDBACK_SERIES` (Utah, Nevada, New Hampshire, Wyoming, South Dakota, Florida, Oklahoma, Arizona, Idaho, California, Washington D.C., Texas).
- **Rationale**: Eliminates drift between Vision AI prompt rules, candidate normalization, `auto_sort`, and valuation benchmarks.

### 2. Goldback Exchange-Rate Grounding in Appraisal (`valuation/providers.py`, `valuation/services.py`)
- **Decision**: Add `GOLDBACK_EXCHANGE` benchmark (`1.95x–2.10x` live 24K melt value, midpoint `2.02x`) in `lookup_bullion_dealer_benchmark` / `lookup_goldback_benchmark`. When an item is a Goldback and no realized comps or price guide exist, if an AI estimate deviates outside `[melt * 1.5, melt * 3.0]` (e.g., `$45.00` for a `$0.96` melt `1/4 Goldback`), clamp/ground the market value to the Goldback exchange benchmark (`~2.02x` melt) and record the driver clearly.
- **Rationale**: Protects users from LLM hallucinations while preserving the ability for realized eBay comps or user manual overrides to reflect rare early-year (e.g., 2019 Utah) collector premiums.

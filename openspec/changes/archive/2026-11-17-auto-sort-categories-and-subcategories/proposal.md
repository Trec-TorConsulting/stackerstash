# Proposal

## Why

Collectors quickly accumulate a mix of coins, paper banknotes, poured/minted silver bars, rounds, and graded slabs from many countries and refiners. Right now, `CollectionPage` displays a flat list/grid with a basic category dropdown, and `SLAB` / `FLIPPER` are separated from `COIN` and `PAPER` rather than grouped by what the item actually is. Manually normalizing countries (e.g., "USA" vs "United States", "Ancient Roman"), pourers/mints (e.g., "Geiger", "Engelhard", "Hand-Poured"), and keeping everything organized is tedious.

## What Changes

- **Background Auto-Sort Engine (Local-First)**: Add a background classification task triggered on item creation/intake (camera, upload, CSV import, or manual save) and via an optional "Re-sort Collection" action. It normalizes and assigns each item's canonical **Primary Sort Category** (mapping coin slabs/flippers to Coins and banknote slabs to Paper) and **Sub-Category** (Country/Origin including `Ancient` for Coins & Paper; Mint/Pourer/Refiner for Bars & Rounds). Classification runs deterministically using local rules/regex/metadata lookup first, with optional local Ollama fallback when configured—avoiding cloud calls for sorting.
- **Manual Override Protection**: Add a manual override flag/field on `CollectionItem` so users can pin or edit an item's primary sort category or sub-category without the background job overwriting their choice.
- **Workspace Setting Toggle**: Add an `auto_sort_enabled` workspace preference (defaulting to `true`) exposed in the Settings page so users can turn background auto-sorting off at any time.
- **Grouped Category & Sub-Category Collection View**: Add a hierarchical "By Category" / grouped browse mode in `CollectionPage` (alongside existing Grid and Table views) that organizes items under top-level buckets (`Coins`, `Paper Currency`, `Bars & Ingots`, `Rounds`, `Other`) and nested sub-category folders (e.g., `Coins -> United States`, `Coins -> Mexico`, `Coins -> Ancient`, `Paper Currency -> United States`, `Bars & Ingots -> Geiger Edelmetalle`, `Bars & Ingots -> Hand-Poured`). Graded items remain clearly marked with a `Graded` badge and filterable by grading status.

## Capabilities

### New Capabilities
- `auto-sort-classification`: Local-first background task that classifies and normalizes items into canonical primary categories and sub-categories (Country/Origin + Ancient for Coins & Paper; Mint/Pourer/Refiner for Bars & Rounds), respecting manual overrides and workspace auto-sort settings.

### Modified Capabilities
- `catalog-inventory`: Add normalized sort category/sub-category fields, manual override support, sub-category filtering, and a grouped Category -> Sub-Category collection view that places graded coin/paper slabs under Coins/Paper with a Graded badge.
- `identity-tenancy`: Add workspace-level `auto_sort_enabled` setting persisted on `Workspace` and exposed via workspace settings API/UI.

## Impact

- **Backend (`backend/apps/catalog/`, `backend/apps/accounts/`)**:
  - `CollectionItem` model migration adding `sort_category`, `sort_subcategory`, `sort_override` (boolean), and `sort_updated_at`.
  - `Workspace` model migration adding `auto_sort_enabled` (boolean, default `True`).
  - New `backend/apps/catalog/auto_sort.py` service + Celery/threaded background task hooked into item creation, CSV import, and vision identification completion, plus a manual re-sort endpoint.
  - Updated `catalog` list/filter endpoints and `accounts` workspace settings endpoints.
- **Frontend (`frontend/src/`)**:
  - `CollectionPage.tsx`: Grouped Category -> Sub-Category view mode, sub-category filter/drill-down, and Graded badge/filter.
  - `ItemDetailPage.tsx`: Display and allow manual override of `sort_category` and `sort_subcategory` (with an option to reset to auto-sort).
  - `SettingsPage.tsx`: Toggle for "Auto-Sort Collection Items" (`auto_sort_enabled`) and a "Re-sort Unpinned Items" action.


# Design

## Context

`CollectionItem` (`backend/apps/catalog/models.py`) already captures `category` (`COIN`, `PAPER`, `BAR`, `ROUND`, `SLAB`, `FLIPPER`, `OTHER`), `country`, `mint_or_refiner`, `year`, `denomination`, `series`, `grading_service`, and `title`. However, `country` and `mint_or_refiner` are free-text fields with inconsistent casing/aliases (e.g., `"US"`, `"USA"`, `"United States"`), `SLAB` and `FLIPPER` are top-level categories rather than attributes of Coins/Paper, and `CollectionPage.tsx` only offers flat `grid` and `table` views.

The project already uses Celery (`backend/config/celery.py`) with a local `threading.Thread` fallback pattern (seen in `apps/valuation/services.py` and `apps/catalog/importer.py`) and supports an optional self-hosted Ollama endpoint per workspace (`apps/accounts`). See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Normalize items in the background into canonical `sort_category` (`COIN`, `PAPER`, `BAR`, `ROUND`, `OTHER`) and `sort_subcategory` (Country/Origin or `Ancient` for Coins/Paper; Mint/Pourer/Refiner for Bars/Rounds).
- Run classification **local-first**: deterministic rule/alias matching in Python first, with optional self-hosted Ollama text classification when configured and deterministic rules yield `Uncategorized`, and zero reliance on cloud LLMs.
- Support manual overrides (`sort_override`) that background tasks never overwrite.
- Provide a workspace-level `auto_sort_enabled` setting (default `True`) and an on-demand "Re-sort Unpinned Items" endpoint.
- Add a grouped Category -> Sub-Category view mode in `CollectionPage.tsx` with counts, aggregate values, and `Graded` badges/filtering.

**Non-Goals:**
- Re-architecting physical storage `Container` hierarchies (Safe -> Box -> Tube); auto-sort is a logical taxonomy orthogonal to physical containers.
- Making cloud AI calls (e.g., Gemini) for sorting.
- Automatically migrating or mutating the raw `country`, `mint_or_refiner`, or `category` fields on `CollectionItem` (those remain untouched; normalized values live in `sort_category` and `sort_subcategory`).

## Decisions

### 1. Dedicated `sort_category`, `sort_subcategory`, and `sort_override` fields on `CollectionItem`
- **Choice**: Add `sort_category` (CharField, choices: `COIN`, `PAPER`, `BAR`, `ROUND`, `OTHER`, blank=True), `sort_subcategory` (CharField(max_length=120), blank=True, db_index=True), `sort_override` (BooleanField, default=False), and `sort_updated_at` (DateTimeField, null=True, blank=True) to `CollectionItem`.
- **Rationale**: Keeps raw intake/cert/CSV data (`category`, `country`, `mint_or_refiner`) intact while giving the UI and API indexed, fast-to-group canonical fields. `sort_override` cleanly separates user-pinned values from automated updates.
- **Alternative Considered**: Computing groups dynamically at query time in SQL/JS. Rejected because normalizing aliases ("USA"/"U.S."/"United States", ancient eras, pourer names) and running optional local Ollama inference is too slow and non-deterministic for every `GET /items` request.

### 2. Local-first two-stage classifier (`backend/apps/catalog/auto_sort.py`)
- **Stage 1 (Deterministic Rules & Alias Tables)**:
  - **Primary `sort_category`**:
    - `PAPER` -> `PAPER`
    - `COIN` -> `COIN`
    - `BAR` -> `BAR`
    - `ROUND` -> `ROUND`
    - `SLAB` or `FLIPPER` -> inspect `grading_service` (`PMG`, `PCGS_BANKNOTE` -> `PAPER`) and keywords in `title`/`denomination`/`series` (e.g., `note`, `banknote`, `dollar bill`, `silver certificate`, `fractional` -> `PAPER`; `bar`, `ingot` -> `BAR`; `round` -> `ROUND`; default for coin slabs/flippers -> `COIN`).
    - `OTHER` -> keyword check for coin/paper/bar/round, else `OTHER`.
  - **Sub-category (`sort_subcategory`)**:
    - For `COIN` and `PAPER`: Check ancient indicators (`ancient`, `roman`, `greek`, `byzantine`, `celtic`, `bc`, `bce`, `denarius`, `tetradrachm`, `antoninianus`, `sasanian`, `parthian`, etc. in `country`/`title`/`series`/`year`) -> `Ancient`. Otherwise normalize `country` (and infer from common series/title patterns like "Morgan Dollar", "Silver Eagle", "Libertad", "Maple Leaf", "Krugerrand", "Britannia", "Panda") via a curated country alias dictionary (e.g., `US`/`USA`/`U.S.`/`United States of America` -> `United States`; `Mex`/`Estados Unidos Mexicanos` -> `Mexico`). Fallback: title-cased `country` if non-empty, else `Uncategorized`.
    - For `BAR` and `ROUND`: Normalize `mint_or_refiner` (and scan `title`/`series` if `mint_or_refiner` is empty) against known refiners/pourers (e.g., `Geiger`, `Engelhard`, `Johnson Matthey`, `PAMP Suisse`, `Valcambi`, `Scottsdale Mint`, `Sunshine Minting`, `Royal Canadian Mint`, `Perth Mint`, `Silvertowne`, `Asahi`, `Monarch Precious Metals`, `Pioneer Metals`, `Germania Mint`). If `title`/`mint_or_refiner` indicates a hand-poured/custom pour without a major brand (e.g., `poured`, `hand poured`, `cast`, `artisan`), classify as `Hand-Poured` (or preserve the specific pourer name if provided in `mint_or_refiner`). Fallback: title-cased `mint_or_refiner` if non-empty, else `Uncategorized`.
- **Stage 2 (Optional Local Ollama Fallback)**:
  - Only invoked if Stage 1 yields `Uncategorized` **and** the workspace has a local `ollama_url` configured. Uses a short, structured JSON prompt to extract country/era or mint/pourer locally. Never calls external cloud APIs.

### 3. Background execution & triggers
- **Choice**: Implement `classify_item_task` as a Celery task (`@shared_task`) with a lightweight `threading.Thread` fallback when Celery/Redis is unavailable (matching `apps/valuation/services.py`), enqueued via `transaction.on_commit(...)` after item creation, CSV import, or vision identification completion, provided `workspace.auto_sort_enabled` is `True` and `item.sort_override` is `False`.
- **Rationale**: Ensures item creation/upload stays fast and non-blocking, works in both Docker/K3S (Celery) and local dev (`manage.py runserver` without Celery worker), and avoids race conditions with DB transactions via `on_commit`.

### 4. Grouped UI in `CollectionPage.tsx`
- **Choice**: Add a `"grouped"` view mode alongside `"grid"` and `"table"` (and allow filtering by `sort_category`, `sort_subcategory`, and `graded=true|false`). In `"grouped"` mode, render collapsible primary category sections (`Coins`, `Paper Currency`, `Bars / Ingots`, `Rounds`, `Other`) with sub-category sub-sections sorted alphabetically (`Uncategorized` last), showing item counts and total market/melt value per group. Items with `category in ["SLAB", "FLIPPER"]` or `grading_service != "NONE"` show a `Graded` badge.
- **Alternative Considered**: Replacing Grid/Table views entirely. Rejected so power users can still use flat Grid, Table, and bulk selection workflows unchanged.

## Risks / Trade-offs

- **[Risk] Existing items in DB have blank `sort_category`/`sort_subcategory` after migration** -> **Mitigation**: Include a data migration (or management command + automatic backfill hook) that runs Stage 1 deterministic classification synchronously or in batches on existing items where `sort_override=False`, or falls back gracefully in UI/API to `category` when `sort_category` is blank.
- **[Risk] Local Ollama endpoint slow or unavailable during bulk import** -> **Mitigation**: Stage 1 deterministic rules handle ~90%+ of common items instantly; Stage 2 Ollama fallback uses a short timeout (e.g., 5s) and only runs on single-item `Uncategorized` results, falling back cleanly to `Uncategorized` on timeout/error.
- **[Risk] Alias dictionary misses regional/obscure countries or boutique pourers** -> **Mitigation**: Preserve user-entered `mint_or_refiner` / `country` in title-case when not in the alias map rather than discarding it, and allow manual override on `ItemDetailPage.tsx`.

## Migration Plan

1. Add `auto_sort_enabled` (`BooleanField(default=True)`) to `Workspace` (`apps/accounts`).
2. Add `sort_category`, `sort_subcategory`, `sort_override`, and `sort_updated_at` to `CollectionItem` (`apps/catalog`).
3. Run a non-blocking backfill (via Django migration or management command) using the deterministic Stage 1 classifier for existing items so existing collections immediately populate `sort_category` and `sort_subcategory`.
4. Rollback: Removing the UI toggle/view and dropping the additive columns is safe; no existing `category`, `country`, or `mint_or_refiner` data is modified.


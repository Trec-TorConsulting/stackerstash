# Design

## Context

Stacker Stash currently maintains a small hardcoded tuple of 12 bullion/coin entries plus Goldback matching in `backend/apps/catalog/reference_catalog.py`, and basic cert URL formatting in `backend/apps/valuation/providers.py`. Meanwhile, `backend/apps/catalog/auto_sort.py` already classifies `Ancient` coins and multi-franchise trading cards (`Pokémon`, `Magic: The Gathering`, `Yu-Gi-Oh!`, `Disney Lorcana`, `One Piece`, `Sports`), `backend/apps/vision/services.py` hardcodes rough grading fee estimates (`~$20-$25` / `~$40`) in prompts, and `backend/config/settings.py` already runs Celery Beat with Redis.

This design expands the static reference layer into a comprehensive, offline-capable **"Collector Guru"** engine structured explicitly so that **any developer or smaller coding model can implement each module cleanly, deterministically, and at 100% test coverage** (as required by `scripts/security_and_coverage.sh`).

See [proposal.md](./proposal.md) for motivation and capability scope, and `specs/*/spec.md` for normative behavior contracts.

## Goals / Non-Goals

**Goals:**
- Provide an unambiguous two-layer architecture:
  1. **Pure-Python deterministic modules** (`backend/apps/catalog/reference_data/`) for immutable math, constants, grading rubrics, fancy serial analysis, ancient legend decoding, physical authentication, cert/barcode parsing, and capsule/sleeve fit.
  2. **6 compact Django models** (`backend/apps/catalog/reference_models.py`) seeded from bundled JSON fixtures and kept fresh by tiered Celery Beat tasks (**Weekly**, **Daily**, **Hourly**).
- Maintain 100% backward compatibility with `match_static_reference(ocr_text, hints)` and existing tests in `backend/tests/test_reference_catalog.py`.
- Keep all external network harvesting asynchronous inside Celery sync tasks with strict Pydantic validation, explicit HTTP timeouts, zero API keys required for default public feeds, and graceful fallback to bundled fixtures (tests NEVER hit the live internet).
- Mirror deterministic cert/barcode parsing, unit/density math, fancy serial analysis, and storage-fit lookup cleanly to the React/TypeScript PWA (`frontend/src/lib/`).

**Non-Goals:**
- Replacing live BYOK valuation providers (PCGS, Greysheet, PriceCharting, TCGplayer, Collectr) when a user runs a live appraisal.
- Scraping CAPTCHA/anti-bot-protected websites or requiring paid API keys for baseline static reference data.
- Duplicating the existing 5-minute `refresh_spot_prices_task` in `apps.valuation.tasks` (the new Hourly task rolls up hourly benchmarks, GSR history, and hot Redis reference caches on top of it).

---

## Architecture & Implementation Blueprint (For Any Coding Agent)

### 1. Exact File Map (Create vs. Modify)

**New Backend Modules (Pure-Python Deterministic Layer — Zero DB required):**
- `backend/apps/catalog/reference_data/__init__.py` — Re-exports public helpers.
- `backend/apps/catalog/reference_data/constants.py` — Unit conversions (`ozt`, `oz_avdp`, `g`, `kg`, `gr`, `lb`), metal densities (`g/cm³`), Sigma conductivity (`% IACS` / `MS/m`) & magnetic responses, constitutional/world silver face-value multipliers, transition-year metal cutoff detector `detect_transition_year_metal(country, denomination, year, mint_mark)`, and non-advisory US 1099-B / bullion tax reference table.
- `backend/apps/catalog/reference_data/grading.py` — Sheldon 1–70 coin & PMG 1–70 banknote scale dictionaries, strike/paper designations (`DMPL`, `PL`, `CAM`, `DCAM`, `UC`, `FB`, `FSB`, `FS`, `FBL`, `FH`, `RD`, `RB`, `BN`, `EPQ`, `PPQ`, `Star`), card condition/grade scales (`PSA`, `BGS`, `CGC`, `SGC`, `TAG`, `NM`/`LP`/`MP`/`HP`/`DMG`), official card centering rubrics, vintage slab holder generation detector (`detect_slab_generation(text)`), CAC Green/Gold Bean eligibility rules, and canonical hobby glossary lookup `lookup_glossary_term(term)`.
- `backend/apps/catalog/reference_data/cert_patterns.py` — Single source of truth for `CERT_VERIFICATION_URLS` (all 12 services: `PCGS`, `NGC`, `PMG`, `PCGS_BANKNOTE`, `CACG`, `CAC`, `ANACS`, `ICG`, `PSA`, `BGS`, `CGC`, `SGC`, `TAG`), `build_cert_verification_url(service, cert)`, and `parse_slab_barcode(raw_barcode)` regex decoder for 1D/2D/DataMatrix payloads.
- `backend/apps/catalog/reference_data/banknote_guru.py` — Pure deterministic `analyze_us_serial(serial_number)` returning `{cleaned, frb_district, frb_name, is_star_note, is_fort_worth, patterns, rarity_tier, summary}` covering Solid, Near-Solid, Radar, Super Radar, Repeater, Super Repeater, Binary, True Binary, Trinary, Ladder, Broken Ladder, Low (`<1000`), High (`>99999000`), Birthday (`MMDDYYYY`/`YYYYMMDD`), Rotator/Flipper (`01689`), Bookends, Quad Doubles, and Million; plus Goldback state/release/Alpha metadata.
- `backend/apps/catalog/reference_data/authentication.py` — Acoustic ping resonance table (`PING_FREQUENCIES_HZ`), mint security feature registry (`MINT_SECURITY_FEATURES`), and counterfeit risk checker `get_authentication_profile(ref_key_or_text)`.
- `backend/apps/catalog/reference_data/storage_fit.py` — `recommend_storage_fit(category, diameter_mm=None, series="", thickness_pt=None, grading_service="NONE")` returning Air-Tite/Lighthouse capsule codes, Mint tube/monster box counts, US 90% roll counts, card sleeve/toploader/One-Touch point sizes (`35pt`–`360pt`), and outer slab dimensions (`mm`).
- `backend/apps/catalog/reference_data/ancient.py` — Roman/Byzantine/Greek ruler reign table, Latin/Greek legend decoder `decode_ancient_legend(text)`, denomination metal/weight norms, and catalog prefixes (`RIC`, `Crawford`, `Sear`, `RPC`, `SNG`, `DOC`).

**New Backend Database Models, Fixtures, Sync Engine & Command:**
- `backend/apps/catalog/reference_models.py` — 6 Django models (schema detailed below), imported into `backend/apps/catalog/models.py` so `makemigrations catalog` generates clean migrations.
- `backend/apps/catalog/fixtures/reference/` — Version-controlled JSON seed files:
  - `numismatics.json` (US/World coins, sovereign bullion, Engelhard/JM vintage bars, top VAM/FS/CONECA varieties & errors, iconic ancient coins)
  - `banknotes.json` (US Friedberg & World Pick notes, BEP scarce Star Note print runs, sample National Bank charters, Goldback state series)
  - `trading_cards.json` (Seed sets & iconic checklists across Pokémon, MTG, Yu-Gi-Oh!, Disney Lorcana, One Piece, and flagship Sports Cards + parallel taxonomy)
  - `grading_reference.json` (Published fee tiers & shipping buffers for PCGS, NGC, PMG, CACG, ANACS, PSA, BGS, CGC, SGC, TAG + sample pop baselines)
- `backend/apps/catalog/reference_sync.py` — Pydantic v2 schemas for fixture/upstream validation, fixture loader `seed_static_reference_catalog()`, and idempotent sync adapters for Weekly, Daily, and Hourly tiers (using `httpx.Client(timeout=15.0)` with strict schema validation and per-source fault isolation).
- `backend/apps/catalog/tasks.py` — Celery `@shared_task` wrappers:
  - `apps.catalog.tasks.sync_weekly_static_catalog_task`
  - `apps.catalog.tasks.sync_daily_reference_baselines_task`
  - `apps.catalog.tasks.sync_hourly_market_baselines_task`
- `backend/apps/catalog/management/commands/seed_static_reference.py` — Idempotent CLI command (`--tier=seed|weekly|daily|hourly`, `--offline`) for deploys, local setup, and manual refresh.
- `backend/apps/catalog/reference_api.py` — Django Ninja `reference_router` mounted at `/api/v1/catalog/reference` (or registered on `catalog_router` with `/reference/*` prefix).

**Existing Backend Files to Modify:**
- `backend/apps/catalog/models.py` — Re-export the 6 models from `reference_models.py`.
- `backend/apps/catalog/admin.py` — Register the 6 static reference models in Django Admin with list filters and search fields.
- `backend/apps/catalog/reference_catalog.py` — Upgrade `match_static_reference(ocr_text, hints)` to check Redis (`ref:match:<sha256>`) → DB tables (`StaticNumismaticSpec`, `StaticBanknoteSpec`, `StaticCardSpec`) → built-in fallback tuple, enriching `specs` with transition-year metal, varieties, fancy serial analysis, ancient legend decoding, ping/security/counterfeit profile, and storage fit.
- `backend/apps/catalog/auto_sort.py` — Check static reference match before heuristic keyword fallback.
- `backend/apps/catalog/api.py` — Mount `reference_router` (or include `/reference/*` endpoints).
- `backend/apps/valuation/providers.py` — Import `CERT_VERIFICATION_URLS` and `build_cert_verification_url` from `apps.catalog.reference_data.cert_patterns` (eliminating duplication) and add `CAC` support.
- `backend/apps/valuation/services.py` — Add helper `compute_grading_roi_usd(item, raw_value, graded_value)` using `StaticGradingReference` fee tiers and helper `convert_to_usd(amount, currency)` using `StaticMarketBaseline` FX rates.
- `backend/config/settings.py` — Add the 3 new `CELERY_BEAT_SCHEDULE` entries using `celery.schedules.crontab`.

**New & Modified Frontend Files (Verified Actual Repo Paths):**
- `frontend/src/lib/certPatterns.ts` — TypeScript mirror of cert verification URL templates + 1D/2D barcode/DataMatrix cert parser.
- `frontend/src/lib/referenceUtils.ts` — Offline unit/density converter, US Fancy Serial Number instant analyzer, and Air-Tite capsule / card point-thickness storage-fit helper.
- `frontend/src/lib/api.ts` — Add typed API clients for `/api/v1/catalog/reference/*` endpoints.
- `frontend/src/components/valuation/NumismaticSpecsCard.tsx` — Add `STATIC_CATALOG` provenance badge, physical authentication drawer (ping Hz, conductivity, security features, counterfeit alert banner), Air-Tite capsule/tube badge, and banknote fancy-serial / Star Note scarcity pills.
- `frontend/src/components/valuation/CardSpecsCard.tsx` — Add `STATIC_CATALOG` provenance badge, card protection point-thickness (`35pt`–`360pt`) & dimension badge, and print-run/parallel diagnostic notes.
- `frontend/src/components/valuation/EstimatedGradeCard.tsx` — Enable rendering for `CARD` items (currently `RAW_GRADEABLE_CATEGORIES` only lists `COIN`, `PAPER`, `FLIPPER`, `ROUND`), show official centering rubric hints for cards, and display fee-schedule provenance for `grading_upside_usd`.

---

### 2. Exact Database Model Schemas (`backend/apps/catalog/reference_models.py`)

All 6 models use `UUIDField(primary_key=True, default=uuid.uuid4, editable=False)`, explicit `db_index=True` on query keys, and `sync_tier` (`STATIC`, `WEEKLY`, `DAILY`, `HOURLY`).

| Model | Key Fields & Types | Indexes / Uniqueness |
| :--- | :--- | :--- |
| `StaticNumismaticSpec` | `ref_key` (CharField 120, unique), `item_kind` (`COIN`\|`BULLION`\|`VINTAGE_BAR`\|`VARIETY`\|`ANCIENT`), `title` (200), `country` (100), `series` (120), `denomination` (64), `year_start` (Int null), `year_end` (Int null), `mint_or_refiner` (120), `valid_mint_marks` (JSON list), `metal_type` (16), `purity` (Decimal 7,6), `weight_value` (Decimal 14,6), `weight_unit` (12), `fine_troy_oz` (Decimal 14,6), `gross_weight_grams` (Decimal 10,4 null), `diameter_mm` (Decimal 8,2 null), `thickness_mm` (Decimal 8,2 null), `edge_type` (64), `composition` (120), `mintage` (BigInt null), `is_key_date` (Bool), `is_high_counterfeit_risk` (Bool), `catalog_numbers` (JSON dict), `keywords` (JSON list), `secondary_keywords` (JSON list), `extra_specs` (JSON dict), `sync_tier` (12), `source_name` (64), `last_synced_at` (DateTime) | `ref_key` unique; composite `(item_kind, country, series)`, `(country, denomination)` |
| `StaticBanknoteSpec` | `ref_key` (CharField 120, unique), `record_kind` (`BANKNOTE`\|`STAR_RUN`\|`CHARTER`\|`GOLDBACK`), `country` (100), `title` (200), `series` (64), `denomination` (64), `friedberg_number` (32), `pick_number` (32), `charter_number` (Int null), `frb_district` (16), `seal_color` (32), `size_class` (`LARGE`\|`SMALL`\|`WORLD`\|`GOLDBACK`), `width_mm` (Decimal 8,2 null), `height_mm` (Decimal 8,2 null), `signatures` (JSON list), `serial_range_start` (BigInt null), `serial_range_end` (BigInt null), `print_run_size` (BigInt null), `is_scarce_run` (Bool), `keywords` (JSON list), `extra_specs` (JSON dict), `sync_tier` (12), `source_name` (64), `last_synced_at` (DateTime) | `ref_key` unique; `(record_kind, country, denomination)`, `(friedberg_number)`, `(charter_number)` |
| `StaticCardSpec` | `ref_key` (CharField 120, unique), `card_game` (64), `set_name` (160), `set_code` (32), `card_number` (32), `card_name` (200), `release_year` (Int null), `rarity` (64), `card_finish` (64), `card_edition` (64), `language` (32), `artist` (120), `width_mm` (Decimal 6,2 default 63.50), `height_mm` (Decimal 6,2 default 88.90), `thickness_pt` (SmallInt default 35), `external_ids` (JSON dict), `keywords` (JSON list), `extra_specs` (JSON dict), `sync_tier` (12), `source_name` (64), `last_synced_at` (DateTime) | `ref_key` unique; `(card_game, set_code, card_number)`, `(card_game, set_name)` |
| `StaticGradingReference` | `ref_key` (CharField 120, unique), `record_kind` (`FEE_SCHEDULE`\|`POPULATION`), `grading_service` (20), `asset_class` (`COIN`\|`PAPER`\|`CARD`), `tier_name` (64), `fee_usd` (Decimal 8,2 null), `max_declared_value_usd` (Decimal 12,2 null), `shipping_buffer_usd` (Decimal 8,2 default 15.00), `turnaround_days` (SmallInt null), `catalog_ref_key` (120), `grade` (32), `total_population` (Int null), `population_higher` (Int null), `extra_specs` (JSON dict), `sync_tier` (12), `source_name` (64), `last_synced_at` (DateTime) | `ref_key` unique; `(record_kind, grading_service, asset_class)`, `(catalog_ref_key, grading_service, grade)` |
| `StaticMarketBaseline` | `ref_key` (CharField 120, unique), `metric_kind` (`FX_RATE`\|`HISTORICAL_SPOT`\|`HOURLY_BENCHMARK`), `symbol` (16), `as_of_date` (Date), `as_of_timestamp` (DateTime), `value` (Decimal 14,6), `extra_metrics` (JSON dict), `source_name` (64), `last_synced_at` (DateTime) | `ref_key` unique; `(metric_kind, symbol, -as_of_date)` |
| `ReferenceSyncLog` | `sync_tier` (`SEED`\|`WEEKLY`\|`DAILY`\|`HOURLY`), `source_name` (64), `status` (`RUNNING`\|`SUCCESS`\|`PARTIAL`\|`FAILED`), `records_upserted` (Int), `records_skipped` (Int), `error_message` (Text), `started_at` (DateTime), `completed_at` (DateTime null) | `(sync_tier, -started_at)` |

---

### 3. JSON Fixture Schema Examples (`backend/apps/catalog/fixtures/reference/`)

Every fixture file MUST be a JSON array of flat objects matching its Pydantic schema in `reference_sync.py`. Example record per file:

- `numismatics.json`:
```json
{
  "ref_key": "us_morgan_1893_s",
  "item_kind": "COIN",
  "title": "1893-S Morgan Silver Dollar",
  "country": "United States",
  "series": "Morgan Dollar",
  "denomination": "$1",
  "year_start": 1893,
  "year_end": 1893,
  "mint_or_refiner": "U.S. Mint (San Francisco)",
  "valid_mint_marks": ["S"],
  "metal_type": "SILVER",
  "purity": "0.900000",
  "weight_value": "0.773440",
  "weight_unit": "OZ_T",
  "gross_weight_grams": "26.7300",
  "diameter_mm": "38.10",
  "thickness_mm": "2.40",
  "edge_type": "Reeded",
  "composition": "90% Silver, 10% Copper",
  "mintage": 100000,
  "is_key_date": true,
  "is_high_counterfeit_risk": true,
  "catalog_numbers": {"PCGS": "7226", "KM": "110"},
  "keywords": ["1893-S MORGAN", "1893 S MORGAN DOLLAR"],
  "secondary_keywords": ["MORGAN", "ONE DOLLAR"],
  "extra_specs": {"ping_hz": [5920, 11850], "key_tier": "KEY_DATE", "diagnostics": ["Slanted 1 over denticle", "Die scratch in T of LIBERTY"]}
}
```
- `banknotes.json`:
```json
{
  "ref_key": "us_star_2013_1_b_run1",
  "record_kind": "STAR_RUN",
  "country": "United States",
  "title": "2013 $1 Federal Reserve Star Note (B - New York, Run 1)",
  "series": "2013",
  "denomination": "$1",
  "frb_district": "B",
  "seal_color": "Green",
  "size_class": "SMALL",
  "width_mm": "156.00",
  "height_mm": "66.30",
  "serial_range_start": 1,
  "serial_range_end": 250000,
  "print_run_size": 250000,
  "is_scarce_run": true,
  "keywords": ["2013 $1 STAR B"],
  "extra_specs": {"facility": "FW", "duplicate_run_alert": true}
}
```
- `trading_cards.json`:
```json
{
  "ref_key": "pokemon_base_4_102",
  "card_game": "Pokémon",
  "set_name": "Base Set",
  "set_code": "BS",
  "card_number": "4/102",
  "card_name": "Charizard",
  "release_year": 1999,
  "rarity": "Holo Rare",
  "card_finish": "Holo",
  "card_edition": "1st Edition / Shadowless / Unlimited",
  "language": "English",
  "artist": "Mitsuhiro Arita",
  "width_mm": "63.50",
  "height_mm": "88.90",
  "thickness_pt": 35,
  "external_ids": {"pokemon_tcg_id": "base1-4", "pricecharting_id": "pokemon-base-set-charizard-4"},
  "keywords": ["CHARIZARD 4/102", "BASE SET CHARIZARD"],
  "extra_specs": {"is_high_counterfeit_risk": true, "print_run_markers": ["1st Ed stamp left of frame", "Shadowless has no right border drop shadow and 1995,96,98,99 copyright"]}
}
```

---

### 4. Tiered Sync Cadences & Public Free Data Sources

Configured in `backend/config/settings.py` inside `CELERY_BEAT_SCHEDULE`:

| Schedule Name | Celery Beat Schedule | Task | Sources & Behavior |
| :--- | :--- | :--- | :--- |
| `sync-weekly-static-catalog` | `crontab(minute=0, hour=3, day_of_week=0)` (Sun 03:00 UTC) | `apps.catalog.tasks.sync_weekly_static_catalog_task` | 1) Seed/upsert local curated fixtures (coins, varieties, bullion, Engelhard/JM, banknotes, Star Note runs, charters, Goldbacks, ancient, grading fees). 2) Free public set feeds (no key required): Scryfall sets (`https://api.scryfall.com/sets`), Pokémon TCG sets (`https://api.pokemontcg.io/v2/sets`), YGOProDeck cardsets (`https://db.ygoprodeck.com/api/v7/cardsets.php`), optional env-configured Lorcana/One Piece JSON URLs. 3) Bust Redis prefix `ref:match:*`. |
| `sync-daily-reference-baselines` | `crontab(minute=0, hour=4)` (Daily 04:00 UTC) | `apps.catalog.tasks.sync_daily_reference_baselines_task` | 1) Frankfurter ECB FX rates (`https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,CAD,MXN,AUD,CHF,JPY`). 2) Archive EOD `SpotPriceSnapshot` rows + daily Gold/Silver Ratio into `StaticMarketBaseline` (`HISTORICAL_SPOT`). 3) Aggregate cached verified cert populations from `CertLookupCache` into `StaticGradingReference` (`POPULATION`). |
| `sync-hourly-market-baselines` | `crontab(minute=5)` (Hourly at `:05`) | `apps.catalog.tasks.sync_hourly_market_baselines_task` | 1) Compute hourly spot benchmark + live GSR + 24h drift from `SpotPriceSnapshot` into `StaticMarketBaseline` (`HOURLY_BENCHMARK`). 2) Warm hot Redis cache key `ref:market:latest` (TTL 7200s). |

**Sync Safety Contract**:
- Every external HTTP adapter uses `httpx.Client(timeout=15.0)`, validates every record via Pydantic v2, wraps upserts in per-source `try/except`, and records a `ReferenceSyncLog` row (`SUCCESS`, `PARTIAL`, or `FAILED`).
- If an external source fails, existing DB rows are NEVER deleted or overwritten.
- In pytest, all outbound `httpx` calls MUST be mocked; `seed_static_reference --offline` runs strictly against local fixtures.

---

### 5. REST API Contract (`/api/v1/catalog/reference/*`)

All endpoints require `WorkspaceAuth()` (read-only lookup endpoints allow any authenticated workspace member):

- `GET /api/v1/catalog/reference/lookup?q=<text>&category=<optional>&limit=10` → Searches Redis/DB across `StaticNumismaticSpec`, `StaticBanknoteSpec`, `StaticCardSpec` and returns `{matches: [...], source: "STATIC_CATALOG"}`.
- `POST /api/v1/catalog/reference/analyze-serial` (body: `{serial_number, series?, denomination?}`) → Returns deterministic fancy serial patterns, rarity tier, FRB district, facility, and matching BEP Star Note print-run scarcity.
- `GET /api/v1/catalog/reference/storage-fit?category=COIN&diameter_mm=40.6&series=&thickness_pt=35&grading_service=NONE` → Returns capsule code, Mint tube/box capacity, card sleeve/toploader/One-Touch point size, and slab dimensions.
- `GET /api/v1/catalog/reference/grading-roi?asset_class=COIN&grading_service=PCGS&raw_value_usd=150&graded_value_usd=300` → Returns fee tier, shipping buffer, net `grading_upside_usd`, centering rubric (for cards), and `recommend_grading` boolean.
- `GET /api/v1/catalog/reference/glossary?term=<q>` → Returns matching hobby glossary terms and ancient Latin/Greek legend expansions.
- `GET /api/v1/catalog/reference/market-baselines?days=30` → Returns latest FX rates, hourly GSR benchmark, and historical EOD spot curve.
- `GET /api/v1/catalog/reference/sync-status` → Returns latest `ReferenceSyncLog` summary per tier (`WEEKLY`, `DAILY`, `HOURLY`, `SEED`) and row counts.

---

## Decisions

### Decision 1: Pure-Python Deterministic Modules + 6 Compact Syncable Models (Instead of 20+ Models)
- **Choice**: Keep truly immutable rules/constants (unit math, densities, ping Hz, fancy serial detection, ancient legend abbreviations, capsule sizing, grading scales, cert regexes, hobby glossary) in pure-Python modules under `backend/apps/catalog/reference_data/`, and store large/syncable tables in 6 clean Django models.
- **Rationale**: Eliminates database round-trips for pure deterministic math, avoids migration sprawl, makes it dramatically easier for smaller coding models to navigate, and keeps 100% pytest branch coverage clean and fast.
- **Alternative Considered**: Putting every lookup table in its own Django model (rejected: 18+ models creates unnecessary boilerplate and complicates migrations/tests without benefit for static physics constants).

### Decision 2: Free Zero-Key Public Endpoints + Bundled Offline Seed Fixtures
- **Choice**: Ship curated JSON fixtures in git (`backend/apps/catalog/fixtures/reference/`) and sync weekly/daily against free, keyless APIs (Scryfall, Pokémon TCG, YGOProDeck, Frankfurter ECB).
- **Rationale**: Self-hosted HomeLab K3s installs work completely offline out of the box without requiring paid third-party subscriptions, while internet-connected instances stay fresh automatically.
- **Alternative Considered**: Paid wholesale data feeds (rejected as hard dependency; BYOK paid providers remain optional in `apps.valuation.providers`).

### Decision 3: Single Source of Truth for Cert Patterns & Offline Frontend Parity
- **Choice**: Extract cert URLs and 1D/2D barcode regexes out of `apps/valuation/providers.py` into `apps/catalog/reference_data/cert_patterns.py` and mirror identical patterns in `frontend/src/lib/certPatterns.ts`.
- **Rationale**: Allows instant client-side barcode/cert extraction and deep-link rendering in the PWA without round-tripping to the backend or invoking Vision AI.

---

## Risks / Trade-offs

- **[Risk] 100% Coverage Gate Failure on Large Sync Adapters** → Keep sync adapters modular with small pure-function parsers (`parse_scryfall_set`, `parse_frankfurter_fx`, etc.) and write mocked `httpx` tests covering both happy-path and error-path branches in every task group.
- **[Risk] Upstream Public API Rate Limits or Schema Drift** → Enforce `timeout=15.0`, strict Pydantic validation, per-source fault isolation, and preserve previous DB rows on error; log all anomalies to `ReferenceSyncLog`.
- **[Risk] Large Fixture / DB Size Slowing SQLite Local Dev & Tests** → Keep bundled JSON seed fixtures concise and high-signal (~150–300 iconic/most-collected entries across all domains, with full external set indexes populated via weekly sync) and use composite DB indexes + Redis hot caching.
- **[Risk] Stale Grading Fees or Tax Thresholds** → Display `last_synced_at` metadata on grading ROI breakdowns and explicitly label tax thresholds as informational / non-advisory.

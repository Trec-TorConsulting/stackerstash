# Proposal

## Why

Relying on Vision AI (Gemini Vision / Ollama) and live external APIs for item identification, physical specifications, authentication checks, serial analysis, grading ROI, and storage sizing is slow, token-expensive, rate-limit vulnerable, and unusable offline. Across coins, bullion, ancient coinage, paper currency, and trading cards, the vast majority of collector knowledge consists of immutable historical specifications, deterministic rules, or slowly changing reference catalogs.

By building a comprehensive, offline-first "Collector Guru" static reference knowledge base paired with a tiered Celery Beat synchronization engine (**Static/Annual** immutable tables, **Weekly** catalog checklists & fee schedules, **Daily** population reports / FX rates / EOD spot archives / new set releases, and **Hourly** volatile spot & GSR rollups), Stacker Stash becomes the authoritative source of truth across every collectible domain it supports—resolving 80%+ of scans, barcodes, serial checks, and spec lookups locally with zero AI tokens and sub-millisecond latency.

## What Changes

- **Core Static Reference Datasets (Original 7 Areas)**:
  - **Coin Specifications**: US Mint & World coinage (KM/Numista) with gross/net precious-metal weight (ASW/AGW), composition, diameter, thickness, edge style, and valid year/mint-mark sets.
  - **Bullion & Ingots**: Standard sovereign bullion series (Eagles, Maples, Krugerrands, Philharmonics, Britannias, Libertads, Pandas) and standard bar denominations (`1g`–`400 ozt`) with refiner hallmarks.
  - **Paper Currency / Banknotes**: US & World catalog mapping Friedberg (`Fr.`) and Pick (`P.`) numbers, seal types/colors, large vs. small dimensions, and Treasury signature combinations.
  - **Trading Cards (Multi-Franchise + Sports)**: Static checklists, set codes, card numbers, rarities, finishes/parallels, and external cross-references across **Pokémon, Magic: The Gathering, Yu-Gi-Oh!, Disney Lorcana, One Piece**, and **Sports Cards** (Topps, Bowman, Panini, Upper Deck).
  - **Grading Scales & Modifiers**: Sheldon 1–70 coin/PMG scales, coin strike designations (`DMPL`, `PL`, `CAM`, `DCAM`, `UC`, `FB`, `FSB`, `FS`, `FBL`, `FH`, `RD`/`RB`/`BN`), banknote designations (`EPQ`, `PPQ`, `Star`), and card scales (`PSA 1–10`, `BGS`, `CGC`, `SGC`, `TAG 1000-pt`, raw `NM`/`LP`/`MP`/`HP`/`DMG`).
  - **Cert Verification & Client Barcode Patterns**: Deterministic deep-link URLs (`PCGS`, `NGC`, `PMG`, `PCGS_BANKNOTE`, `CACG`, `CAC`, `ANACS`, `ICG`, `PSA`, `BGS`, `CGC`, `SGC`, `TAG`) and shared backend/frontend 1D/2D barcode & DataMatrix regex decoders.
  - **Mintage, Key Dates & Physical Constants**: Historical mintage figures, key/semi-key date flags, metal densities/specific gravity, and high-precision unit conversion constants (`ozt`, `oz`, `g`, `kg`, `gr`, `lb`).
- **Collector Guru Knowledge Extensions (9 Source-of-Truth Additions)**:
  1. **Error Coins, Die Varieties & Transition-Year Metal Cutoffs**: Top VAMs (Morgan/Peace), Cherrypickers' Guide (`FS`), CONECA (`DDO`/`DDR`/`RPM`/`OMM`), error coin diagnostic checklists, and silver/copper transition-year cutoffs (US 90%/40%/35%/copper cents, CA/UK/MX/CH silver).
  2. **Ancient & Historical Coinage**: Roman/Byzantine/Greek ruler & dynasty reign tables, Latin/Greek obverse legend abbreviation decoder (`IMP CAES`, `AVG`, `P M TR P`, `COS`, `S C`), ancient denomination weight/metal standards, and catalog prefixes (`RIC`, `Crawford`, `Sear`, `RPC`, `SNG`).
  3. **Paper Currency Guru Engine**: Deterministic Fancy Serial Number detector & rarity scorer (Solid, Radar, Repeater, Binary, Ladder, Low/High, Birthday, Rotator, Bookends, Quad Doubles), BEP Star Note print-run rarity tables, Federal Reserve District (`A1`–`L12`) & facility (`FW`/DC) mapping, National Bank Charter directory (`1`–`14348`), complete Goldback state/Alpha matrix, and ISO 4217 / demonetized currency reference.
  4. **Expanded TCG, Sports Taxonomy & Official Card Grading Rubrics**: Free public TCG dumps (Pokémon, MTG/Scryfall, Yu-Gi-Oh!/YGOProDeck, Disney Lorcana, One Piece), Sports parallel/insert dictionary (`Refractor`, `Silver Prizm`, `Superfractor 1/1`, `RPA`, `SSP`, `Kaboom`, `Downtown`), vintage card dimensions (`T206`, `1952 Topps`, `Tall Boys`), print-run markers (Shadowless, Alpha/Beta/Unlimited), and official PSA/BGS/CGC/SGC/TAG centering tolerance rubrics.
  5. **Counterfeit Diagnostics, Acoustic Ping & Security Features**: Coin acoustic ping resonance frequencies (`f1`/`f2`/`f3` Hz), magnetic/diamagnetic & Sigma Metalytics conductivity (`% IACS` / `MS/m`) tables, mint security features registry (RCM Bullion DNA, Britannia latent image, Type 2 ASE missing reed, Geiger UV/ribbed edge, PAMP Veriscan), and High-Risk Counterfeit Alert flags.
  6. **Vintage Bullion Hallmarks & Constitutional Silver Multipliers**: Engelhard & Johnson Matthey serial prefix/variant rarity guides, LBMA refiner directory, and exact constitutional silver multipliers (`0.715` / `0.7234 ozt` per \$1 FV, etc.).
  7. **Grading Service Fee Schedules, Vintage Slab Generations & CAC Rules**: Published fee tiers & declared-value ceilings powering deterministic `grading_upside_usd` ROI math, vintage holder identifiers (PCGS Rattler, Doily, OGH, NGC Fatty, PSA Old Flip), and CAC Green/Gold Bean rules.
  8. **Storage, Capsule, Tube & Sleeve Compatibility Matrix**: Air-Tite/Lighthouse capsule recommendations from `diameter_mm`, standard Mint tube & monster box capacities, trading card `35pt`–`360pt` sleeve/toploader/One-Touch sizing, and outer slab dimensions.
  9. **Historical Spot Baselines, Multi-Currency FX, Hobby Glossary & Tax Reference**: Daily ECB fiat FX rates, daily EOD historical spot & Gold/Silver Ratio (GSR) archive, hourly volatile spot/GSR rollups, canonical hobby abbreviation/glossary decoder, and non-advisory US 1099-B / bullion tax reference thresholds.
- **Tiered Background Sync Engine (Celery Beat)**:
  - **Static / Annual**: Version-controlled deterministic Python reference modules & seed fixtures (zero external calls required for offline/test operation).
  - **Weekly (Sundays 03:00 UTC)**: Refreshes numismatic/bullion/banknote/variety/charter/Star Note/Goldback/fee fixtures and open TCG catalog indexes (Scryfall, Pokémon TCG, YGOProDeck, Lorcana, One Piece).
  - **Daily (04:00 UTC)**: Syncs fiat FX rates (Frankfurter/ECB), EOD historical spot & GSR baselines, newly published sets, and cached grading population rollups.
  - **Hourly (`:05` past every hour)**: Computes volatile spot benchmark & GSR rollups and refreshes hot Redis lookup caches (complementing the existing 5-minute spot quote task).

## Capabilities

### Modified Capabilities
- `server-reference-cache`: Expanding the static collectible catalog with coins, varieties/errors, ancient coinage, bullion & vintage hallmarks, banknotes (fancy serials, Star Note runs, charters, Goldbacks), authentication/ping/counterfeit metrics, grading fees & vintage holders, storage compatibility, FX/historical spot/glossary data, cert/barcode patterns, and the tiered (Weekly/Daily/Hourly) synchronization engine.
- `trading-card-specs-and-catalog`: Expanding trading card reference coverage to all supported franchises (Pokémon, Magic: The Gathering, Yu-Gi-Oh!, Disney Lorcana, One Piece, and Sports Cards), physical card dimensions & point-thickness protection sizing, print-run/parallel identifiers, official grading centering rubrics, and tiered weekly/daily TCG catalog synchronization.

## Impact

- **Backend**:
  - New pure-Python deterministic package `backend/apps/catalog/reference_data/` (`constants.py`, `grading.py`, `cert_patterns.py`, `banknote_guru.py`, `authentication.py`, `storage_fit.py`, `ancient.py`).
  - 6 new database models in `backend/apps/catalog/reference_models.py` (`StaticNumismaticSpec`, `StaticBanknoteSpec`, `StaticCardSpec`, `StaticGradingReference`, `StaticMarketBaseline`, `ReferenceSyncLog`) re-exported in `backend/apps/catalog/models.py` with Django migrations and seed fixtures in `backend/apps/catalog/fixtures/reference/`.
  - Management command `seed_static_reference` + Celery Beat tasks in `backend/apps/catalog/tasks.py` wired into `backend/config/settings.py`.
  - New Django Ninja endpoints under `/api/v1/catalog/reference/*` and upgraded local matching in `backend/apps/catalog/reference_catalog.py`, `backend/apps/catalog/auto_sort.py`, `backend/apps/valuation/providers.py`, and `backend/apps/valuation/services.py`.
- **Frontend / PWA**:
  - New offline utilities `frontend/src/lib/certPatterns.ts` and `frontend/src/lib/referenceUtils.ts` (barcode/cert extraction, cert URL builder, unit/density conversions, fancy serial analyzer, capsule/pt-size fit).
  - UI enrichments in `frontend/src/components/valuation/NumismaticSpecsCard.tsx`, `CardSpecsCard.tsx`, and `EstimatedGradeCard.tsx`.
- **AI & External APIs**:
  - Eliminates redundant Vision AI and external API calls for standard items, barcodes, serial checks, capsule sizing, and fee-based grading ROI while preserving full offline capability and 100% test coverage.

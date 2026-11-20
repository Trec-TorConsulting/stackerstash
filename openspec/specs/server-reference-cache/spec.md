# server-reference-cache Specification

## Purpose
Provides a server-hosted static reference catalog for common coins, bullion, Goldbacks, and grading slabs, paired with perceptual-hash and certification caches so repeated lookups and standard items resolve locally without external API or AI calls.

## Requirements

### Requirement: Server-hosted static collectible reference catalog
The system SHALL maintain an authoritative, server-side static reference dataset covering US and world coins, bullion rounds and bars, Goldback denominations and state series, paper banknotes, constitutional silver, grading slab formats, mintage figures, and physical constants, and expose fast local matching against extracted text and hints.

#### Scenario: Match standard bullion or Goldback from extracted text
- **WHEN** local OCR or barcode parsing extracts identifying text such as a Goldback state and denomination or a standard bullion weight, purity, and series
- **THEN** the server resolves category, title, country, denomination, metal type, weight, purity, and physical specs directly from the static reference catalog with zero AI tokens

#### Scenario: Match standard coin specifications and physical metrics
- **WHEN** item details or extracted text match a cataloged US or world coin entry (e.g., Morgan Dollar, Walking Liberty Half, British Sovereign)
- **THEN** the system retrieves gross weight, net precious metal weight (ASW/AGW), composition, diameter, thickness, edge style, mintage, key-date flag, and valid mint marks without external API or AI calls

#### Scenario: Match paper banknote catalog and signature attributes
- **WHEN** extracted text or manual input specifies a US or world banknote series, denomination, or catalog number (Friedberg or Pick number)
- **THEN** the system resolves seal type and color, size class and dimensions, and Treasury signature combination directly from the static banknote dataset

#### Scenario: Resolve grading designations and physical constants
- **WHEN** an item includes a Sheldon 1–70 grade, strike/paper designation (e.g., DMPL, FS, FB, FBL, EPQ, PPQ, Star), or weight/density conversion query
- **THEN** the system validates the modifier against the static grading dictionary and computes exact weights and densities using hardcoded physical constants

#### Scenario: No confident static catalog match
- **WHEN** extracted hints do not meet the match threshold for any static reference entry
- **THEN** the system returns no static match and allows downstream identification tiers to proceed

### Requirement: Perceptual image hash identification cache
The system SHALL cache successful item identification candidates keyed by normalized image content hash (SHA-256) and perceptual hash (`dHash`) so identical or visually equivalent re-submissions return immediately without calling AI providers.

#### Scenario: Exact or perceptual image cache hit
- **WHEN** a user submits an image whose SHA-256 or `dHash` matches a previously identified candidate in the workspace or shared cache
- **THEN** the system returns the cached candidate metadata immediately with zero external AI calls

### Requirement: Grading certification and numismatic metadata cache
The system SHALL cache verified grading slab certification lookups and external numismatic catalog enrichment responses on the server so repeated lookups resolve from cache while scoping BYOK-derived and free-text numismatic query caches per workspace using full SHA-256 query keys to prevent cross-vault cache poisoning or BYOK data leakage.

#### Scenario: Repeated lookup for an already cached certification number
- **WHEN** an item or intake submission references a grading service and certification number already present in the workspace's server cache
- **THEN** the system returns the cached grade, designation, and coin metadata without making an external network request

#### Scenario: Free-text or BYOK numismatic lookup cached strictly within the originating vault
- **WHEN** Vault A executes a BYOK numismatic or cert lookup (such as a Numista query or PCGS cert query using Vault A's BYOK key)
- **THEN** the cached payload is scoped to Vault A (or keyed so Vault B without access cannot read or collide with Vault A's free-text query cache)

### Requirement: Error coins, die varieties, and transition-year metal rules
The system SHALL maintain static reference entries for major coin die varieties (VAM, Cherrypickers' FS, CONECA DDO/DDR/RPM/OMM), error coin diagnostic checklists, and deterministic metal transition-year rules for US and world circulating coinage.

#### Scenario: Detect transition-year silver or copper composition locally
- **WHEN** an item is identified as a US coin with a transition-sensitive year (such as a 1964 quarter, 1967 Kennedy half dollar, 1943-P War Nickel, or 1981 Lincoln cent)
- **THEN** the system deterministically resolves its silver or copper alloy composition and fine metal content without calling AI or external APIs

#### Scenario: Surface known die variety and error diagnostics
- **WHEN** a coin matches a date and mint mark with cataloged major varieties (e.g., 1955 DDO Lincoln Cent, 1878 8TF Morgan VAM, 1937-D 3-Legged Buffalo)
- **THEN** the lookup response includes matching cataloged varieties and physical diagnostic checkpoints (such as weight or magnetism criteria)

### Requirement: Ancient and historical coinage reference
The system SHALL maintain static reference tables for ancient coinage covering Roman, Byzantine, and Greek rulers and reign periods, standard denomination metal/weight norms, catalog prefixes (RIC, Crawford, Sear, RPC, SNG), and Latin/Greek legend abbreviations.

#### Scenario: Decode ancient coin Latin legend abbreviations
- **WHEN** OCR text or user input contains standard Roman obverse abbreviations such as `IMP CAES`, `AVG`, `P M TR P`, `COS`, or `S C`
- **THEN** the system expands the legend abbreviations and maps matching ruler names to their historical reign date range locally with zero AI tokens

#### Scenario: Retrieve ancient denomination weight standards
- **WHEN** an ancient coin item references a standard denomination such as Denarius, Solidus, Sestertius, or Attic Tetradrachm
- **THEN** the system returns its typical metal, historical weight standard in grams, and applicable reference catalog prefixes

### Requirement: Paper currency fancy serial, Star Note, and charter analysis
The system SHALL deterministically analyze US paper currency serial numbers for fancy patterns and rarity tiers, resolve Federal Reserve Bank districts and print facilities, look up BEP Star Note print-run scarcity, and map National Bank Charter numbers.

#### Scenario: Detect fancy serial patterns with zero AI
- **WHEN** a user submits or saves a US banknote with a serial number such as `B 77777777 A`, `E 12344321 C`, or `L 00000042 *`
- **THEN** the system deterministically classifies matching fancy patterns (Solid, Radar, Low Serial, Binary, Ladder, Repeater, Birthday, Rotator, Bookends), assigns a rarity tier, and resolves the Federal Reserve Bank district (`B` = New York, `E` = Richmond, `L` = San Francisco)

#### Scenario: Evaluate BEP Star Note print-run scarcity
- **WHEN** a US banknote has a star (`*`) suffix matching a cataloged series, denomination, district, and serial range in the BEP Star Note reference table
- **THEN** the system returns the official run size (e.g., `320,000` vs. `3,200,000`) and flags scarce print runs locally

#### Scenario: Resolve National Bank Charter and Goldback matrix
- **WHEN** a note provides a US National Bank Charter number or a Goldback state and year
- **THEN** the system resolves the chartered bank name/city/state or the Goldback state series, Alpha/first-year flag, and exact 24K gold weight (`denomination / 1000` ozt)

### Requirement: Physical authentication, acoustic ping, and counterfeit alerts
The system SHALL store physical authentication reference metrics—including coin acoustic ping frequencies (Hz), magnetic response, Sigma electrical conductivity (% IACS / MS/m), mint security features, and high-risk counterfeit alert flags.

#### Scenario: Display authentication metrics for a bullion or classic coin
- **WHEN** a collector views or queries a cataloged coin or bar (such as a 2024 American Silver Eagle, Canadian Silver Maple Leaf, or Morgan Dollar)
- **THEN** the system exposes expected ping frequencies (Hz), magnetic/conductivity properties, and mint anti-counterfeit features (such as Type 2 missing-reed notch or RCM Bullion DNA)

#### Scenario: Trigger high-risk counterfeit checklist warning
- **WHEN** an item matches a cataloged high-counterfeit-risk issue (such as 1909-S VDB cent, 1893-S Morgan Dollar, or 1 oz PAMP Fortuna in assay)
- **THEN** the system flags `is_high_counterfeit_risk=true` and surfaces authentication checkpoints without requiring an external API call

### Requirement: Vintage bullion refiner hallmarks and constitutional silver multipliers
The system SHALL maintain a static reference registry for collectible vintage bullion hallmarks (including Engelhard and Johnson Matthey serial prefixes and variants), major LBMA refiners, and exact constitutional silver face-value multipliers.

#### Scenario: Identify collectible vintage Engelhard or Johnson Matthey bar
- **WHEN** OCR text or item details contain a cataloged vintage bar prefix or hallmark (e.g., Engelhard `C`-series, `P`-series loaf, Waffle Back, or Johnson Matthey serialized bar)
- **THEN** the system resolves the refiner, variant series, and collector rarity tier so it is not misclassified as generic melt bullion

#### Scenario: Calculate fine silver weight from constitutional face value
- **WHEN** a user enters or queries a constitutional silver lot by face value (such as `$10 FV` US 90% quarters or `$5 FV` Canadian 80% silver)
- **THEN** the system computes exact fine troy ounces using static face-value multipliers (`0.715` circulated / `0.7234` uncirculated ozt per `$1 FV` US 90%; `0.60` ozt per `$1 FV` Canadian 80%)

### Requirement: Grading fee schedules, vintage slab generations, and CAC rules
The system SHALL store published grading service fee tiers and shipping buffers to compute deterministic `grading_upside_usd` ROI, identify vintage slab holder generations (e.g., PCGS Rattler, OGH, NGC Fatty), and resolve CAC Green/Gold Bean eligibility and verification URLs.

#### Scenario: Compute deterministic grading ROI from synced fee table
- **WHEN** the appraisal engine evaluates a raw coin, banknote, or trading card for `grading_upside_usd`
- **THEN** it looks up the applicable service tier fee, declared-value cap, and shipping buffer from `StaticGradingReference` instead of relying on hardcoded AI prompt guesses

#### Scenario: Identify vintage holder generation and CAC eligibility
- **WHEN** an item references a vintage slab holder descriptor (e.g., `OGH`, `Rattler`, `Doily`, `Fatty`) or a CAC verification cert
- **THEN** the system returns the holder generation era metadata and generates the deterministic CAC verification link when applicable

### Requirement: Storage, capsule, tube, and sleeve compatibility matrix
The system SHALL map physical item dimensions and categories to compatible storage supplies, including Air-Tite/Lighthouse coin capsule codes, standard Mint tube and monster box capacities, and graded slab outer dimensions.

#### Scenario: Recommend coin capsule and Mint tube capacity
- **WHEN** a collector queries storage fit for a coin with `diameter_mm = 40.6` (American Silver Eagle) or `diameter_mm = 38.1` (Morgan Dollar)
- **THEN** the system returns the matching Air-Tite direct-fit/ring capsule code (`H40.6` / `H38`) and standard Mint tube/monster box counts (`20 per tube / 500 per box`)

### Requirement: Static certification verification patterns and client-side barcode decoding
The system SHALL maintain deterministic certification verification URL patterns for major grading services (`PCGS`, `NGC`, `PMG`, `PCGS_BANKNOTE`, `CACG`, `CAC`, `ANACS`, `ICG`, `PSA`, `BGS`, `CGC`, `SGC`, `TAG`) and shared backend/frontend regex parsers for 1D/2D barcodes and DataMatrix labels.

#### Scenario: Direct cert verification link generation
- **WHEN** an item possesses a known grading service and certification number
- **THEN** both backend and frontend deterministically generate the official verification deep-link URL without third-party API lookups

#### Scenario: Client-side barcode decoding without AI
- **WHEN** a user scans or uploads a slab with a machine-readable barcode or DataMatrix encoding a cert number
- **THEN** the parser extracts the grading service and certification number deterministically with zero Vision AI invocations

### Requirement: Tiered periodic catalog synchronization
The system SHALL execute scheduled idempotent Celery Beat synchronization jobs across tiered cadences—Weekly for static catalog specs and fee schedules, Daily for FX rates, EOD spot/GSR baselines, new sets, and population rollups, and Hourly for volatile market rollups—preserving prior valid records if any upstream source fails.

#### Scenario: Weekly static catalog update
- **WHEN** the weekly scheduled sync task executes
- **THEN** the system upserts curated reference fixtures and free public catalog indexes into static tables and records a `ReferenceSyncLog` audit entry

#### Scenario: Daily baselines and population update
- **WHEN** the daily scheduled sync task executes
- **THEN** the system refreshes fiat FX rates, archives EOD historical spot and GSR baselines, indexes newly released sets, and rolls up cached grading population counts

#### Scenario: Hourly volatile benchmark rollup and upstream fault tolerance
- **WHEN** the hourly sync task executes and an upstream network call times out or fails schema validation
- **THEN** the system logs the failure in `ReferenceSyncLog`, retains previously persisted valid static records without data loss, and serves lookups cleanly from local DB and Redis cache

### Requirement: Historical spot baselines, multi-currency FX, and hobby glossary
The system SHALL store daily fiat FX rates, daily EOD historical spot and GSR baselines, a canonical collector abbreviation/glossary dictionary, and non-advisory bullion tax reporting reference thresholds for offline lookup and normalization.

#### Scenario: Normalize foreign currency amount via cached FX rates
- **WHEN** a valuation comp or item record requires converting `EUR`, `GBP`, `CAD`, `MXN`, `AUD`, `CHF`, or `JPY` to `USD`
- **THEN** the system resolves the rate locally from `StaticMarketBaseline` (or Redis cache) without issuing a per-request external API call

#### Scenario: Expand hobby jargon and abbreviations locally
- **WHEN** a user or OCR normalizer queries a collector abbreviation such as `OGH`, `DMPL`, `VAM`, `EPQ`, `RPA`, `SSP`, or `SIR`
- **THEN** the system returns its canonical name, domain category, and plain-English explanation from the static glossary dictionary

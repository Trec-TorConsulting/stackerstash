# Spec Delta

## Purpose

Defines the public-facing Stacker Stash marketing website at `/`, `/marketing`, `/features`, `/pricing`, `/security`, `/privacy`, and `/terms`, presenting all supported asset classes, platform capabilities, tiered SaaS and self-hosted plans, enterprise trust disclosures, and accessible navigation.

## ADDED Requirements

### Requirement: Default root landing page serves marketing site
Unauthenticated requests to `/` SHALL render the full Stacker Stash marketing landing experience by default, while keeping `/coming-soon` directly routable and supporting an explicit `coming_soon` site-mode override when configured at build time.

#### Scenario: Unauthenticated visitor opens root domain
- **WHEN** an unauthenticated visitor navigates to `/` under the default build configuration
- **THEN** the application renders the marketing landing page with primary sign-up and sign-in actions instead of the coming-soon teaser

#### Scenario: Coming-soon preview remains accessible
- **WHEN** a visitor navigates to `/coming-soon` or builds the frontend with site mode set to `coming_soon`
- **THEN** the application renders the coming-soon teaser page without error

### Requirement: Canonical public brand and verified links
All public marketing pages, headers, footers, legal notices, and metadata SHALL standardize on the canonical product name `Stacker Stash` and include only verified external links (such as the GitHub repository) without fabricated social profiles or placeholder handles.

#### Scenario: Visitor inspects public branding and footer links
- **WHEN** a visitor views the marketing header or footer
- **THEN** the branding displays `Stacker Stash` consistently and external community links resolve only to verified destinations

### Requirement: Complete supported asset class showcase
The marketing website SHALL showcase every asset category supported by the platform: US and World Coins (including Ancient), Paper Banknotes and fractional 24K Goldbacks (`1/4` through `100`), Precious-Metal Bars and Rounds (`Gold`, `Silver`, `Platinum`, `Palladium`, `Copper`), Trading and Collectible Cards (`Pokémon`, `MTG`, `Yu-Gi-Oh!`, `Disney Lorcana`, `One Piece`, `Sports`), and Certified Slabs (`PCGS`, `NGC`, `PMG`, `PCGS Banknote`, `CACG`, `ANACS`, `PSA`, `BGS`, `CGC`, `SGC`, `TAG`).

#### Scenario: Collector verifies asset class support
- **WHEN** a visitor inspects the supported assets section on `/` or `/features`
- **THEN** coins, paper banknotes, Goldbacks, bullion bars/rounds, trading/sports cards, and both numismatic and card grading slab services are explicitly presented

### Requirement: Complete platform offering and feature matrix
The marketing website SHALL present all core shipped offerings across intake, valuation, organization, collaboration, offline PWA, and administration, with zero overstated or unbuilt claims.

#### Scenario: Visitor reviews AI intake, capture, and sorting offerings
- **WHEN** a visitor reads the feature sections on `/` or `/features`
- **THEN** guided camera capture (Circle/Rect/3:4 Card reticles, 1x–3x zoom, auto-crop and tilt deskew, anti-pic-of-a-pic glare/clipping checks, HEIC upload), local-first OCR/barcode/static-catalog identification before Gemini Vision or self-hosted Ollama, Fast Bulk Add, and background auto-sort classification are described

#### Scenario: Visitor reviews multi-source valuation and explainability offerings
- **WHEN** a visitor explores appraisal capabilities on `/` or `/features`
- **THEN** 5-metal live spot melt floors (including copper lb-to-troy-oz conversion), Goldback exchange benchmarks, PCGS/Greysheet/NumisMedia/Numista and PriceCharting/Scryfall/Pokémon TCG/PSA Pop/TAG DIG/BGS sub-grades, comp outlier trimming, raw grade estimation with grading ROI, scheduled stale re-appraisal, and manual value locks are presented

#### Scenario: Visitor reviews vaults, migration, offline PWA, and exports
- **WHEN** a visitor inspects vault management and enterprise features
- **THEN** unlimited-depth containers, multi-vault switching with Default BYOK key inheritance, shared RBAC vaults (`OWNER`/`EDITOR`/`VIEWER`), CoinSnap/Numista/PCGS/NGC CSV migration, offline coin-show PWA caching, CSV/JSON/print insurance reports, and Global Operator Admin controls are presented

### Requirement: Interactive capability showcase and FAQ accordion
The marketing experience SHALL provide interactive workflow category tabs (or capability selector) and an expandable FAQ accordion so prospective collectors can inspect real platform workflows and answers without leaving the page.

#### Scenario: Visitor switches capability showcase tabs and expands FAQ items
- **WHEN** a visitor selects a workflow tab (such as Vision Scan, Multi-Source Appraisal, or Shared Vaults) or toggles an FAQ question
- **THEN** the active panel updates immediately to show workflow details and the FAQ panel toggles `aria-expanded` state cleanly

### Requirement: Four-tier SaaS and self-hosted pricing matrix
The pricing presentation on `/` and `/pricing` SHALL display all four SaaS access tiers—`Collector Vault (Free)` (`$0/mo`, `1` owned vault, `100` active items), `Plus` (`$9.99/mo`, `10` owned vaults, unlimited items), `Unlimited` (`$19.99/mo`, unlimited vaults/items), and `Dedicated Server` (`$99.99/mo`, dedicated instance)—alongside a `Self-Hosted / Open Source` deployment option (`Docker Compose` and `Kubernetes`), keeping CSV import, BYOK AI, and Shared Vaults included on every tier.

#### Scenario: Visitor compares SaaS tiers and self-hosted option
- **WHEN** a visitor views the pricing section on `/` or navigates to `/pricing`
- **THEN** all four SaaS tiers with exact vault/item limits and pricing plus the `Self-Hosted / Open Source` card are rendered with clear `/register` call-to-action links

### Requirement: Dedicated public routes for SEO and enterprise trust
The application SHALL provide dedicated unauthenticated public routes at `/features`, `/pricing`, `/security`, `/privacy`, and `/terms` (in addition to `/` and `/marketing`), with frontend-only navigation and contact CTAs (`/register`, `/login`, `mailto:`, and GitHub) and zero fake or unpersisted lead-capture forms.

#### Scenario: Visitor opens enterprise security and legal disclosure routes
- **WHEN** a visitor navigates directly to `/security`, `/privacy`, or `/terms`
- **THEN** the site renders complete architecture security disclosures (tenant isolation, Fernet BYOK encryption, HMAC-signed media, OWASP protections), privacy policy, or terms of service with links back to `/register` and `/`

### Requirement: Responsive navigation and accessible WCAG controls
The public header and marketing pages SHALL provide a keyboard-accessible skip-to-content link, semantic `<header>`, `<nav>`, `<main>`, and `<footer>` landmarks, an interactive mobile navigation menu toggle on narrow viewports, accessible focus outlines, and `prefers-reduced-motion` safety.

#### Scenario: Mobile visitor opens navigation drawer
- **WHEN** a visitor on a mobile viewport activates the menu toggle button
- **THEN** navigation links to `/features`, `/pricing`, `/security`, `/login`, and `/register` become visible and can be closed via button or `Escape` key

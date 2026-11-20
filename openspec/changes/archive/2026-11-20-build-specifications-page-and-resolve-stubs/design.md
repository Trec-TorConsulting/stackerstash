# Design: Full Specifications Page & Stub Resolution

## Context
See `proposal.md` for background and motivation. The marketing site provides an overview on `/features`, but when users click `Explore full specifications →`, it points to `/features` (reloading the current page). Furthermore, `PublicHeader` and `SiteFooter` omit specifications links, and `/coming-soon` contains a fake form that simulates email collection in local state.

## Goals / Non-Goals

**Goals:**
- Provide a dedicated, accessible, and responsive `/specifications` page (and `/specs` route) detailing technical models for coins, banknotes, bullion, cards, slab verifications, camera intake, and valuation math.
- Fix all self-referencing links on `/features` and the homepage to point to `/specifications`.
- Integrate specifications into `PublicHeader` (desktop navigation and mobile drawer) and `SiteFooter`.
- Remove the non-functional mock waitlist form on `/coming-soon`, replacing it with direct early access actions (`/register` and `/login`).
- Maintain full SEO metadata, Open Graph tags, JSON-LD schemas, XML sitemap indexing, and build-time HTML prerendering for `/specifications`.
- Keep 100% test pass rate across all Vitest suites.

**Non-Goals:**
- No backend database migrations or new database tables (the specs describe already-implemented backend capabilities and reference data).
- No new external APIs or paid third-party dependencies.

## Decisions

### 1. Structured Specifications Catalog in TypeScript
- **Decision**: Define the specifications data in a modular data module `frontend/src/data/specificationsCatalog.ts`.
- **Rationale**: Keeps data clean, testable, and statically analyzable. Allows the build-time prerenderer (`scripts/prerender.mjs`) to generate fully populated HTML without relying on an active backend or database connection.
- **Alternatives Considered**: Fetching specifications dynamically from backend reference APIs (`/api/v1/catalog/reference/...`). Rejected because marketing and specifications pages must be crawlable and render instantly offline and at the edge without API latency or auth tokens.

### 2. Tabbed / Categorized Interactive Specifications UI
- **Decision**: Build `SpecificationsPage.tsx` with high-level category pills (Numismatics & Slabs, Currency & Goldbacks, Bullion & Melt Math, Trading Cards, Camera & Vision AI, Security & Architecture) and deep-dive specification tables/cards.
- **Rationale**: Allows technical collectors, dealers, and stackers to inspect specific formulas, grading scales, and barcode regex rules without overwhelming visual noise.
- **Alternatives Considered**: A single giant text wall. Rejected due to poor mobile readability and navigation friction.

### 3. Route Structure and Alias Handling
- **Decision**: Define `/specifications` as the primary canonical route in `App.tsx` and `seo.ts`, and add `/specs` as a direct route or redirect to `/specifications`.
- **Rationale**: Supports both natural URLs (`/specifications` and the common shorthand `/specs`) while maintaining one canonical URL for search engine indexing.

### 4. Replacing Mock Lead Capture on `/coming-soon`
- **Decision**: Remove the mock `handleNotify` email form on `ComingSoonPage.tsx` and replace it with authentic call-to-actions ("Open Free Vault" linking to `/register`, and "Sign In" linking to `/login`).
- **Rationale**: Fulfills the `public-marketing-website` spec requirement of "zero fake or unpersisted lead-capture forms" and directs interested visitors straight into the live platform.

## Risks / Trade-offs

- **[Risk]** Prerender bundle size or build-time SSR issues with large specification tables.
  - *Mitigation*: The specifications catalog uses lightweight plain JavaScript objects and Lucide icons already in the bundle; prerender script will be verified via `npm run build`.
- **[Risk]** Regressions in existing SEO or footer tests in `marketingSeo.test.tsx`.
  - *Mitigation*: Update test assertions to include `/specifications` in sitemap, prerender routes, and header/footer link lists.

## Migration Plan
- No database migrations needed.
- Build and verify frontend with `npm test` and `npm run build`.
- PR branch `feat/specifications-page-and-resolve-stubs` merged to main via standard GitHub flow.

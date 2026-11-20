# Design: Compact Specifications Page and Interactive Tools

## Context
See `proposal.md` for motivation. The `/specifications` page previously defaulted to an `"all"` tab that rendered seven dense specification tables consecutively, resulting in an uncomfortably tall page (over 4,000 vertical pixels). Furthermore, the static tables lacked interactive utility for visitors evaluating coins, bullion, and card grading.

## Goals / Non-Goals

**Goals:**
- Default `/specifications` to the focused `"services"` category (or single active category) so only one domain renders at a time, drastically reducing initial scroll length.
- Introduce collapsible accordion tiers for the Sheldon 1–70 scale:
  - *Tier 1: Mint State & Proof (MS-60 to MS-70)*: Open by default.
  - *Tier 2: About Uncirculated (AU-50 to AU-58)*: Collapsed by default.
  - *Tier 3: Circulated (Poor-1 to XF-45)*: Collapsed by default.
- Truncate the 15 Strike Designation cards to the top 6 with an intuitive "Show all 15 designations" toggle.
- Provide three dedicated interactive utility modules beneath the specifications tables:
  1. **Live Scrap Melt Floor Calculator (`MeltCalculatorCard.tsx`)**: Allows selection of metal (Gold, Silver, Platinum, Palladium, Copper), common purity options (.999 Fine, .900 Coin, .925 Sterling, 14K, 10K, etc.), and mass input (troy oz or grams), calculating real-time melt values using cached or live spot prices.
  2. **Interactive Certified Slab Link Generator**: Retained and cleanly styled under or alongside the grading services tab for instant zero-API verification deep-links across all 13 services.
  3. **Interactive Grading ROI / Break-Even Simulator (`GradingRoiCard.tsx`)**: Allows collectors to enter raw acquisition cost, estimated slab tier fee ($25 Economy, $40 Regular, $75 Express), and target grade to compute net margin and projected collectibility premium.
  4. **Specifications & Standards FAQ (`SpecificationsFaqCard.tsx`)**: Expandable accordion answering common numismatic and bullion standards questions.
- Maintain 100% test coverage across all new components and page interactions.

**Non-Goals:**
- Replacing the server-side valuation API; all interactive client calculators run client-side with fallback spot rates if network is offline.
- Modifying backend database schemas or catalog models.

## Decisions

### Decision 1: Default to Single Category Tabs rather than Infinite "All"
- **Rationale**: Setting `activeTab` to `"services"` by default eliminates thousands of pixels of vertical scrolling on initial load. We also provide a "Quick Utility Tools" tab or anchor link so visitors can jump straight to calculators.
- **Alternatives Considered**: Keeping "All" as default with a sticky table of contents; rejected because the page remains excessively long on mobile screens.

### Decision 2: Self-Contained Interactive Calculator Components
- **Rationale**: Building `MeltCalculatorCard`, `GradingRoiCard`, and `SpecificationsFaqCard` as dedicated modular components in `frontend/src/components/specifications/` keeps `SpecificationsPage.tsx` clean and facilitates targeted unit testing.
- **Spot Rates in Melt Calculator**: The calculator will use live spot rates from the existing React Query hook `useSpotPrices` when authenticated/online, and fall back to NIST baseline spot rates ($2,650/oz Au, $31.50/oz Ag, $980/oz Pt, $1,050/oz Pd, $4.20/lb Cu) when offline or unauthenticated.

## Risks / Trade-offs

- **[Risk]** Existing unit tests may expect all tables to render simultaneously on initial load.
  - **Mitigation**: Update `specifications.test.tsx` to test category tab switching, search filtering across tabs, and accordion toggle behavior.
- **[Risk]** Spot prices might be unavailable to unauthenticated visitors on the public `/specifications` route.
  - **Mitigation**: Supply sensible baseline market fallbacks so the melt calculator always computes accurately without requiring login.

## Migration Plan

- Deploy via standard GitHub workflow (`branch -> PR -> squash merge -> buildx -> Helm upgrade`).
- No database migrations or breaking API changes required.

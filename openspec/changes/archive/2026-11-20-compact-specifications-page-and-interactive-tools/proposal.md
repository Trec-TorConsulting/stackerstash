# Proposal: Compact Specifications Page and Interactive Tools

## Why

The current `/specifications` page defaults to displaying all reference catalogs simultaneously, creating an excessively long, overwhelming vertical scroll with 30-row scale tables and 15 design cards. Users need a compact, scannable reference experience with collapsible tiers and high-utility interactive tools (live spot melt calculator, cert verification tester, and grading ROI simulator) positioned directly under the active specification tables.

## What Changes

- **Category-Scoped Active View**: Default the specifications tab navigation to a focused category (`services` or `overview`) instead of an endless all-in-one scroll; allow users to toggle seamlessly between categories while maintaining search filtering.
- **Collapsible Long-Table Tiers**: Group the 30 Sheldon grading points into collapsible tiers (Mint State 60–70 open by default; About Uncirculated 50–58 and Circulated 1–45 collapsed) and truncate strike designations with a clean "Show all" expander to dramatically reduce vertical scroll height.
- **Interactive Live Spot Melt Floor Calculator**: Add an embedded interactive metal melt calculator beneath the bullion specifications allowing users to select metal type (Gold, Silver, Platinum, Palladium, Copper), choose unit/purity, enter quantity, and inspect live scrap floor values calculated with live spot prices.
- **Embedded Slab Verification Sandbox**: Anchor the certified slab deep-link generator directly alongside/underneath the grading authority specifications with zero-API deterministic verification.
- **Interactive Grading ROI / Break-Even Simulator**: Add an interactive tool under numismatic/card specs allowing collectors to input raw purchase price, estimated slab grade, and grading tier fee to see projected market uplift and minimum break-even grade.
- **Specifications FAQ & Knowledge Accordion**: Add an expandable FAQ section answering collector questions on grading turnaround, CAC stickering, Goldback aurum legality, and troy mass precision.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `public-marketing-website`: Update requirement `Dedicated technical specifications and data reference page` to specify compact category tab scoping, collapsible scale tiers, and embedded interactive collector utility tools (live scrap melt calculator, slab cert link generator, and grading break-even simulator).

## Impact

- `frontend/src/pages/SpecificationsPage.tsx`: Refactored to support collapsible accordions, default single-category tab view, and embedded interactive utility sections.
- `frontend/src/components/specifications/`: Reusable components for `MeltCalculatorCard.tsx`, `GradingRoiCard.tsx`, and `SpecificationsFaqCard.tsx`.
- `frontend/src/__tests__/specifications.test.tsx` and `frontend/src/__tests__/marketingSeo.test.tsx`: Comprehensive tests for all interactive calculators, tier collapse/expand actions, and responsive specs rendering.

# Spec Delta: public-marketing-website

## MODIFIED Requirements

### Requirement: Dedicated technical specifications and data reference page
The application SHALL provide a dedicated public and authenticated route at `/specifications` (with `/specs` as an alias) presenting a compact, category-scoped technical breakdown of asset attributes, grading scales, certified slab deep-link patterns, bullion conversion formulas, and vision/valuation architectures. The specifications page SHALL default to a focused category tab with collapsible scale tiers, and SHALL embed interactive utility tools including a live spot melt floor calculator, certified slab deep-link generator, grading ROI simulator, and FAQ accordion.

#### Scenario: Collector visits specifications page
- **WHEN** a visitor or authenticated collector navigates to `/specifications` or `/specs`
- **THEN** the application renders the comprehensive specifications matrix with categorized sections for numismatics, banknotes, bullion, cards, grading slabs, vision intake, and valuation math

#### Scenario: Visitor navigates from features CTA
- **WHEN** a visitor clicks "Explore full specifications →" on `/features` or the home page
- **THEN** the application navigates directly to `/specifications` instead of reloading or linking back to `/features`

#### Scenario: Collector interacts with collapsible scale tiers
- **WHEN** a visitor selects the "Numismatics & Strikes" tab
- **THEN** the Sheldon 1–70 grading scale displays collapsible tiers (Mint State 60–70 expanded by default; AU and Circulated collapsed by default)
- **AND** the strike designations section displays the top designations with an interactive toggle to expand the full catalog

#### Scenario: Collector uses interactive live scrap melt calculator
- **WHEN** a visitor navigates to the Bullion specifications section or accesses the embedded melt calculator
- **THEN** the calculator allows selecting a precious metal (Gold, Silver, Platinum, Palladium, Copper), purity, and mass in grams or troy ounces
- **AND** computes the calculated pure metal melt value in real time

#### Scenario: Collector uses interactive grading ROI simulator
- **WHEN** a visitor inputs a raw purchase price, estimated slab grade, and grading tier fee in the Grading ROI simulator
- **THEN** the tool calculates the projected slab market uplift, net profit or loss, and break-even grade threshold

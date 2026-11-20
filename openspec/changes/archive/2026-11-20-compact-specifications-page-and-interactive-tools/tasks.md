# Tasks

## 1. Interactive Utility Components

- [x] 1.1 Implement `MeltCalculatorCard.tsx` with metal selector (Gold, Silver, Platinum, Palladium, Copper), standard purities, dual mass units (grams/oz t), and live scrap melt math, verifying with Vitest unit tests.
- [x] 1.2 Implement `GradingRoiCard.tsx` with raw price inputs, slab fee options, target grade estimate, and break-even margin calculation, verifying with Vitest unit tests.
- [x] 1.3 Implement `SpecificationsFaqCard.tsx` with an interactive accordion for grading, stickering, and bullion mass standards, verifying with Vitest unit tests.

## 2. Specifications Page Refactoring & Collapsible Tiers

- [x] 2.1 Refactor `SpecificationsPage.tsx` tab navigation to default to `"services"` single-category view, update category filters, and verify tab switching.
- [x] 2.2 Implement collapsible tiers for Sheldon 1–70 scale (Mint State 60–70 open by default; AU 50–58 and Circulated 1–45 collapsed) and expander for strike designations, verifying accordion behavior in tests.
- [x] 2.3 Embed `MeltCalculatorCard`, `GradingRoiCard`, and `SpecificationsFaqCard` underneath active specification tables, verifying seamless rendering and interactive operations.

## 3. Verification & Test Coverage

- [x] 3.1 Update and run `frontend/src/__tests__/specifications.test.tsx` and `frontend/src/__tests__/marketingSeo.test.tsx` ensuring 100% frontend test coverage and zero regressions.

## Workflow follow-up

- Archive the change after verification passes.
- Branch, commit, push, open PR, merge with --admin, and deploy to HomeLab K3s cluster.

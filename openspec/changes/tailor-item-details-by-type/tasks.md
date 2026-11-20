# Tasks: Tailor Item Details and Views by Category / Type

## 1. Classification Helpers and Category Utilities

- [ ] 1.1 Add `isBanknoteItem`, `isBullionItem`, and `hasPreciousMetal` helpers to `frontend/src/lib/format.ts` and verify with unit tests in `frontend/src/__tests__/appShellAndContainers.test.tsx`.
- [ ] 1.2 Add fancy serial detection utility (Star Note ★, Radar, Repeater, Binary, Solid) in `frontend/src/lib/format.ts` or a dedicated banknote helper and verify with unit tests.

## 2. Dedicated Banknote Specifications Component

- [ ] 2.1 Create `frontend/src/components/valuation/BanknoteSpecsCard.tsx` displaying country, denomination, series year, issuing bank/district, serial number with fancy serial badge, catalog numbers, signatures, and PMG/PCGS Banknote holder dimensions.
- [ ] 2.2 Add inline edit support in `BanknoteSpecsCard` calling `onSaveSpecs` and verify rendering and editing in `frontend/src/__tests__/valuation.test.tsx`.

## 3. Category-Tailored Item Detail Page

- [ ] 3.1 Update `frontend/src/pages/ItemDetailPage.tsx` overview to conditionally suppress "Metal & Fine Weight Non-Bullion (0 ozt)" for non-metallic items, and verify with tests in `frontend/src/__tests__/itemDetail.test.tsx`.
- [ ] 3.2 Tailor metadata labels and rows in `ItemDetailPage.tsx` (hide "Denomination" for cards/bars/rounds, adapt "Mint / Refiner" to "Manufacturer / Publisher" for cards and "Issuing Bank / Printer" for paper) and verify with tests.
- [ ] 3.3 Replace the "$0.00 Melt Value" hero card in `ItemDetailPage.tsx` for `PAPER` items with a dedicated Grade / Serial / Series hero card, and verify with tests.
- [ ] 3.4 Wire `BanknoteSpecsCard` into the right-hand specifications section of `ItemDetailPage.tsx` for `isBanknoteItem(item)`, maintaining `CardSpecsCard` for cards and `NumismaticSpecsCard` for coins/bars/rounds.

## 4. Category-Scoped Edit and Add Forms

- [ ] 4.1 Update the edit form in `frontend/src/pages/ItemDetailPage.tsx` to scope visible inputs by category, hiding bullion metal/weight fields for cards and notes and showing category-specific fields; verify with tests in `frontend/src/__tests__/itemDetailCoverage.test.tsx`.
- [ ] 4.2 Update `frontend/src/pages/ScanAddPage.tsx` to dynamically adjust visible fields based on the selected category (surfacing card attributes for `CARD`, banknote attributes for `PAPER`, and bullion fields for `BAR`/`ROUND`); verify with tests in `frontend/src/__tests__/scanAddCoverage.test.tsx`.

## 5. Collectibility Thesis Context and End-to-End Verification

- [ ] 5.1 Update `frontend/src/components/valuation/CollectibilityThesisCard.tsx` to contextualize collectible thesis badges and grading service upside tips (PSA/BGS/CGC for cards, PMG/PCGS Banknote for paper, PCGS/NGC for coins); verify with tests.
- [ ] 5.2 Run frontend test suite (`npm run test:run`) and linter/typechecker to ensure zero regressions across all item categories.

## Workflow follow-up

- Review artifacts with the user before applying.
- Apply the change via OpenSpec apply workflow (`/opsx-apply`).

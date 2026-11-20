# Proposal

## Why

The item detail page header previously had a bulky "Lock Value" / "Value Locked" button in the top action strip. Moving this action to a dedicated lock icon in the upper-right corner of the Market Value (Est) card box simplifies the top actions row, couples the lock control directly to the value metric it protects, and aligns with the compact card-header action pattern established across the application.

## What Changes

- Remove the top action bar "Lock Value" button in `frontend/src/pages/ItemDetailPage.tsx`.
- Add an upper-right corner lock icon action (`Lock` / `Unlock`) to the Market Value (Est) card box, toggling `specs_provenance.market_value_unit === "USER"`.
- Preserve accessibility attributes (`aria-label={isLocked ? "Value Locked" : "Lock Value"}`) and tooltips so screen readers, automated test suites, and users retain full functional continuity.

## Capabilities

### Modified Capabilities
- `platform-readiness-and-ux-polish`: Relocate the market value lock/unlock toggle from the top header actions row to an icon button in the upper-right corner of the Market Value card.

## Impact

- `frontend/src/pages/ItemDetailPage.tsx`: Header actions strip and Market Value card layout.
- Test suites in `frontend/src/__tests__/itemDetailCoverage.test.tsx` and related tests.

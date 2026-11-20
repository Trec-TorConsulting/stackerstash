# Proposal

## Why

The item detail page header previously placed a bulky "Edit Details" button alongside primary item actions ("Appraise Now", "Lock Value", "Duplicate Item", "Delete"). Relocating this action to a pencil icon with "Edit details" in small letters on the upper right side of the Item Details box aligns the presentation with `CardSpecsCard` and `NumismaticSpecsCard`, creating a consistent, compact, and card-centric editing interface.

## What Changes

- Remove the top action bar "Edit Details" button from the item header in `frontend/src/pages/ItemDetailPage.tsx`.
- Add an upper-right header action in the Item Details card box featuring a pencil icon (`Pencil`) and small "Edit details" label (`text-xs`), switching to a Cancel button when active, exactly mirroring the inline editing pattern of `CardSpecsCard` and `NumismaticSpecsCard`.
- Preserve accessibility attributes (`aria-label="Edit Details"`) and permission checks (`canEdit`) so role-based gating and existing tests continue to function seamlessly.

## Capabilities

### Modified Capabilities
- `platform-readiness-and-ux-polish`: Relocate the Item Detail editing trigger from the top header action strip into the upper right corner of the Item Details specification box as a pencil icon with small text.

## Impact

- `frontend/src/pages/ItemDetailPage.tsx`: Header actions strip and Item Details box header.
- Frontend test suites covering `ItemDetailPage` (`polishAndCrud.test.tsx`, `itemDetailCoverage.test.tsx`, `itemDetail.test.tsx`, `autoSort.test.tsx`, `sharedVaults.test.tsx`).

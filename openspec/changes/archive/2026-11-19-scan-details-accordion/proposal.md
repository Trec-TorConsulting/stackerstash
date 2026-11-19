# Proposal

## Why

On `https://stackerstash.com/scan` (`ScanAddPage.tsx`), the full item metadata form renders open by default directly beneath the Camera & Photo Intake card, creating unnecessary scrolling and visual clutter on mobile and desktop before a user has captured photos or identified an item. Putting all item fields under the Take Photo section into a collapsible accordion dropdown keeps intake camera-first while automatically revealing the populated form once identification returns item details.

## What Changes

- **Collapsible Item Details Accordion on `/scan`**: Wrap the entire item details form section below the Camera & Photo Intake card in `frontend/src/pages/ScanAddPage.tsx` inside an accessible accordion container that starts collapsed by default (`detailsOpen = false`).
- **Auto-Expand After Identification With Info**: When photo capture/upload + `Identify with AI` (`runIdentify`) completes and returns a candidate with populated item information (such as title, country, year, denomination, series, mint/refiner, metal/weight, grading/cert/serial info, card fields, estimated value, or notes), automatically open the accordion so the user can immediately review and click **Save Item to Vault**.
- **No Empty Auto-Open & Manual Override**: If `Identify with AI` fails or returns an empty fallback candidate with no populated details, keep the accordion collapsed while keeping error/notice banners visible; users can click the accordion header anytime to expand or collapse the form for manual entry or single-photo saves without losing entered field values.
- **Accordion Header Cue**: Display a concise status indicator in the accordion toggle header (e.g., indicating manual entry before AI runs, or showing a review badge/title preview when identified) so users always know whether fields are populated.

## Capabilities

### New Capabilities
<!-- None; extends the existing scan/intake UX behavior under vision-identification. -->

### Modified Capabilities
- `vision-identification`: Specify collapsible Item Details accordion behavior below the Take Photo / intake section on `/scan`, starting collapsed by default and automatically expanding once `Identify with AI` returns populated candidate metadata.

## Impact

- **Frontend**: `frontend/src/pages/ScanAddPage.tsx` (accordion toggle state, `hasIdentifiedCandidateInfo` helper, automatic expansion in `runIdentify`, and accessible accordion UI wrapping the `<form>`), `frontend/src/__tests__/intake.test.tsx`, `frontend/src/__tests__/autoCropIntake.test.tsx`.
- **Docs**: `docs/USER_GUIDE.md`.

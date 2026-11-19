# Tasks

## 1. Scan & Add Item Details Accordion (`ScanAddPage.tsx`)

- [x] 1.1 In `frontend/src/pages/ScanAddPage.tsx`, add `hasIdentifiedCandidateInfo(candidate)` (exportable or testable helper checking populated string fields, non-`NONE` `metal_type`/`grading_service`, or positive `weight_value`/`estimated_value_usd`) and `detailsOpen` state defaulting to `false`. Verify TypeScript compiles via `cd frontend && npx tsc --noEmit`.
- [x] 1.2 In `frontend/src/pages/ScanAddPage.tsx`, wrap the `<form onSubmit={handleSave}>` section below the Camera & Photo Intake card inside an accessible accordion container with a `<button type="button" aria-expanded={detailsOpen} aria-controls="scan-item-details-panel">` header (chevron icon, `"Item Details"` title, and contextual cue showing manual entry prompt or identified title/review badge), keeping `{error && ...}` and the photo editor modal outside the accordion. In `runIdentify`, call `setDetailsOpen(true)` when `hasIdentifiedCandidateInfo(c)` returns `true` (leaving `detailsOpen` unchanged when AI fails or returns an empty candidate). Verify visually and via `cd frontend && npx tsc --noEmit`.

## 2. Frontend Tests & Documentation

- [x] 2.1 Update `frontend/src/__tests__/autoCropIntake.test.tsx` (expanding the Item Details accordion before asserting `Save Item to Vault` is enabled in the non-blocking quality-warning test) and add unit tests in `frontend/src/__tests__/intake.test.tsx` verifying: (a) `/scan` starts with the Item Details accordion collapsed (`aria-expanded="false"`), (b) `Identify with AI` returning populated candidate metadata automatically expands the accordion and displays pre-filled inputs, (c) `Identify with AI` returning an empty candidate or error keeps the accordion collapsed while showing the notice/error, and (d) manual toggle expands/collapses cleanly without losing form values. Verify with `cd frontend && npm test -- intake autoCropIntake`.
- [x] 2.2 Update `docs/USER_GUIDE.md` Section 3 (*Adding Items via Vision AI Scan or Presets*) to mention that Item Details start collapsed under the photo capture section and open automatically once **Identify with AI** finds item details (or can be expanded anytime for manual entry).

## 3. Full Frontend Verification

- [x] 3.1 Run the full frontend check (`cd frontend && npx tsc --noEmit && npm test && npm run build`) and verify zero errors or regressions across all suites.

## Workflow follow-up

- Create a feature branch, commit, push, open a PR, and merge into `main` per repository workflow.
- Run `/opsx-archive` on `scan-details-accordion` after implementation and verification complete.

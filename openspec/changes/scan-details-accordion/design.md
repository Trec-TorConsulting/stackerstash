# Design

## Context

See `proposal.md` for motivation. Currently in `frontend/src/pages/ScanAddPage.tsx`:
- Lines `723–1090` render the Camera & Photo Intake card (`Open Camera`, `Take Photo`, `Upload Obverse / Reverse`, auto-crop switch, batch pairing bar, thumbnails, `Identify with AI`, verification warnings, and `aiNotice`).
- Lines `1151–1155` render `{error && ...}`.
- Lines `1157–1525` render the always-expanded `<form onSubmit={handleSave}>` containing all item metadata fields (`Title`, `Category`, `Container`, `Year`, `Country`, `Denomination`, `Series`, `Mint / Refiner`, `Purchase Date`, `Quantity`, `Metal Type`, `Weight`, `Purity`, `Grading, Slab & Serial Documentation`, `Cost Basis`, `Market Value`, `Tags`, and `Save Item to Vault`).
- Existing Vitest suites (`frontend/src/__tests__/intake.test.tsx` and `frontend/src/__tests__/autoCropIntake.test.tsx`) inspect `/scan`: specifically, `autoCropIntake.test.tsx` line `284` checks for `Save Item to Vault` after staging a single camera photo without calling `runIdentify`.

## Goals / Non-Goals

**Goals:**
- Keep `/scan` focused on camera/photo intake until identification returns details or the user opens the form manually.
- Auto-expand strictly when `runIdentify` receives a candidate with meaningful populated fields (`hasIdentifiedCandidateInfo`), never auto-opening on blank fallback responses or errors.
- Preserve entered/identified form values across collapse/expand toggles and keep `{error && ...}` and `PhotoCropRotateView` modal outside the accordion.

**Non-Goals:**
- Changing backend `POST /api/v1/vision/identify` payloads, batch auto-pair cataloging flow, or `ItemDetailPage` layout.
- Persisting accordion open/closed state in `localStorage` across page visits (every fresh visit to `/scan` starts cleanly collapsed).

## Decisions

### 1. Single Accordion Wrapping the Entire Item Form Card
- **Choice**: Wrap `<form onSubmit={handleSave}>` in an outer card (`rounded-2xl bg-slate-900 border border-slate-800`) with a full-width `<button type="button" aria-expanded={detailsOpen} aria-controls="scan-item-details-panel">` header (`ChevronDown` / `ChevronRight`, title `"Item Details"`, contextual subtitle `"Expand for manual entry"` or `"Review identified details"` / `form.title`), and render the `<form>` inside `#scan-item-details-panel` when `detailsOpen` is `true` (or collapsed cleanly via conditional render so collapsed inputs aren't tab-navigable or accidentally submitted).
- **Rationale**: Conditional rendering of the inner form body guarantees screen readers, keyboard Tab order, and form validation don't interact with hidden inputs, while React `form` state in `ScanAddPage` remains mounted and preserved across toggles.
- **Alternative considered**: Wrapping only secondary fields while keeping `Title` + `Save Item to Vault` visible — rejected because the user asked to put *all* the info under the Take Photo section into an accordion dropdown.

### 2. Deterministic `hasIdentifiedCandidateInfo(candidate)` Predicate
- **Choice**: Add a pure helper `hasIdentifiedCandidateInfo(c: Partial<VisionCandidate>): boolean` checking whether any meaningful field is populated:
  - Non-empty trimmed string in `title`, `country`, `year`, `mint_or_refiner`, `denomination`, `series`, `cert_number`, `grade`, `slab_designation`, `estimated_grade`, `serial_number`, `notes`, `card_game`, `set_name`, `set_code`, `card_number`, `rarity`, `card_finish`, `card_edition`, `raw_condition`; OR
  - `metal_type` present and not `"NONE"`; OR
  - `grading_service` present and not `"NONE"`; OR
  - Numeric `weight_value > 0` or `estimated_value_usd > 0`.
- Inside `runIdentify`, call `if (hasIdentifiedCandidateInfo(c)) setDetailsOpen(true);` right after updating `form`.
- **Rationale**: Ensures that if Vision AI, OCR, or static catalog matching yields actual info (even if `title` alone wasn't parsed, e.g., only a `cert_number` + `grading_service` or `country` + `year`), the accordion opens; if all providers fail and return empty defaults, the accordion remains closed.

### 3. Error Visibility & Existing Test Alignment
- **Choice**: Keep `{error && ...}` above the accordion toggle so intake/save/identification errors are never obscured. Update `frontend/src/__tests__/autoCropIntake.test.tsx` (line `284`, where a single raw camera photo is staged without running `runIdentify`) to expand the accordion before asserting `Save Item to Vault` is enabled, and add dedicated accordion unit tests in `frontend/src/__tests__/intake.test.tsx`.

## Risks / Trade-offs

- **Risk: User collapses form, then clicks `Identify with AI` again** → Mitigation: `runIdentify` calls `setDetailsOpen(true)` whenever `hasIdentifiedCandidateInfo(c)` is `true`, so re-running identification re-opens the form for review.
- **Risk: User enters manual title and wants to save without photos** → Mitigation: Clicking the `"Item Details"` accordion header expands the full manual form and **Save Item to Vault** button immediately.

# Spec Delta

## Purpose

Unifies Camera Capture, File Upload, and CSV/Bulk Import so every newly added item automatically receives title normalization and a background multi-source appraisal.

## ADDED Requirements

### Requirement: Automatic title normalization on all intake paths
The system SHALL apply deterministic title cleanup (and AI title normalization when available) on items created via Camera Capture, File Upload, or CSV/Bulk Import unless locked by `"USER"` provenance.

#### Scenario: Importing messy titles via CoinSnap CSV
- **WHEN** a user confirms a CSV import containing titles like `"1921 morgan silver dollar RARE!!"`
- **THEN** the system normalizes the saved item title to `"1921 Morgan Silver Dollar"`

### Requirement: Automatic background appraisal after Camera or Upload intake
The system SHALL automatically enqueue a background `AppraisalJob` when an item is saved from Camera Capture or File Upload, and surface its progress on the resulting `ItemDetailPage`.

#### Scenario: Saving an item from Scan & Add
- **WHEN** a user completes Camera or Upload intake and saves the new item
- **THEN** the backend starts an `AppraisalJob` in the background and returns the `appraisal_job_id` so the UI immediately shows live appraisal progress

### Requirement: Automatic background appraisal for CSV/Bulk imports
The system SHALL enqueue background `AppraisalJob` runs for newly imported CSV items so imported collections receive melt, specs, market range, and raw grade estimates uniformly.

#### Scenario: Confirming a multi-row CSV import
- **WHEN** a user confirms a CSV import creating 10 items
- **THEN** the importer creates the items with normalized titles, queues background appraisal jobs for each item, and reports the queued appraisal count in the import summary

### Requirement: Intake source provenance tracking
The system SHALL record `intake_source` (`CAMERA`, `UPLOAD`, `CSV`, `MANUAL`) on each `CollectionItem` for auditability and uniform downstream handling.

#### Scenario: Inspecting intake provenance
- **WHEN** an item is created via Guided Camera, File Upload, or CSV Import
- **THEN** `item.intake_source` reflects the exact intake channel used


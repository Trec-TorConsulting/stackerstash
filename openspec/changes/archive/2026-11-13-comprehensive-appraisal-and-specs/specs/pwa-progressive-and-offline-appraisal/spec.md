# Spec Delta

## Purpose

Delivers a non-blocking progressive appraisal experience and offline PWA caching so collectors can trigger deep multi-source appraisals without UI freezes and inspect cached valuations, specs, and photos without connectivity.

## ADDED Requirements

### Requirement: Non-blocking progressive appraisal execution
The system SHALL return an immediate response from `POST /valuation/items/{id}/appraise` after refreshing live melt value and enqueueing/running deep enrichment, exposing an `AppraisalJob` status endpoint (`GET /valuation/jobs/{job_id}`) with per-step progress.

#### Scenario: Triggering Appraise Now from ItemDetailPage
- **WHEN** a user clicks "Appraise Now"
- **THEN** the UI immediately updates the melt value (if applicable) and shows a live, non-blocking step progress banner (e.g., Spot Melt, Specs, Price Guides, Comps, AI Analysis) while polling job completion

#### Scenario: Navigating away during an active appraisal
- **WHEN** a user triggers an appraisal and navigates to another page before deep enrichment finishes
- **THEN** the appraisal continues running on the server and updates the item and `ValuationHistory` upon completion

### Requirement: Idempotent active-job deduplication
The system SHALL prevent duplicate concurrent appraisal jobs for the same item by returning the active job ID if an appraisal is already in progress.

#### Scenario: Double-clicking Appraise Now
- **WHEN** a second `POST /valuation/items/{id}/appraise` request arrives while an appraisal job for that item is `PENDING` or `RUNNING`
- **THEN** the system returns the existing active job instead of spawning a duplicate run

### Requirement: Offline PWA coin-show cache
The PWA SHALL cache item details, latest valuation breakdown, numismatic specs, and item photos in browser storage (IndexedDB + Service Worker runtime cache) for offline viewing.

#### Scenario: Viewing an appraised coin offline at a coin show
- **WHEN** the user opens a previously viewed item while the device has no network connectivity
- **THEN** the PWA renders the cached item details, "Why It's Valued Here" breakdown, specs, and photos with an offline indicator, and disables "Appraise Now" until connectivity returns


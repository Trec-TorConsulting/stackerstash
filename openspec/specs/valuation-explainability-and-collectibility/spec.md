# valuation-explainability-and-collectibility Specification

## Purpose
Provides transparent "Why It's Valued Here" breakdowns, melt-vs-premium analytics, multimodal AI photo/condition analysis, and collectibility/hold thesis insights in a modern collector-grade UI.

## Requirements

### Requirement: Multimodal AI valuation and collectibility analysis
The system SHALL pass the item's uploaded obverse, reverse, and slab photos (when present) together with item metadata to the AI appraisal provider and extract structured valuation range, itemized `valuation_drivers`, `collectibility_tier`, and `hold_outlook`.

#### Scenario: Multimodal appraisal with obverse and reverse photos
- **WHEN** an item has uploaded photos and AI appraisal runs
- **THEN** the AI request includes the image data and returns `low_usd`, `mid_usd`, `high_usd`, `valuation_drivers`, `collectibility_tier`, and `hold_outlook`

#### Scenario: Text-only fallback when no photos exist
- **WHEN** an item has no uploaded photos and AI appraisal runs
- **THEN** the AI request uses item metadata alone and notes in `valuation_drivers` that surface condition was not visually inspected

### Requirement: Melt vs. collector premium and range breakdown
The system SHALL compute and expose `collector_premium_pct` (percentage above melt), `market_value_low`, `market_value_high`, `valuation_confidence`, and per-source quotes on item detail responses.

#### Scenario: Displaying valuation breakdown for a semi-numismatic coin
- **WHEN** an item has a melt value of $28.50 and a market value of $175.00
- **THEN** the Valuation Breakdown UI displays the melt floor, the collector premium ($146.50 / +514.0%), the Low–High market range, and a visual Melt vs. Collector Premium proportion bar

### Requirement: "Why It's Valued Here" rationale card
The system SHALL render a dedicated "Why It's Valued Here" section on the item detail page listing the concrete value drivers, source comparison table, and last appraisal timestamp.

#### Scenario: Viewing value drivers on ItemDetailPage
- **WHEN** a collector opens an item that has been appraised
- **THEN** the UI displays bulleted value drivers (such as mintage scarcity, grade/slab premium, spot sensitivity, or realized comp range) and lists each evaluated source's quote or status

### Requirement: Collectibility tier and hold thesis card
The system SHALL classify each appraised item into a `collectibility_tier` (`BULLION`, `SEMI_NUMISMATIC`, `KEY_DATE_COLLECTIBLE`, `NUMISMATIC`) and display an actionable `hold_outlook` (e.g., spot-tracked liquidity vs. long-term numismatic hold or grading upside).

#### Scenario: Viewing collectibility thesis for a raw key-date coin
- **WHEN** an unslabbed key-date coin is appraised
- **THEN** the Collectibility & Hold Thesis card displays its tier badge, hold rationale, and actionable upside note (such as potential value impact of third-party grading)

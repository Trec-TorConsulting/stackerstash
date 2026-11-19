# Delta for valuation-explainability-and-collectibility

## ADDED Requirements

### Requirement: Valuation Freshness and Manual Lock Controls
The UI SHALL display when an item's market value was last updated (`valued_at`), highlight stale valuations, and provide a one-click re-appraise action as well as a manual value lock/override toggle.

#### Scenario: Stale valuation indicator
- **WHEN** an item's `valued_at` timestamp exceeds the configured freshness threshold (e.g., 7 days)
- **THEN** the item detail and collection views SHALL display a stale-valuation indicator with a quick action to re-appraise.

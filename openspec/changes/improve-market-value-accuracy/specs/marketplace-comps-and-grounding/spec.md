# Delta for marketplace-comps-and-grounding

## ADDED Requirements

### Requirement: Comp Relevance Filtering and Outlier Trimming
Marketplace comp lookups (including eBay sold and active listings) SHALL filter out irrelevant listings (bulk lots, replicas/copies, empty boxes/slabs, and mismatched grades or card finishes) and apply IQR/median outlier trimming before computing `market_value_unit`, `market_value_low`, and `market_value_high`.

#### Scenario: Lot and replica listings are excluded from comps
- **WHEN** marketplace comps return listings containing keywords such as `lot of`, `bulk`, `replica`, `copy`, `reproduction`, or `empty box` for a single-item query
- **THEN** those listings SHALL be excluded before median and range calculation.

#### Scenario: Active listings are discounted when used as fallback
- **WHEN** sold comps are unavailable and active listings are used as a fallback
- **THEN** the engine SHALL apply a configurable ask-to-sold discount factor and mark `is_estimate = True` with reduced `valuation_confidence`.

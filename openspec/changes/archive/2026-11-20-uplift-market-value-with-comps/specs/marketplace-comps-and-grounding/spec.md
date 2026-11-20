# Spec Delta: marketplace-comps-and-grounding

## ADDED Requirements

### Requirement: Dual-stream eBay comps harvesting and real-world blending
The system SHALL query both realized sold listings (via eBay Marketplace Insights / Sold) and active market listings (via eBay Browse API) when eBay credentials are configured, calculate the median/trimmed mean of realized sold prices ($P_{\text{sold}}$) and the trimmed mean of active asking prices ($P_{\text{ask}}$), and synthesize a balanced real-world market value ($P_{\text{market}} = \frac{P_{\text{sold}} + P_{\text{ask}}}{2}$).

#### Scenario: Both sold comps and active asks available
- **WHEN** an appraisal runs for an item and eBay returns both realized sold sales and active asking listings
- **THEN** the system calculates the median of sold items and the mean of active asks, averages them together into a blended real-world comps valuation, and records both sample counts and ranges in the comps payload

#### Scenario: Only realized sold comps available
- **WHEN** eBay returns realized sold listings but active listings return no matching results
- **THEN** the system uses the trimmed median of realized sales as the comps valuation and indicates that active asks were unavailable

#### Scenario: Only active asking listings available
- **WHEN** eBay Marketplace Insights returns no sold records (or 403/404) but active listings are found
- **THEN** the system calculates the mean active asking price, applies a calibrated ask discount factor, and marks the result as active-ask grounded

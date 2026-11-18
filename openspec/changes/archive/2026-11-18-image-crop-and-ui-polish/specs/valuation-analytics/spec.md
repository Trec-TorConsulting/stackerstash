# Delta Spec: valuation-analytics

## ADDED Requirements

### Requirement: Fine-weight fallback from gross weight and purity
When an item has a precious metal (`SILVER`, `GOLD`, `PLATINUM`, `PALLADIUM`, `COPPER`), a positive `gross_weight_g`, and `fine_weight_oz` is `0` or unset, the system SHALL derive `fine_weight_oz` from `(gross_weight_g / 31.1034768) * purity` (defaulting purity to `0.999` if unset) so melt value and fine weight are accurately reflected.

#### Scenario: Silver round saved with gross weight 31.10g and zero fine weight
- **WHEN** a `SILVER` item has `gross_weight_g = 31.10` and `fine_weight_oz = 0`
- **THEN** the computed fine weight is approximately `0.999` ozt and melt value reflects spot price × fine weight rather than `$0.00`.

### Requirement: Zero cost-basis Unrealized P&L display
On the Dashboard portfolio summary, when `total_cost_basis` is `0` (no cost basis recorded), the system SHALL display `—` for Unrealized P&L instead of `+$0.00`.

#### Scenario: Portfolio with no recorded cost basis
- **WHEN** a workspace has `total_cost_basis == 0`
- **THEN** the Dashboard Unrealized P&L card displays `—` (consistent with Avg Cost).

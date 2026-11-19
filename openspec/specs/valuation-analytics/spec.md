# valuation-analytics Specification

## Purpose
Computes live bullion melt values, numismatic/collector market values from external pricing providers or labeled AI estimates, cost-basis P&L, and portfolio summary dashboards.

## Requirements

### Requirement: Live spot metal pricing
The system SHALL fetch and cache live spot prices for Gold (XAU), Silver (XAG), Platinum (XPT), Palladium (XPD), and Copper (XCU) from `gold-api.com` and compute each bullion item's melt value from its normalized troy-ounce fine metal weight and quantity, scoping user-triggered spot refresh mutations (`POST /api/v1/valuation/spots/refresh`) strictly to the caller's active workspace while periodic background tasks update all workspaces.

#### Scenario: Calculate melt value for 1kg copper bar and silver tube
- **WHEN** spot prices are refreshed for Copper and Silver
- **THEN** the system updates the melt value of a 1kg Copper bar and a Tube of 20 1oz .999 Silver Eagles and records the spot snapshot timestamp

#### Scenario: User-triggered spot refresh updates only the active vault's items
- **WHEN** an authenticated member of Vault A calls `POST /api/v1/valuation/spots/refresh`
- **THEN** the system updates `SpotPriceSnapshot` (respecting a short upstream fetch cooldown) and recalculates `melt_value_unit` only for `CollectionItem` rows belonging to Vault A without locking or modifying items in Vault B

### Requirement: Numismatic and collector market valuation
The system SHALL look up market values from configured collector pricing providers (PCGS API for PCGS coins/certs, Greysheet CDN API when BYOK credentials are present, and NumisMedia FMV / cert verification references) and fall back to AI appraisal clearly labeled as an estimate when no verified sale or price guide match exists.

#### Scenario: PCGS or Greysheet price match
- **WHEN** an item has a valid PCGS cert or coin identifier and the workspace has PCGS or Greysheet credentials configured
- **THEN** the system records the retrieved market value, source attribution, and retrieval timestamp

#### Scenario: AI estimate clearly labeled
- **WHEN** no price-guide or verified sale source returns a price for an item (such as a raw paper banknote or specialty Geiger bar)
- **THEN** the system records any AI-derived range as an "Estimate" and never presents it as a verified sale price

### Requirement: Cost basis, premium, and P&L tracking
The system SHALL track each item's purchase price (cost basis), purchase date, vendor/source, melt value, collector/numismatic premium over melt, and unrealized gain/loss.

#### Scenario: Compute melt vs. premium and gain/loss
- **WHEN** an item has a purchase price of \$30.00, a current melt value of \$32.00, and a market value of \$45.00
- **THEN** the system displays a collector premium of \$13.00 above melt and an unrealized gain of +\$15.00 (+50.0%)

### Requirement: Portfolio dashboard and top-value rankings
The system SHALL provide a portfolio overview showing total collection market value, total melt value, total cost basis, unrealized and realized P&L, Gold/Silver Ratio (GSR), average cost per troy ounce (DCA) by metal, breakdown by category and metal type (including total oz/kg per metal), and a ranked list of most valuable items.

#### Scenario: View portfolio totals and most valuable items
- **WHEN** a user opens the Dashboard
- **THEN** the system displays aggregate portfolio totals, metal weight totals, live GSR, DCA cost per ounce per metal, spot price ticker, and the top-N most valuable items with thumbnails

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

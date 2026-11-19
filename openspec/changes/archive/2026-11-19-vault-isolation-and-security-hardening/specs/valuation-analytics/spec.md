# valuation-analytics Specification Delta

## MODIFIED Requirements

### Requirement: Live spot metal pricing
The system SHALL fetch and cache live spot prices for Gold (XAU), Silver (XAG), Platinum (XPT), Palladium (XPD), and Copper (XCU) from `gold-api.com` and compute each bullion item's melt value from its normalized troy-ounce fine metal weight and quantity, scoping user-triggered spot refresh mutations (`POST /api/v1/valuation/spots/refresh`) strictly to the caller's active workspace while periodic background tasks update all workspaces.

#### Scenario: Calculate melt value for 1kg copper bar and silver tube
- **WHEN** spot prices are refreshed for Copper and Silver
- **THEN** the system updates the melt value of a 1kg Copper bar and a Tube of 20 1oz .999 Silver Eagles and records the spot snapshot timestamp

#### Scenario: User-triggered spot refresh updates only the active vault's items
- **WHEN** an authenticated member of Vault A calls `POST /api/v1/valuation/spots/refresh`
- **THEN** the system updates `SpotPriceSnapshot` (respecting a short upstream fetch cooldown) and recalculates `melt_value_unit` only for `CollectionItem` rows belonging to Vault A without locking or modifying items in Vault B

# Spec Delta

## MODIFIED Requirements

### Requirement: Complete collection item edit fields, duplication, container filtering, and exports
The system SHALL allow users to edit financial (`purchase_price`, `sold_price`, `sold_date`), bullion (`metal_type`, `weight_value`, `weight_unit`, `purity`), tag, and trading card fields in Item Detail via an inline pencil icon action on the upper right corner of the details card, toggle market value re-appraisal lock via an inline lock icon action on the upper right corner of the Market Value card, clone an item (`POST /api/v1/catalog/items/{item_id}/duplicate`), filter Collection by container, map all card/financial fields in CSV import, and download CSV, JSON, and Insurance reports using authenticated requests.

#### Scenario: Edit cost basis, sold details, metal, and tags on Item Detail
- **WHEN** a user activates "Edit details" via the pencil icon button in the upper right corner of the Item Details card and updates `purchase_price`, marks `status = SOLD` with `sold_price` and `sold_date`, corrects `metal_type`/`weight_value`/`purity`, or updates `tags` and trading card attributes
- **THEN** the backend persists all updated fields, recalculates fine weight, melt value, and Dashboard realized P&L, and refreshes the item view

#### Scenario: Lock and unlock market value against scheduled re-appraisal
- **WHEN** an authorized user clicks the lock icon action in the upper right corner of the Market Value card
- **THEN** the system toggles `specs_provenance.market_value_unit = "USER"`, updates the icon and accessible label between "Lock Value" and "Value Locked", and prevents or allows background re-appraisal overwrites accordingly

#### Scenario: Clone an existing item
- **WHEN** a user clicks **Duplicate Item** on an item detail page (`POST /api/v1/catalog/items/{item_id}/duplicate`)
- **THEN** the system creates a new item copying catalog attributes (clearing unique `cert_number` and `sold_*` fields and appending `" (Copy)"` to the title) and opens the cloned item

#### Scenario: Filter collection by container and download authenticated exports
- **WHEN** a user selects a container filter on `/collection` (or loads `/collection?container_id=...`) and clicks **Export CSV** or **Export JSON**
- **THEN** the collection filters by that container and exports execute via authenticated `Authorization` fetches rather than unauthenticated browser links

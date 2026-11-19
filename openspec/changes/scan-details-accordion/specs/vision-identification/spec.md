## ADDED Requirements

### Requirement: Collapsible item details accordion on Scan & Add
The Scan & Add page (`/scan`) SHALL enclose the entire item metadata form below the camera and photo intake card inside a collapsible accordion dropdown that starts collapsed by default, supports manual expand/collapse without losing field values, and automatically expands when photo identification returns populated item details.

#### Scenario: Scan page loads with item details collapsed
- **WHEN** a user navigates to `/scan`
- **THEN** the camera and photo intake controls are immediately visible at the top and the item details form below them is collapsed inside an accordion toggle (`aria-expanded="false"`), while any error banners remain visible outside the accordion

#### Scenario: Accordion auto-opens after identification returns info
- **WHEN** the user captures or uploads photo(s), triggers **Identify with AI** (manually or automatically upon pairing Front and Back), and identification returns a candidate with populated metadata
- **THEN** the system populates the item form fields and automatically expands the item details accordion (`aria-expanded="true"`) so the user can review and save immediately

#### Scenario: Accordion stays collapsed when identification returns empty fallback
- **WHEN** **Identify with AI** errors or returns an empty candidate with no populated metadata fields
- **THEN** the item details accordion remains in its current collapsed state while surfacing the error or fallback notice above it, allowing the user to retry identification or expand the accordion manually

#### Scenario: Manual toggle preserves form state
- **WHEN** a user clicks the item details accordion header to expand it for manual entry or collapses and re-expands it after editing fields
- **THEN** the accordion toggles visibility cleanly and preserves all entered or identified form values

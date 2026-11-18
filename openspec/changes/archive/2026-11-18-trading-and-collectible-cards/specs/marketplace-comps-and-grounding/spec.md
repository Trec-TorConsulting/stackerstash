# Spec Delta

## MODIFIED Requirements

### Requirement: Zero-key comp verification links
The system SHALL generate category-appropriate pre-filled search URLs without requiring API keys and display them in the Valuation Breakdown UI: eBay Sold & Completed, Heritage Auctions, GreatCollections, and Stack's Bowers Archive for numismatic/bullion items, and eBay Sold & Completed, TCGplayer, PriceCharting, and 130point for `CARD` and card-slabbed `SLAB` items.

#### Scenario: Viewing comp links for an item with no BYOK keys
- **WHEN** a collector opens a coin or bullion item's Valuation Breakdown card
- **THEN** clickable "Verify Comps" links for eBay Sold, Heritage Auctions, GreatCollections, and Stack's Bowers open pre-filled searches for that item's year, mint mark, title, and grade

#### Scenario: Viewing comp links for a trading or Pokémon card with no BYOK keys
- **WHEN** a collector opens a `CARD` or card-slabbed `SLAB` item's Valuation Breakdown card
- **THEN** clickable "Verify Comps" links for eBay Sold, TCGplayer, PriceCharting, and 130point open pre-filled searches using the card's title, set name, card number, grading service, and grade

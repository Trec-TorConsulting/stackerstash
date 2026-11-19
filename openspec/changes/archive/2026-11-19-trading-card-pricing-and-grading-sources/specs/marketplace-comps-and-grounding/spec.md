# Spec Delta

## ADDED Requirements

### Requirement: Expanded trading card comp links
The system SHALL generate deep-link comparison URLs for trading cards covering `eBay Sold`, `TCGplayer`, `PriceCharting`, `130point`, `Beckett` (Price Guide / Marketplace), `Card Ladder`, and `Collectr`, plus grading-specific verification links for `PSA` (cert + pop/APR), `BGS`, `TAG` (DIG Report), `CGC`, and `SGC`.

#### Scenario: Trading card item shows expanded comp links
- **WHEN** a user views a trading card item detail page
- **THEN** the comps section includes clickable links for eBay Sold, TCGplayer, PriceCharting, 130point, Beckett, Card Ladder, and Collectr constructed from the card's title, set, card number, grading service, and grade

#### Scenario: TAG-graded card shows DIG Report link
- **WHEN** a trading card has `grading_service = "TAG"` and a non-empty `cert_number`
- **THEN** the verification link points to `https://my.taggrading.com/card/{cert}`

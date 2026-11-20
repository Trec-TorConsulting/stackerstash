# Spec Delta: trading-card-specs-and-catalog

## ADDED Requirements

### Requirement: Camera auto-detection intake and OCR pattern enrichment
The intake pipeline SHALL map detected card camera scans (`detectedShape === 'card'`) directly into `category = "CARD"`, initialize card framing in intake, and expand local OCR pattern heuristics to recognize card game stats (HP, ATK, DEF, Energy, Trainer, 1st Edition, Rookie/RC) and card copyright markers even when prominent franchise keywords are absent on the front artwork.

#### Scenario: Guided camera completes card capture
- **WHEN** a user captures obverse or reverse photos in guided camera with `detectedShape === 'card'`
- **THEN** the intake staging form automatically assigns `category = "CARD"`, applies card crop presets, and renders trading card specification fields

#### Scenario: Raw card OCR extraction without explicit franchise title
- **WHEN** OCR text from a raw card front contains card identifiers (such as "120 HP", "Stage 1", "Rookie Card", "RC", "1st Edition", or copyright notices like "Nintendo", "Wizards of the Coast", "Panini", "Topps", "Upper Deck", or "Bowman")
- **THEN** the local OCR parsing heuristic identifies the item as a card (`is_card = True`), assigns `category = "CARD"`, and preserves zero bullion weight/metal values

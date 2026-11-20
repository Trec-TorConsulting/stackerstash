# Spec Delta: marketplace-comps-and-grounding

## ADDED Requirements

### Requirement: Zero-key comps extraction with search grounding fallback
The system SHALL attempt lightweight zero-key public comps extraction when workspace eBay API credentials are not configured, and SHALL automatically fall back to Gemini Search Grounding to harvest sold sales and active market listings from live search citations without requiring private developer keys.

#### Scenario: Appraisal with unconfigured eBay keys falls back gracefully
- **WHEN** an appraisal runs for an item and workspace eBay credentials are not configured
- **THEN** the system attempts zero-key public extraction, falls back to Gemini Search Grounding if throttled or unavailable, and records the resulting sold and active asking quotes in `ValuationHistory.raw_payload["sources"]` with status `ZERO_KEY` or `SEARCH_GROUNDING`

#### Scenario: Grounded search prices structured into comps quote
- **WHEN** Gemini AI appraisal returns Google Search Grounding citations containing market prices for the item
- **THEN** the system parses the citations into structured high, low, and median market pricing quotes and feeds them into the comps reconciliation pipeline

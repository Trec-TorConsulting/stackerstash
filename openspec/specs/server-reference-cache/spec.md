# server-reference-cache Specification

## Purpose
Provides a server-hosted static reference catalog for common coins, bullion, Goldbacks, and grading slabs, paired with perceptual-hash and certification caches so repeated lookups and standard items resolve locally without external API or AI calls.

## Requirements

### Requirement: Server-hosted static collectible reference catalog
The system SHALL maintain an authoritative, server-side static reference dataset covering common US and world coins, bullion rounds and bars, Goldback denominations and state series, constitutional silver, and grading slab formats, and expose fast local matching against extracted text and hints.

#### Scenario: Match standard bullion or Goldback from extracted text
- **WHEN** local OCR or barcode parsing extracts identifying text such as a Goldback state and denomination or a standard bullion weight, purity, and series
- **THEN** the server resolves category, title, country, denomination, metal type, weight, purity, and physical specs directly from the static reference catalog with zero AI tokens

#### Scenario: No confident static catalog match
- **WHEN** extracted hints do not meet the match threshold for any static reference entry
- **THEN** the system returns no static match and allows downstream identification tiers to proceed

### Requirement: Perceptual image hash identification cache
The system SHALL cache successful item identification candidates keyed by normalized image content hash (SHA-256) and perceptual hash (`dHash`) so identical or visually equivalent re-submissions return immediately without calling AI providers.

#### Scenario: Exact or perceptual image cache hit
- **WHEN** a user submits an image whose SHA-256 or `dHash` matches a previously identified candidate in the workspace or shared cache
- **THEN** the system returns the cached candidate metadata immediately with zero external AI calls

### Requirement: Grading certification and numismatic metadata cache
The system SHALL cache verified grading slab certification lookups and external numismatic catalog enrichment responses on the server so repeated lookups for the same certification number or catalog identifier resolve from cache.

#### Scenario: Repeated lookup for an already cached certification number
- **WHEN** an item or intake submission references a grading service and certification number already present in the server cache
- **THEN** the system returns the cached grade, designation, and coin metadata without making an external network request

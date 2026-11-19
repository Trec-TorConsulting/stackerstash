# server-reference-cache Specification Delta

## MODIFIED Requirements

### Requirement: Grading certification and numismatic metadata cache
The system SHALL cache verified grading slab certification lookups and external numismatic catalog enrichment responses on the server so repeated lookups resolve from cache while scoping BYOK-derived and free-text numismatic query caches per workspace using full SHA-256 query keys to prevent cross-vault cache poisoning or BYOK data leakage.

#### Scenario: Repeated lookup for an already cached certification number
- **WHEN** an item or intake submission references a grading service and certification number already present in the workspace's server cache
- **THEN** the system returns the cached grade, designation, and coin metadata without making an external network request

#### Scenario: Free-text or BYOK numismatic lookup cached strictly within the originating vault
- **WHEN** Vault A executes a BYOK numismatic or cert lookup (such as a Numista query or PCGS cert query using Vault A's BYOK key)
- **THEN** the cached payload is scoped to Vault A (or keyed so Vault B without access cannot read or collide with Vault A's free-text query cache)

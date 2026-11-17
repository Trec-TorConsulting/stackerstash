# Spec Delta

## MODIFIED Requirements

### Requirement: Encrypted BYOK API key vault
The system SHALL allow each workspace owner to store, update, and delete personal API credentials (Gemini, Groq, OpenRouter, PCGS, Greysheet, Numista, NumisMedia, eBay, Ollama URL/Model) encrypted at rest and never returned in plaintext after save.

#### Scenario: Save and mask provider key
- **WHEN** a user saves a Gemini, Groq, OpenRouter, or PCGS API key in settings
- **THEN** the system encrypts the credential at rest and returns only a masked suffix in subsequent settings responses

#### Scenario: Clear provider key
- **WHEN** a user removes a stored provider credential
- **THEN** the system deletes the encrypted secret and stops using that provider for the user's workspace


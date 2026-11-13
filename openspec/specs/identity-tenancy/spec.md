# identity-tenancy Specification

## Purpose
Provides multi-tenant user accounts, workspace data isolation, role-based administration, and an encrypted per-user BYOK API key vault for external identification and pricing providers.

## Requirements

### Requirement: User registration and authentication
The system SHALL allow users to register, authenticate, and maintain authenticated sessions across mobile PWA and desktop browsers.

#### Scenario: User signs up and logs in
- **WHEN** a new user submits valid registration credentials and logs in
- **THEN** the system creates a dedicated default workspace for that user and issues an authenticated session

#### Scenario: Invalid credentials rejected
- **WHEN** a user submits an incorrect password or unknown email
- **THEN** the system rejects the request with HTTP 401 and does not leak account existence

### Requirement: Workspace tenant isolation
The system SHALL isolate all collection items, containers, photos, valuations, and provider keys strictly to the authenticated user's active workspace.

#### Scenario: Cross-tenant access blocked
- **WHEN** an authenticated user requests an item, container, or photo belonging to another user's workspace
- **THEN** the system denies access and returns HTTP 404 or 403 without exposing any record metadata

### Requirement: Encrypted BYOK API key vault
The system SHALL allow each workspace owner to store, update, and delete personal API credentials (Gemini, PCGS, Greysheet, Ollama URL) encrypted at rest and never returned in plaintext after save.

#### Scenario: Save and mask provider key
- **WHEN** a user saves a Gemini or PCGS API key in settings
- **THEN** the system encrypts the credential at rest and returns only a masked suffix in subsequent settings responses

#### Scenario: Clear provider key
- **WHEN** a user removes a stored provider credential
- **THEN** the system deletes the encrypted secret and stops using that provider for the user's workspace

### Requirement: Operator admin portal
The system SHALL provide a role-restricted administrative portal for operators to inspect user accounts, workspaces, background job health, and system configuration.

#### Scenario: Non-staff user blocked from admin portal
- **WHEN** a standard collector user navigates to the admin portal
- **THEN** the system denies access and requires staff/superuser privileges

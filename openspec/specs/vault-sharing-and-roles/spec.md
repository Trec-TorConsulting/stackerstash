# vault-sharing-and-roles Specification

## Purpose
Enables vault owners to share vaults with collaborators using hybrid in-app and link-based invitations and enforces `OWNER`, `EDITOR`, and `VIEWER` role-based permissions across API endpoints, BYOK provider execution, and the frontend UI.

## Requirements

### Requirement: Hybrid in-app and invite-link vault invitations
The system SHALL allow a vault `OWNER` to invite collaborators by email with role `EDITOR` or `VIEWER` via `POST /api/v1/auth/workspaces/{workspace_id}/invites`, generating an expiring cryptographic token and shareable `/invite/{token}` URL without requiring outbound SMTP, and allowing the owner to list or revoke pending invites.

#### Scenario: Owner creates an Editor or Viewer invite
- **WHEN** an authenticated vault `OWNER` invites `partner@example.com` with role `EDITOR`
- **THEN** the system persists a pending invitation with a unique cryptographic token and expiration timestamp, and returns HTTP 201 including the shareable `/invite/{token}` link

#### Scenario: Reject invalid invite role, self-invite, or existing member
- **WHEN** a vault `OWNER` attempts to invite with role `OWNER`, invites their own email, or invites a user who is already a member of that vault
- **THEN** the system rejects the request with HTTP 400 or HTTP 409 without creating a duplicate membership or invitation

#### Scenario: Owner revokes a pending invitation
- **WHEN** a vault `OWNER` deletes or revokes a pending invitation via `DELETE /api/v1/auth/workspaces/{workspace_id}/invites/{invite_id}`
- **THEN** the system marks the invitation revoked and subsequent attempts to preview or accept its token fail with HTTP 404 or HTTP 410

### Requirement: Invitation preview, acceptance, and decline
The system SHALL surface pending invitations in-app for matching authenticated users (`GET /api/v1/auth/invites/pending`), expose safe invitation metadata for `/invite/{token}` landing pages (`GET /api/v1/auth/invites/{token}`), and allow matching invitees to accept or decline.

#### Scenario: Existing user accepts pending invite in-app
- **WHEN** an authenticated user whose email matches a pending invitation invokes `POST /api/v1/auth/invites/{token}/accept`
- **THEN** the system creates a membership for that user in the target vault with the invited role, marks the invitation accepted, and returns the updated vault summary

#### Scenario: New user signs up via shareable invite link and accepts
- **WHEN** an unauthenticated visitor opens `/invite/{token}`, sees the vault name, inviter, and role preview, registers with the invited email address, and accepts the invitation
- **THEN** the system joins the newly created account to the shared vault with the invited role and makes the shared vault selectable alongside their own default vault

#### Scenario: Mismatched email or expired invitation rejected
- **WHEN** a user attempts to accept an expired, already-used, or revoked invitation, or is signed in with a different email than the invited address
- **THEN** the system rejects the request with HTTP 403 or HTTP 410 without granting vault membership

#### Scenario: Invitee declines a pending invitation
- **WHEN** an authenticated user whose email matches a pending invitation invokes `POST /api/v1/auth/invites/{token}/decline`
- **THEN** the system marks the invitation declined and removes it from their pending invitations list

### Requirement: Vault membership management and leaving shared vaults
The system SHALL allow any vault member to list current members (`GET /api/v1/auth/workspaces/{workspace_id}/members`), restrict role updates, member removal, and pending-invite visibility to the vault `OWNER`, and allow non-owner collaborators to leave a shared vault (`POST /api/v1/auth/workspaces/{workspace_id}/leave`).

#### Scenario: Owner updates collaborator role or removes member
- **WHEN** a vault `OWNER` updates a collaborator's role between `EDITOR` and `VIEWER` or removes them from the vault
- **THEN** the updated permission takes effect immediately on subsequent requests, or the removed user loses access and receives HTTP 403 if targeting that vault

#### Scenario: Non-owner collaborator leaves shared vault
- **WHEN** an `EDITOR` or `VIEWER` invokes `POST /api/v1/auth/workspaces/{workspace_id}/leave`
- **THEN** the system deletes only that user's membership while preserving the vault and its contents, and if that vault was active in the client, falls back to the user's default vault

#### Scenario: Owner membership cannot be removed, demoted, or abandoned
- **WHEN** an owner attempts to leave their own vault or change/remove the vault owner's `OWNER` membership
- **THEN** the system rejects the request with HTTP 400

#### Scenario: Collaborator blocked from member or invite administration
- **WHEN** an `EDITOR` or `VIEWER` attempts to create/revoke invitations, update member roles, or remove another member
- **THEN** the system rejects the request with HTTP 403

### Requirement: Role-based API permission enforcement
The system SHALL enforce `OWNER`, `EDITOR`, and `VIEWER` access controls on the active vault across all catalog, container, photo, import/export, vision, appraisal, analytics, settings, and workspace management endpoints.

#### Scenario: Viewer can read collection, analytics, and exports
- **WHEN** an authenticated `VIEWER` accesses Dashboard summary, collection items, containers, valuation history, cert verification URLs, CSV/JSON/insurance exports, or triggers a global spot price refresh
- **THEN** the system returns HTTP 200 with the active shared vault's read-only data

#### Scenario: Viewer blocked from mutating items, containers, photos, vision, or appraisals
- **WHEN** an authenticated `VIEWER` sends any create, update, delete, bulk mutation, photo upload/rotate/primary/delete, CSV import, Vision AI identify, or item appraisal request
- **THEN** the system denies the action with HTTP 403 and makes no vault modifications

#### Scenario: Editor can catalog, import, run vision identification, and trigger appraisals
- **WHEN** an authenticated `EDITOR` creates or edits items, manages containers and photos, imports CSVs, runs Vision AI identification, or triggers item appraisals in the shared vault
- **THEN** the system executes those operations against the shared vault and persists the changes

#### Scenario: Editor and Viewer blocked from vault settings, deletion, and BYOK management
- **WHEN** an `EDITOR` or `VIEWER` attempts to update vault settings (`PATCH /settings/workspace` or `PATCH /auth/workspaces/{id}`), set default, delete the vault, or read/write/delete BYOK credentials
- **THEN** the system rejects the request with HTTP 403

### Requirement: Owner-backed BYOK credential execution without key exposure
When an `EDITOR` invokes Vision AI identification, background auto-sort, or item appraisals in a shared vault, the system SHALL resolve provider credentials from the shared vault (or fall back to the vault `OWNER`'s default vault keys) while preventing non-owners from viewing masked key hints or configuration status.

#### Scenario: Editor appraisal uses Owner's inherited API key
- **WHEN** a vault `OWNER` has Gemini or PCGS keys configured on their default vault and an `EDITOR` triggers Vision AI or an item appraisal in a shared vault owned by that `OWNER`
- **THEN** the backend executes the identification or appraisal using the resolved owner credential without failing for missing keys

#### Scenario: Collaborator cannot view or alter BYOK credentials
- **WHEN** an `EDITOR` or `VIEWER` requests `GET /settings/credentials` or attempts `PUT`/`DELETE` on `/settings/credentials/{provider}`
- **THEN** the system returns HTTP 403 without leaking `masked_hint` or `is_configured` metadata

### Requirement: Role-aware navigation, sharing UI, and read-only enforcement
The web and PWA client SHALL display active shared-vault role badges, provide an in-app pending invitations banner and `/invite/:token` onboarding page, hide or disable write actions for `VIEWER`s, and show sharing/member controls in Settings gated by the active user's role.

#### Scenario: Viewer sees read-only interface
- **WHEN** a user switches into a shared vault where their role is `VIEWER`
- **THEN** the UI displays a `Shared • Viewer` badge, hides Scan/Add navigation, Import CSV, bulk selection/edit/delete bars, container creation/deletion, and Item Detail edit/appraise/photo controls, while preserving read-only browsing and exports

#### Scenario: Editor sees cataloging controls and non-owner Settings view
- **WHEN** a user switches into a shared vault where their role is `EDITOR`
- **THEN** they retain full cataloging, Scan/Add, container, and appraisal controls, while Settings displays the Shared Vault overview, member list, and **Leave Shared Vault** action instead of Owner-only vault settings and BYOK key inputs

#### Scenario: Owner manages collaborators and pending invites in Settings
- **WHEN** a vault `OWNER` opens Settings for an owned vault
- **THEN** they can invite collaborators by email (`Editor` or `Viewer`), copy shareable `/invite/:token` links, change existing member roles, remove members, and revoke pending invitations

#### Scenario: Signed-in user discovers and accepts pending invite in-app
- **WHEN** a signed-in user has one or more pending invitations addressed to their account email
- **THEN** the application surfaces a Pending Invitations banner or prompt allowing one-click **Accept** or **Decline** without needing an external email client

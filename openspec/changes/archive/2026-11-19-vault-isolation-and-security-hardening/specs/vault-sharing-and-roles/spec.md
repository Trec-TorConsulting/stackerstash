# vault-sharing-and-roles Specification Delta

## MODIFIED Requirements

### Requirement: Hybrid in-app and invite-link vault invitations
The system SHALL allow a vault `OWNER` to invite collaborators by email with role `EDITOR` or `VIEWER` via `POST /api/v1/auth/workspaces/{workspace_id}/invites`, generating an expiring cryptographic token and shareable `/invite/{token}` URL without requiring outbound SMTP, and allowing the owner to list or revoke pending invites while redacting tokens on non-pending invites.

#### Scenario: Owner creates an Editor or Viewer invite
- **WHEN** an authenticated vault `OWNER` invites `partner@example.com` with role `EDITOR`
- **THEN** the system persists a pending invitation with a unique cryptographic token and expiration timestamp, and returns HTTP 201 including the shareable `/invite/{token}` link

#### Scenario: Reject invalid invite role, self-invite, or existing member
- **WHEN** a vault `OWNER` attempts to invite with role `OWNER`, invites their own email, or invites a user who is already a member of that vault
- **THEN** the system rejects the request with HTTP 400 or HTTP 409 without creating a duplicate membership or invitation

#### Scenario: Owner revokes a pending invitation
- **WHEN** a vault `OWNER` deletes or revokes a pending invitation via `DELETE /api/v1/auth/workspaces/{workspace_id}/invites/{invite_id}`
- **THEN** the system marks the invitation revoked and subsequent attempts to preview or accept its token fail with HTTP 404 or HTTP 410

#### Scenario: Non-pending invitation tokens are redacted in owner invite listings
- **WHEN** a vault `OWNER` lists invitations via `GET /api/v1/auth/workspaces/{workspace_id}/invites` and the list includes `ACCEPTED`, `DECLINED`, or `REVOKED` invitations
- **THEN** the response includes full `token` and `invite_path` only for unexpired `PENDING` invitations and returns empty strings for `token` and `invite_path` on non-pending or expired invitations

### Requirement: Invitation preview, acceptance, and decline
The system SHALL surface pending invitations in-app for matching authenticated users (`GET /api/v1/auth/invites/pending`), expose privacy-masked invitation metadata only for active pending `/invite/{token}` landing pages (`GET /api/v1/auth/invites/{token}`), and allow matching invitees who are not already vault members to accept or decline.

#### Scenario: Existing user accepts pending invite in-app
- **WHEN** an authenticated user whose email matches a pending invitation invokes `POST /api/v1/auth/invites/{token}/accept`
- **THEN** the system creates a membership for that user in the target vault with the invited role, marks the invitation accepted, and returns the updated vault summary

#### Scenario: New user signs up via shareable invite link and accepts
- **WHEN** an unauthenticated visitor opens `/invite/{token}`, sees the vault name, masked inviter, and role preview, registers with the invited email address, and accepts the invitation
- **THEN** the system joins the newly created account to the shared vault with the invited role and makes the shared vault selectable alongside their own default vault

#### Scenario: Mismatched email or expired invitation rejected
- **WHEN** a user attempts to accept an expired, already-used, or revoked invitation, or is signed in with a different email than the invited address
- **THEN** the system rejects the request with HTTP 403 or HTTP 410 without granting vault membership

#### Scenario: Invitee declines a pending invitation
- **WHEN** an authenticated user whose email matches a pending invitation invokes `POST /api/v1/auth/invites/{token}/decline`
- **THEN** the system marks the invitation declined and removes it from their pending invitations list

#### Scenario: Revoked, declined, accepted, or expired invitation preview rejected without metadata disclosure
- **WHEN** a caller requests `GET /api/v1/auth/invites/{token}` for an invitation that is `REVOKED`, `DECLINED`, `ACCEPTED`, or past `expires_at`
- **THEN** the system rejects the preview with HTTP 410 without returning the vault name, workspace ID, owner email, or invitee email

#### Scenario: Existing member cannot overwrite their role by accepting a stale invite token
- **WHEN** a user who is already a member of a vault attempts to accept a pending invitation token for that same vault
- **THEN** the system rejects the request with HTTP 409 and preserves the member's existing role unchanged

### Requirement: Owner-backed BYOK credential execution without key exposure
When an `EDITOR` invokes Vision AI identification, background auto-sort, or item appraisals in a shared vault, the system SHALL resolve provider credentials from the shared vault (or fall back to the vault `OWNER`'s default vault keys) while preventing non-owners from viewing masked key hints, configuration status, or raw upstream exception strings containing secret tokens.

#### Scenario: Editor appraisal uses Owner's inherited API key
- **WHEN** a vault `OWNER` has Gemini or PCGS keys configured on their default vault and an `EDITOR` triggers Vision AI or an item appraisal in a shared vault owned by that `OWNER`
- **THEN** the backend executes the identification or appraisal using the resolved owner credential without failing for missing keys

#### Scenario: Collaborator cannot view or alter BYOK credentials
- **WHEN** an `EDITOR` or `VIEWER` requests `GET /settings/credentials` or attempts `PUT`/`DELETE` on `/settings/credentials/{provider}`
- **THEN** the system returns HTTP 403 without leaking `masked_hint` or `is_configured` metadata

#### Scenario: Provider error diagnostics in shared valuation history and appraisal jobs are redacted
- **WHEN** an external appraisal or deferred AI enrichment provider raises an error containing a query-string `key=...`, `Authorization: Bearer ...`, or API token and a collaborator views `ValuationHistory`, `AppraisalJob`, or item details in the shared vault
- **THEN** all persisted and returned error messages have credentials and tokens scrubbed before storage

# Spec Delta

## Purpose

Ensures complete end-to-end CRUD across accounts, containers, items, photos, and authenticated exports, enforces HMAC-signed production media access and readiness diagnostics, and delivers enterprise-grade error handling, confirmations, and accessibility polish.

## ADDED Requirements

### Requirement: Self-service account profile, password change, and deletion
The system SHALL allow authenticated users to update their display name (`PATCH /api/v1/auth/me`), change their password after verifying their current password (`POST /api/v1/auth/change-password`), and delete their account with password confirmation (`DELETE /api/v1/auth/me`) from Settings.

#### Scenario: Update display name and change password
- **WHEN** an authenticated user updates their display name or submits a valid current password and matching 8+ character new password
- **THEN** the system persists the changes, returns updated user details, and authenticates subsequent logins using the new password

#### Scenario: Incorrect current password rejected
- **WHEN** a user submits an incorrect current password to change password or delete their account
- **THEN** the system rejects the request with HTTP 400 or HTTP 403 and preserves the existing password and account

#### Scenario: Self-service account deletion removes user data
- **WHEN** an authenticated user confirms account deletion with their valid password
- **THEN** the system removes their user record and owned single-owner workspace data (cleaning up stored media files) and returns HTTP 204

### Requirement: Complete container editing, hierarchy safety, and drill-down
The system SHALL support full container creation, editing (`name`, `container_type`, `parent_id`, `location_notes`), unlimited-depth parent selection, ancestor-cycle prevention (`HTTP 400`), accurate rolled-up totals on updates, click-through item filtering (`/collection?container_id=...`), and confirmation before deleting containers.

#### Scenario: Edit container name, parent, and location notes
- **WHEN** a user edits an existing container in the Containers page to change its name, type, parent container (including nested level 3+ containers), or location notes
- **THEN** `PATCH /api/v1/catalog/containers/{container_id}` persists the changes, returns recalculated item counts/totals, and updates the container tree UI

#### Scenario: Multi-hop circular parent assignment rejected
- **WHEN** a user attempts to set container A's parent to descendant container B (creating an `A -> B -> A` cycle)
- **THEN** the system rejects the update with HTTP 400 and preserves the valid acyclic hierarchy

#### Scenario: Container card drills down to filtered items
- **WHEN** a user clicks a container's "View Items" action on the Containers page
- **THEN** the application navigates to `/collection?container_id={id}` and filters the collection to items stored in that container

### Requirement: Complete collection item edit fields, duplication, container filtering, and exports
The system SHALL allow users to edit financial (`purchase_price`, `sold_price`, `sold_date`), bullion (`metal_type`, `weight_value`, `weight_unit`, `purity`), tag, and trading card fields in Item Detail, clone an item (`POST /api/v1/catalog/items/{item_id}/duplicate`), filter Collection by container, map all card/financial fields in CSV import, and download CSV, JSON, and Insurance reports using authenticated requests.

#### Scenario: Edit cost basis, sold details, metal, and tags on Item Detail
- **WHEN** a user edits an item on the Item Detail page to update `purchase_price`, mark `status = SOLD` with `sold_price` and `sold_date`, correct `metal_type`/`weight_value`/`purity`, or update `tags` and trading card attributes
- **THEN** the backend persists all updated fields, recalculates fine weight, melt value, and Dashboard realized P&L, and refreshes the item view

#### Scenario: Clone an existing item
- **WHEN** a user clicks **Duplicate Item** on an item detail page (`POST /api/v1/catalog/items/{item_id}/duplicate`)
- **THEN** the system creates a new item copying catalog attributes (clearing unique `cert_number` and `sold_*` fields and appending `" (Copy)"` to the title) and opens the cloned item

#### Scenario: Filter collection by container and download authenticated exports
- **WHEN** a user selects a container filter on `/collection` (or loads `/collection?container_id=...`) and clicks **Export CSV** or **Export JSON**
- **THEN** the collection filters by that container and exports execute via authenticated `Authorization` fetches rather than unauthenticated browser links

### Requirement: Item photo deletion, label selection, and thumbnail storage cleanup
The system SHALL allow users on Item Detail to choose a photo label when uploading, delete individual photos with confirmation, display thumbnail derivatives in the photo strip, and delete both full-size image and thumbnail files from storage whenever a photo or item is deleted.

#### Scenario: Upload labeled photo and delete individual photo
- **WHEN** a user selects `SLAB_LABEL` or `ASSAY` while uploading an additional photo on Item Detail, or confirms deletion of an existing photo
- **THEN** the system persists the chosen label on upload, or deletes the photo record, reassigns `is_primary` if needed, and removes both image and thumbnail files from storage

#### Scenario: Item and bulk deletion clean up thumbnail files
- **WHEN** a user deletes a single item or runs bulk delete on items with photos and thumbnails
- **THEN** the system deletes both `image` and `thumbnail` files from storage alongside the database records

### Requirement: HMAC-signed production media access control
The system SHALL serve uploaded media files through coarse-bucketed expiring HMAC-signed URLs (`/media/s/<exp>/<sig>/<relative_path>`), embedding valid signatures on serialized `url`, `thumbnail_url`, `primary_photo_url`, and `primary_thumbnail_url` fields while rejecting unsigned, expired, tampered, or traversal media paths.

#### Scenario: Signed media URL serves photo when DEBUG is false
- **WHEN** an authenticated item/photo response returns a signed `/media/s/<exp>/<sig>/...webp` URL and a client requests that URL with `DEBUG=false`
- **THEN** the server validates the HMAC signature and expiration and serves the image file with HTTP 200

#### Scenario: Unsigned, tampered, or expired media URL rejected
- **WHEN** a client requests an unsigned `/media/workspaces/...` URL, a modified signature, an expired timestamp, or a path containing `..`
- **THEN** the system denies access with HTTP 403 or HTTP 404 without serving any file

### Requirement: Production readiness probe, concurrency safety, and admin job health
The system SHALL verify both database and configured Redis connectivity in `/readyz`, serialize background CSV appraisal threads on SQLite to avoid table locks, enforce production security settings when `DEBUG` is false, and surface background job health metrics in the Global Admin Portal.

#### Scenario: Readiness probe reports 503 when Redis is unreachable
- **WHEN** `GET /readyz` runs with Redis configured and Redis fails a ping check
- **THEN** `/readyz` returns HTTP 503 reporting the dependency failure

#### Scenario: Global Admin inspects background job health metrics
- **WHEN** a Global Admin views the Admin Portal overview (`GET /api/v1/admin/overview`)
- **THEN** the overview reports `pending_appraisals`, `running_appraisals`, `failed_appraisals_24h`, `deferred_ai_items`, and `recent_identifications_24h` alongside database and Redis readiness status

### Requirement: Global error recovery, toast feedback, destructive confirmations, and accessibility
The frontend SHALL wrap routes in a crash-recovering ErrorBoundary, display toast notifications and Retry states for failed queries or mutations, confirm destructive deletions via accessible modal dialogs, allow mobile pinch-to-zoom, and provide password visibility and confirmation UX on authentication forms.

#### Scenario: Failed mutation or query shows visible error feedback and retry
- **WHEN** a container update, item edit, photo rotation, Settings save, or Dashboard query fails
- **THEN** the UI surfaces a clear error toast or inline Retry banner rather than failing silently or spinning indefinitely

#### Scenario: Destructive delete requires modal confirmation
- **WHEN** a user clicks delete on an item, photo, container, or account
- **THEN** an accessible confirmation dialog explains the impact (including cascading child containers or permanent removal) before executing the delete request

#### Scenario: Mobile viewport permits pinch-to-zoom
- **WHEN** the application loads on a mobile browser
- **THEN** the HTML viewport metadata does not specify `user-scalable=no` or `maximum-scale=1.0`, allowing standard pinch-to-zoom accessibility

# vercel-serverless-deployment Specification

## Purpose

Defines the primary production deployment architecture on Vercel for `stackerstash.com`, combining static Edge delivery of the React PWA with Python WSGI serverless functions, Vercel Cron Jobs, managed serverless Postgres, S3-compatible object storage for signed media assets, and K3s cutover tooling.

## ADDED Requirements

### Requirement: Unified Vercel routing for frontend SPA and Python WSGI backend
The system SHALL provide a root Vercel configuration and Python WSGI entrypoint that routes `/api/*`, `/super-admin/*`, `/media/*`, `/static/*`, `/healthz`, and `/readyz` to the Django backend while serving prerendered marketing routes, PWA assets, and `/admin` SPA fallbacks from the frontend static build.

#### Scenario: API and Django super-admin requests route to Python serverless function
- **WHEN** a client requests `/api/v1/catalog/items`, `/super-admin/`, `/healthz`, or `/readyz` on the Vercel deployment
- **THEN** Vercel invokes the Python WSGI serverless function and returns the Django response

#### Scenario: SPA routes and prerendered pages resolve from Edge static output
- **WHEN** a client requests `/`, `/pricing`, `/collection`, or `/admin` on the Vercel deployment
- **THEN** Vercel serves the corresponding prerendered HTML or SPA `/index.html` from the frontend static build without invoking the Python function

### Requirement: Authenticated Vercel Cron Job endpoints replacing Celery Beat
The backend SHALL expose `/api/v1/cron/spot-refresh`, `/api/v1/cron/ai-enrichment`, and `/api/v1/cron/reappraise-stale` endpoints authenticated via constant-time verification of `Authorization: Bearer <CRON_SECRET>` so Vercel Cron Jobs execute scheduled tasks without Celery Beat or Redis.

#### Scenario: Valid CRON_SECRET triggers scheduled spot price refresh
- **WHEN** Vercel Cron sends a request to `/api/v1/cron/spot-refresh` with a valid `Authorization: Bearer <CRON_SECRET>` header
- **THEN** the backend refreshes live spot prices and returns HTTP 200 with the updated spot summary

#### Scenario: Missing or invalid CRON_SECRET is rejected
- **WHEN** a request arrives at any `/api/v1/cron/*` endpoint without a configured `CRON_SECRET` or with an invalid bearer token
- **THEN** the backend rejects the request with HTTP 401 or HTTP 503 without executing the task

### Requirement: Serverless readiness probe without mandatory Redis
The `/readyz` readiness endpoint SHALL succeed when the primary database is healthy and Redis is unconfigured in serverless environments, while continuing to verify Redis connectivity when `READY_CHECK_REDIS` is explicitly enabled.

#### Scenario: Serverless readiness check passes without Redis
- **WHEN** `/readyz` is called in a Vercel deployment where Postgres is reachable and `REDIS_URL` is unset
- **THEN** `/readyz` returns HTTP 200 with `{"status": "ready"}`

### Requirement: Managed serverless Postgres connection pooling and TLS support
The database configuration SHALL support managed Postgres connection strings (`DATABASE_URL`) with TLS (`sslmode`), connection health checks (`CONN_HEALTH_CHECKS`), zero-persistent connection defaults in serverless mode (`CONN_MAX_AGE=0` unless overridden), and optional `DISABLE_SERVER_SIDE_CURSORS` for transaction-mode connection poolers.

#### Scenario: Transaction-pooled managed Postgres connection configured
- **WHEN** `DATABASE_URL` points to a managed Postgres pooler with `DB_DISABLE_SERVER_SIDE_CURSORS=true` and `VERCEL=1`
- **THEN** Django enables connection health checks, disables server-side cursors, and sets `CONN_MAX_AGE` to `0` unless explicitly overridden

### Requirement: S3-compatible object storage for item photos with HMAC-signed delivery
When S3-compatible storage credentials are configured, the system SHALL store and delete item photos and thumbnails in the remote object bucket and serve them through HMAC-signed `/media/s/<exp>/<sig>/<rel_path>` URLs with workspace `media_key_version` enforcement and private security headers.

#### Scenario: Uploading and serving a signed item photo from S3-compatible storage
- **WHEN** S3 storage is configured and a user uploads an item photo and requests its signed `/media/s/...` URL
- **THEN** the processed image and thumbnail are stored in the S3 bucket and `/media/s/...` streams the object with `Cache-Control: private, max-age=3600, no-transform` and `X-Content-Type-Options: nosniff`

#### Scenario: Local filesystem fallback when S3 is not configured
- **WHEN** S3 storage environment variables are unset in local development or self-hosted K3s
- **THEN** the system stores and serves item photos from local `MEDIA_ROOT` using `FileSystemStorage`

### Requirement: Full K3s-to-Vercel database migration and parity verification
The system SHALL provide automated database migration tooling to transfer all application models from the K3s PostgreSQL database (`SOURCE_DATABASE_URL` or snapshot archive) into the target managed Postgres database (`DATABASE_URL`) in foreign-key dependency order, preserving UUIDs and timestamps, validating or re-encrypting Fernet `ProviderCredential` secrets, and verifying source-to-target row-count parity.

#### Scenario: Operator migrates all application records from K3s Postgres to managed Postgres
- **WHEN** an operator runs the database migration command with a K3s `SOURCE_DATABASE_URL` or exported snapshot targeting the new managed Postgres `DATABASE_URL`
- **THEN** all users, subscriptions, dedicated instances, workspaces, memberships, invitations, encrypted provider credentials, hierarchical containers, collection items, item photos, spot snapshots, valuation history, appraisal jobs, identification jobs, and caches are upserted transactionally with identical UUIDs, timestamps, and verified row-count parity

#### Scenario: Encrypted BYOK credentials are verified or re-encrypted during database migration
- **WHEN** the database migration runs with either the preserved K3s `FIELD_ENCRYPTION_KEY` or a `--source-encryption-key` rotation flag
- **THEN** every migrated `ProviderCredential` row is verified to decrypt cleanly under the target `FIELD_ENCRYPTION_KEY` and any decryption mismatch aborts the transaction before cutover

### Requirement: K3s-to-Vercel media object synchronization and integrity verification
The system SHALL provide a management command and migration runner to sync existing local or K3s Longhorn PVC media files (`workspaces/<ws_id>/items/<item_id>/*`) to S3-compatible object storage and verify that every migrated `ItemPhoto` record's image and thumbnail exist in target storage.

#### Scenario: Operator syncs existing media directory to S3 bucket and verifies ItemPhoto references
- **WHEN** an operator runs the media sync management command against a directory of existing `workspaces/<ws_id>/items/<item_id>/*` files with database verification enabled
- **THEN** all missing item photo and thumbnail files are uploaded to the configured S3-compatible storage bucket preserving their relative paths and the command confirms zero broken `ItemPhoto` storage references

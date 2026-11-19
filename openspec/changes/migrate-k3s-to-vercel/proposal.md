# Proposal

## Why

Running Stacker Stash (`stackerstash.com`) on the self-hosted HomeLab K3s cluster requires manually building and pushing multi-arch OCI images to a private registry, maintaining five long-running stateful/stateless workloads (Gunicorn, Celery worker, Celery beat, Nginx frontend, Redis), managing Longhorn PVCs for media storage, and handling an unexposed production `/media` gap. Migrating primary production to a unified Vercel deployment with managed Postgres and S3-compatible object storage eliminates Kubernetes operational overhead, replaces Celery/Redis with zero-maintenance Vercel Cron Jobs and inline execution, and resolves production media persistence while retaining K3s artifacts as a legacy/self-hosted deployment option.

## What Changes

- **Unified Vercel Frontend & Python Serverless Backend Deployment**: Add a root `vercel.json` and Vercel Python WSGI serverless entrypoint (`api/index.py`) so Vercel builds and serves the Vite React SPA (including prerendered SEO marketing HTML and PWA assets) from the Edge CDN while routing `/api/*`, `/super-admin/*`, `/media/*`, `/static/*`, `/healthz`, and `/readyz` to the Django Ninja backend function.
- **Vercel Cron Jobs & Celery/Redis Elimination for Production**: Replace Celery Beat (`refresh_spot_prices_task` every 5m, `process_deferred_ai_enrichment_task` every 15m, and `reappraise_stale_items_task`) with Vercel Cron Jobs targeting authenticated `/api/v1/cron/*` endpoints verified via `CRON_SECRET`. Execute item and workspace auto-sort synchronously/inline when running in serverless mode (`VERCEL=1`, `AUTO_SORT_INLINE=true`, or when no `REDIS_URL` broker is configured) while keeping `/readyz` healthy without Redis.
- **Managed Postgres Serverless Connection Support**: Extend `DATABASES` configuration in `backend/config/settings.py` for managed serverless Postgres (Neon / Vercel Postgres via `DATABASE_URL`) with connection health checks (`CONN_HEALTH_CHECKS`), serverless connection lifetime defaults (`CONN_MAX_AGE=0` on Vercel unless overridden), and optional `DISABLE_SERVER_SIDE_CURSORS` for PgBouncer transaction poolers.
- **S3-Compatible Object Storage for Item Media**: Support S3-compatible object storage (Cloudflare R2, AWS S3, or Vercel Blob S3 adapter) for `ItemPhoto` images and thumbnails via configurable `S3_*` environment variables, falling back to `FileSystemStorage` in local dev and legacy self-hosted K3s. Update `serve_media` and `verify_signed_media_path` to stream HMAC-signed `/media/s/<exp>/<sig>/<rel_path>` assets from `default_storage` with identical security headers and workspace `media_key_version` revocation.
- **Full K3s-to-Vercel Database & Media Migration Tooling + Legacy Self-Hosted Retention**: Add automated database migration tooling (`migrate_database_state` management command and K3s tunnel/export orchestration script `scripts/migrate_k3s_to_vercel.sh`) that migrates all 16 application models (`User`, `AccountSubscription`, `DedicatedServerInstance`, `Workspace`, `WorkspaceMembership`, `WorkspaceInvitation`, `ProviderCredential`, hierarchical `Container`, `CollectionItem`, `ItemPhoto`, `SpotPriceSnapshot`, `ValuationHistory`, `AppraisalJob`, `IdentificationJob`, `ImageIdentificationCache`, `CertLookupCache`) from the K3s cluster PostgreSQL database (`stackerstash`) to the new managed Postgres database (`DATABASE_URL`) via direct `SOURCE_DATABASE_URL` streaming or portable snapshot files, verifies/re-encrypts Fernet `ProviderCredential` secrets (`FIELD_ENCRYPTION_KEY`), validates post-migration row-count and foreign-key parity, and syncs `/app/media` Longhorn PVC files to S3-compatible storage (`sync_media_to_storage`), while keeping `deploy/chart/` and K3s documentation intact as a legacy/self-hosted option.

## Capabilities

### New Capabilities
- `vercel-serverless-deployment`: Unified Vercel production deployment architecture covering the Python WSGI serverless function entrypoint, Vercel Edge routing and cron jobs (`/api/v1/cron/*` secured by `CRON_SECRET`), managed serverless Postgres configuration, S3-compatible object storage backing HMAC-signed `/media/` delivery, and K3s-to-Vercel data and media migration tooling.

### Modified Capabilities
- `k3s-deployment`: Reclassify the HomeLab K3s cluster and `deploy/chart/` from the sole production target to a supported legacy/self-hosted deployment target, and define the data/media export path for migrating live K3s state to Vercel.
- `seo-social-and-edge-delivery`: Expand edge security header, clean prerendered HTML routing, and cache-control isolation requirements to cover Vercel Edge delivery (`vercel.json`) alongside the container Nginx configuration.
- `auto-sort-classification`: Support synchronous/inline deterministic auto-sort execution in serverless environments where no Celery/Redis broker is provisioned, alongside existing background dispatch for self-hosted deployments.

## Impact

- **Repository Root & Vercel Configuration**: New `vercel.json`, `api/index.py` WSGI serverless entrypoint, `requirements.txt` (or `pyproject.toml` dependency export for Vercel Python builder), and `.env.example` updates (`CRON_SECRET`, `S3_*`, `DB_DISABLE_SERVER_SIDE_CURSORS`).
- **Backend (`backend/`)**:
  - `config/settings.py`: Managed Postgres pooler flags, S3-compatible `STORAGES["default"]` configuration, serverless `REDIS_URL` / `READY_CHECK_REDIS` defaults, and Vercel host/origin handling.
  - `config/urls.py` & `config/media_signing.py`: Storage-agnostic HMAC-signed media verification and streaming via `default_storage`.
  - `apps/valuation/api.py` (or `config/cron_api.py`): Authenticated `/api/v1/cron/spot-refresh`, `/api/v1/cron/ai-enrichment`, and `/api/v1/cron/reappraise-stale` endpoints.
  - `apps/catalog/auto_sort.py`: Inline execution path when running on Vercel or without an active Celery broker.
  - `apps/catalog/management/commands/migrate_database_state.py`: Full database migration and verification command supporting live `SOURCE_DATABASE_URL` or snapshot import across all 16 models in topological FK order, Fernet `FIELD_ENCRYPTION_KEY` verification/rotation, sequence resets, and row-count/checksum parity checks.
  - `apps/catalog/management/commands/sync_media_to_storage.py`: Media migration utility for uploading local/PVC media files to S3-compatible object storage and verifying all `ItemPhoto` records resolve in target storage.
  - `scripts/migrate_k3s_to_vercel.sh`: End-to-end K3s cluster extraction and Vercel database + media migration runner.
- **Documentation (`README.md`, `docs/VERCEL_MIGRATION.md`, `openspec/config.yaml`)**: Primary Vercel production deployment instructions, K3s-to-Vercel cutover guide, and legacy K3s self-hosted section.

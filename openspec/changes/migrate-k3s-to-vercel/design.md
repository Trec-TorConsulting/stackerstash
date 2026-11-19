# Design

## Context

Stacker Stash currently deploys to a self-hosted HomeLab K3s cluster (`namespace: stackerstash`) consisting of five Kubernetes workloads: `stackerstash-backend` (Django 5 + Gunicorn), `stackerstash-worker` (Celery worker), `stackerstash-beat` (Celery Beat scheduler), `stackerstash-frontend` (Nginx serving Vite static build and reverse-proxying `/api/`, `/super-admin/`, `/static/`, `/media/`), and `redis` (backed by a 1Gi Longhorn PVC), alongside an external cluster PostgreSQL instance and a 20Gi Longhorn `ReadWriteMany` media PVC mounted at `/app/media`. See `proposal.md` for the motivation to migrate primary production to Vercel while preserving K3s artifacts as a legacy/self-hosted option.

Key constraints shaping the design:
- **100% Test Coverage Gate**: Both `backend/` (pytest `--cov-fail-under=100`) and `frontend/` (vitest 100% lines/statements/functions) enforce strict 100% coverage and zero Bandit/Ruff/pip-audit/npm-audit violations via `scripts/security_and_coverage.sh`.
- **Ephemeral Serverless Filesystem**: Vercel Python Serverless Functions run in a read-only filesystem (except `/tmp`), requiring all persistent user uploads (`ItemPhoto.image` and `ItemPhoto.thumbnail`) to be stored in external S3-compatible object storage while preserving the existing HMAC-signed `/media/s/<exp>/<sig>/<rel_path>` security contract and workspace `media_key_version` instant revocation.
- **No Long-Running Daemons on Vercel**: Celery worker/beat processes and daemon threads cannot persist past an HTTP response lifecycle on Vercel; periodic jobs must be driven by Vercel Cron HTTP requests and fast deterministic tasks (auto-sort) must execute synchronously inline.

## Goals / Non-Goals

**Goals:**
- Unify the Vite React SPA and Django Ninja backend into a single root-level Vercel project configuration (`vercel.json` + `api/index.py`).
- Replace Celery Beat and Redis in production with authenticated `/api/v1/cron/*` endpoints invoked by Vercel Cron Jobs and synchronous inline auto-sort execution.
- Support S3-compatible object storage (Cloudflare R2, AWS S3, or Vercel Blob S3 API) for `ItemPhoto` assets while keeping `FileSystemStorage` as the automatic default for local development and legacy K3s.
- Harden Django's PostgreSQL configuration for serverless connection pooling (Neon / Vercel Postgres PgBouncer transaction mode).
- Provide a repeatable, automated K3s-to-Vercel full database and media migration workflow (`migrate_database_state` and `sync_media_to_storage` management commands, `scripts/migrate_k3s_to_vercel.sh` orchestration script, and `docs/VERCEL_MIGRATION.md`).

**Non-Goals:**
- Rewriting the Django Ninja backend into Next.js or Node.js API routes.
- Removing `docker-compose.yml`, `deploy/chart/`, or local SQLite development workflows.
- Breaking existing local or self-hosted Celery/Redis functionality when `REDIS_URL` is explicitly configured.

## Decisions

### 1. Unified Monorepo Vercel Topology (`vercel.json` + `api/index.py`)
- **Decision**: Place `vercel.json` at the repository root and expose a thin WSGI entrypoint at `api/index.py` that adds `backend/` to `sys.path`, sets `DJANGO_SETTINGS_MODULE="config.settings"`, and exports `app = application` from `config.wsgi`. Configure Vercel to build the frontend (`cd frontend && npm ci && npm run build`) into `frontend/dist` and route `/api/(.*)`, `/super-admin/(.*)`, `/media/(.*)`, `/static/(.*)`, `/healthz`, and `/readyz` to `/api/index.py`, while serving static files, prerendered marketing HTML (`/features`, `/pricing`, `/security`, `/privacy`, `/terms`, `/marketing`, `/coming-soon`), and SPA fallbacks from the Edge CDN.
- **Rationale**: Keeping frontend and backend under the same Vercel deployment and origin (`https://stackerstash.com`) preserves same-origin cookie/CSRF behavior, avoids CORS preflight latency, keeps `/media/` URLs on the same origin for the PWA Service Worker `CacheFirst` strategy and `img-src 'self'` CSP, and matches the routing table previously handled by K3s `HTTPRoute` and `frontend/nginx.conf`.
- **Alternatives Considered**:
  - *Separate Vercel project for frontend + external container host (Railway/Fly.io) for backend*: Rejected per user architecture selection; splits deployment pipelines and requires cross-origin proxy or subdomain management.
  - *Porting backend to Next.js API routes*: Rejected; Django Ninja provides 100%-tested multi-tenant auth, Fernet BYOK encryption, RapidOCR/Pillow image processing, and multi-source valuation logic.

### 2. Vercel Cron Jobs + Synchronous Inline Auto-Sort Instead of Celery/Redis
- **Decision**:
  1. Add a cron router mounted at `/api/v1/cron/` with three endpoints:
     - `GET/POST /api/v1/cron/spot-refresh` → calls `refresh_spot_prices_task()` synchronously.
     - `GET/POST /api/v1/cron/ai-enrichment` → calls `process_deferred_ai_enrichment_task()` synchronously.
     - `GET/POST /api/v1/cron/reappraise-stale` → calls `reappraise_stale_items_task()` synchronously.
  2. Authenticate all `/api/v1/cron/*` requests using a dedicated `CRON_SECRET` environment variable compared via `hmac.compare_digest` against the `Authorization: Bearer <token>` header (which Vercel Cron automatically sends when `CRON_SECRET` is set in the Vercel project). If `CRON_SECRET` is unset, return HTTP `503`; if the header is missing or mismatched, return HTTP `401`.
  3. Update `backend/config/settings.py` and `backend/apps/catalog/auto_sort.py` so `REDIS_URL` defaults to `""` when not explicitly set in the environment, `READY_CHECK_REDIS` defaults to `false` unless explicitly enabled or `REDIS_URL` is set in non-Vercel container mode, and `_dispatch_background(fn, *args)` runs `fn(*args)` synchronously inline whenever `VERCEL` is truthy, `AUTO_SORT_INLINE` is truthy, `CELERY_TASK_ALWAYS_EAGER` is truthy, or `CELERY_BROKER_URL` is empty.
- **Rationale**: Vercel serverless functions freeze execution immediately after returning an HTTP response, making fire-and-forget `threading.Thread` unreliable and Celery workers impossible without an external host. Deterministic auto-sort runs in sub-millisecond in-memory Python (`classify_item_deterministic`), so executing it inline on `transaction.on_commit` adds negligible latency while guaranteeing classification completes before the serverless invocation exits.
- **Alternatives Considered**:
  - *Upstash Redis + external Celery worker*: Adds an extra paid service and separate container deployment for three lightweight periodic tasks and a deterministic classifier.

### 3. S3-Compatible Object Storage Behind HMAC-Signed `/media/` Streaming
- **Decision**:
  1. Add `django-storages[s3]` (and `boto3`) to backend dependencies and configure `STORAGES["default"]` in `backend/config/settings.py` to use `storages.backends.s3.S3Storage` whenever `S3_BUCKET_NAME` (or `AWS_STORAGE_BUCKET_NAME`) is non-empty, supporting `S3_ENDPOINT_URL` (for Cloudflare R2, Vercel Blob S3 adapter, or MinIO), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION_NAME` (default `"auto"`), and `S3_CUSTOM_DOMAIN`. When `S3_BUCKET_NAME` is empty, `STORAGES["default"]` remains `django.core.files.storage.FileSystemStorage`.
  2. Update `verify_signed_media_path` in `backend/config/media_signing.py` and `serve_media` in `backend/config/urls.py` to validate path traversal and HMAC signatures storage-agnostically and stream the file via `default_storage.open(rel_path, "rb")` (using `FileResponse` / `HttpResponse` with guessed MIME content type and existing `Cache-Control: private, max-age=3600, no-transform`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; img-src 'self'`, and `Referrer-Policy: same-origin` headers).
  3. Add a Django management command `python manage.py sync_media_to_storage --source-dir <path>` that walks an exported `/app/media` directory and uploads all files to the configured `default_storage` if not already present.
- **Rationale**: Streaming through `serve_media` via `default_storage` keeps the S3 bucket completely private (zero public bucket exposure), preserves workspace `media_key_version` instant revocation when a vault member is removed, requires zero frontend or PWA Service Worker changes, and fixes the legacy K3s production `/media` gap.
- **Alternatives Considered**:
  - *Redirecting `/media/s/...` to presigned S3 URLs*: Breaks `Content-Security-Policy: img-src 'self'` on the frontend and bypasses the PWA Workbox `/media/` same-origin cache unless CSP and CORS are widened to external S3 domains.

### 4. Managed Serverless Postgres Connection Tuning
- **Decision**: In `backend/config/settings.py` (`_build_databases()`):
  - Default `CONN_MAX_AGE` to `0` when `VERCEL` environment variable is set (unless `DB_CONN_MAX_AGE` is explicitly provided), preventing exhausted connection limits from idle serverless instances.
  - Set `CONN_HEALTH_CHECKS = True` for PostgreSQL connections so Django validates pooled connections before reuse.
  - Support `DB_DISABLE_SERVER_SIDE_CURSORS=true` (defaulting to `True` when `VERCEL=1` unless overridden) so PgBouncer transaction-mode poolers (used by Neon and Vercel Postgres `-pooler` endpoints) never fail on named server-side cursors.
  - Support an optional `SOURCE_DATABASE_URL` alias (`DATABASES["source"]`) when present in the environment so Django management commands can read directly from a port-forwarded K3s Postgres connection while writing to `DATABASES["default"]` (the new managed Postgres database).
- **Rationale**: Managed serverless Postgres providers use PgBouncer in transaction pooling mode by default, which is incompatible with Django's server-side cursors and long-lived persistent connections unless configured accordingly. Configuring an optional `source` database alias enables native ORM multi-DB streaming without custom raw SQL drivers.

### 5. Full K3s-to-Vercel Database Migration & Cryptographic Verification (`migrate_database_state`)
- **Decision**:
  1. Implement `python manage.py migrate_database_state` (`backend/apps/catalog/management/commands/migrate_database_state.py`) supporting three modes:
     - `--export-file <path.json>`: Exports all 16 application models from `default` (or `--source-db`) into a deterministic, portable JSON snapshot preserving UUIDs, timestamps, and self-referential `Container.parent_id` links.
     - `--import-file <path.json>`: Imports a portable JSON snapshot into `default` (`DATABASE_URL`) inside an `atomic()` transaction.
     - `--from-source-db` (using `SOURCE_DATABASE_URL` / `DATABASES["source"]`): Streams all 16 models directly from the K3s PostgreSQL database into `DATABASES["default"]` in a single atomic transaction without intermediate files.
  2. **Topological Model Ordering**: Process models in strict foreign-key dependency order:
     1. `accounts.User` (including password hashes, superuser/staff flags, groups/permissions)
     2. `accounts.AccountSubscription`
     3. `accounts.DedicatedServerInstance`
     4. `accounts.Workspace`
     5. `accounts.WorkspaceMembership`
     6. `accounts.WorkspaceInvitation`
     7. `accounts.ProviderCredential`
     8. `catalog.Container` (topologically ordered root-to-leaf so `parent` exists before child, or two-pass parent resolution)
     9. `catalog.CollectionItem`
     10. `catalog.ItemPhoto`
     11. `valuation.SpotPriceSnapshot`
     12. `valuation.ValuationHistory`
     13. `valuation.AppraisalJob`
     14. `vision.IdentificationJob`
     15. `vision.ImageIdentificationCache`
     16. `vision.CertLookupCache`
  3. **Fernet BYOK Key Continuity & Optional Rotation**: Support `--source-encryption-key <fernet_key>`. If provided and different from the target `FIELD_ENCRYPTION_KEY`, decrypt each `ProviderCredential.encrypted_value` using the source key and re-encrypt with the target key before saving. Always verify that every migrated `ProviderCredential` decrypts without `InvalidToken` under the target `FIELD_ENCRYPTION_KEY`; abort the transaction if any credential fails decryption.
  4. **Sequence Reset & Post-Migration Parity Verification**: Run `connection.ops.sequence_reset_sql` on the target database, then assert exact row-count parity (or expected upsert totals) and foreign-key integrity across all 16 models (`--verify-only` supported for non-destructive post-cutover audits).
  5. **Automated K3s Cutover Script (`scripts/migrate_k3s_to_vercel.sh`)**: Provide an executable bash runner that scales down K3s background writers (`stackerstash-worker`, `stackerstash-beat`), extracts `FIELD_ENCRYPTION_KEY` from `stackerstash-secrets`, port-forwards K3s Postgres (`svc/postgresql` or pod) as `SOURCE_DATABASE_URL` (plus produces a safety `pg_dump` backup archive), runs `migrate --noinput` and `migrate_database_state --from-source-db --verify` against the new Vercel `DATABASE_URL`, copies `/app/media` from the K3s pod, and runs `sync_media_to_storage --verify-db`.
- **Rationale**: Relying solely on raw `pg_dump` across different PostgreSQL versions/extensions or managed pooler roles often hits superuser/extension ownership errors, silently breaks Fernet-encrypted BYOK credentials if `FIELD_ENCRYPTION_KEY` mismatches, and provides no application-level verification of `ProviderCredential` decryption or `ItemPhoto` S3 object existence. Combining a safety `pg_dump` backup with an ORM-level topological migrator and cryptographic/storage verifier guarantees a zero-data-loss migration.
- **Alternatives Considered**:
  - *Manual `pg_dump | psql` only*: Rejected as primary mechanism because Neon/Vercel Postgres roles lack `SUPERUSER` for certain dump directives, cannot rotate or validate Fernet `FIELD_ENCRYPTION_KEY` values in flight, and cannot cross-check `ItemPhoto` records against S3 object storage.

## Risks / Trade-offs

- **[Vercel Python Cold Starts & Bundle Size]** → `rapidocr-onnxruntime` and `pillow-heif` increase the Python serverless bundle size. Mitigation: Configure `vercel.json` function settings (`maxDuration: 60`, appropriate memory) and exclude dev/test artifacts (`.venv`, `tests`, `__pycache__`, `frontend/node_modules`) via `.vercelignore`.
- **[Serverless Function Timeout on Large Batch Cron Runs]** → If hundreds of items are queued for deferred AI enrichment or stale re-appraisal, a single cron invocation could hit the function timeout. Mitigation: Keep default batch sizes small (`batch_size=5` for deferred AI enrichment, `batch_size=25` for stale re-appraisal) and allow query-param override (`?batch_size=N`) bounded by a safe maximum.
- **[In-Memory Cache (`LocMemCache`) Per-Instance Scope on Serverless]** → Django's default `LocMemCache` (used for login rate-limiting and provider response caching) is scoped per warm serverless instance. Mitigation: Keep `LocMemCache` as the zero-dependency default while supporting Django's `DatabaseCache` when `USE_DB_CACHE=true` is set in production so rate limits and provider cooldowns share state across serverless instances via Postgres.

## Migration Plan

1. **Provision Vercel & Backing Services**:
   - Create a Managed Postgres database (Neon / Vercel Postgres) and an S3-compatible bucket (Cloudflare R2 / AWS S3).
   - Configure Vercel project environment variables: `DJANGO_DEBUG=false`, `DJANGO_SECRET_KEY`, `FIELD_ENCRYPTION_KEY`, `DATABASE_URL` (pooled connection string with `sslmode=require`), `CRON_SECRET`, `S3_BUCKET_NAME`, `S3_ENDPOINT_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, `APP_BASE_URL=https://stackerstash.com`.
2. **Export & Migrate Live State from K3s Cluster (`scripts/migrate_k3s_to_vercel.sh`)**:
   - Scale down `stackerstash-worker` and `stackerstash-beat` in namespace `stackerstash` to pause background writes during cutover.
   - Extract `FIELD_ENCRYPTION_KEY` and `DATABASE_URL` from K3s Secret `stackerstash-secrets` in namespace `stackerstash`.
   - Take a full logical backup (`pg_dump --format=custom`) of K3s database `stackerstash` and copy `/app/media/workspaces` from `stackerstash-backend` (`kubectl cp`) to local backup directory `./k3s-migration-backup`.
3. **Import & Verify State in New Managed Postgres and S3 Storage**:
   - Run `python manage.py migrate --noinput` against the new managed Postgres `DATABASE_URL`.
   - Run `python manage.py migrate_database_state --from-source-db` (via port-forwarded `SOURCE_DATABASE_URL`, or `--import-file ./k3s-migration-backup/db-snapshot.json`) to transactionally migrate all 16 models, verify Fernet decryption of every `ProviderCredential` row, reset sequences, and confirm 100% row-count parity between K3s Postgres and the new database.
   - Run `python manage.py sync_media_to_storage --source-dir ./k3s-migration-backup/media --verify-db` to upload all item photos and thumbnails to S3 and verify every `ItemPhoto` row in the new database resolves in target storage.
4. **Cutover & Verification**:
   - Deploy to Vercel preview URL and verify `/healthz`, `/readyz`, login, item catalog, signed `/media/s/...` photos, and `/api/v1/cron/spot-refresh`.
   - Point `stackerstash.com` and `www.stackerstash.com` DNS to Vercel and verify TLS and cron execution.
5. **Rollback Strategy**:
   - Because K3s workloads, database `stackerstash`, and the Longhorn PVC remain intact during cutover, rolling back before post-cutover writes only requires reverting DNS back to the HomeLab K3s ingress/gateway IP.

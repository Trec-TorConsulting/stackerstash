# Tasks

## 1. Managed Serverless Postgres, Optional Database Cache, and Serverless Settings

- [ ] 1.1 Update `_build_databases()` and settings in `backend/config/settings.py` to support serverless Postgres defaults (`CONN_MAX_AGE=0` when `VERCEL` is set unless `DB_CONN_MAX_AGE` is overridden, `CONN_HEALTH_CHECKS=True`, and `DISABLE_SERVER_SIDE_CURSORS` controlled by `DB_DISABLE_SERVER_SIDE_CURSORS` or `VERCEL`), optional `SOURCE_DATABASE_URL` (`DATABASES["source"]`) for direct K3s-to-Vercel database migration, optional `USE_DB_CACHE` (`DatabaseCache`), and default `REDIS_URL=""` / `READY_CHECK_REDIS=false` when Redis is unconfigured, and verify unit tests in `backend/apps/accounts/tests.py` pass with 100% coverage of `config/settings.py`.
- [ ] 1.2 Update `.env.example` with Vercel serverless, managed Postgres pooler (`DB_DISABLE_SERVER_SIDE_CURSORS`), `CRON_SECRET`, and S3 object storage (`S3_BUCKET_NAME`, `S3_ENDPOINT_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION_NAME`) variables and verify `.env.example` passes `scripts/security_and_coverage.sh` secret scanning.

## 2. S3-Compatible Object Storage & Storage-Agnostic HMAC Media Delivery

- [ ] 2.1 Add `django-storages[s3]` and `boto3` to `backend/pyproject.toml` (and sync `backend/uv.lock` + root `requirements.txt` for Vercel Python runtime) and configure `STORAGES["default"]` in `backend/config/settings.py` to switch to `storages.backends.s3.S3Storage` when `S3_BUCKET_NAME` is configured while falling back to `FileSystemStorage` otherwise, verifying `uv sync` and `pip-audit` succeed.
- [ ] 2.2 Refactor `verify_signed_media_path` in `backend/config/media_signing.py` and `serve_media` in `backend/config/urls.py` to serve HMAC-signed `/media/s/<exp>/<sig>/<rel_path>` requests via `default_storage` (preserving path-traversal guards, workspace `media_key_version` checks, and private security headers across both `FileSystemStorage` and `S3Storage`), and verify unit tests cover both storage modes at 100% coverage.
- [ ] 2.3 Implement the `migrate_database_state` Django management command (`backend/apps/catalog/management/commands/migrate_database_state.py`) to export, import, and directly stream (`--from-source-db`, `--export-file`, `--import-file`, `--verify-only`, `--source-encryption-key`) all 16 application models in topological FK order (`User`, `AccountSubscription`, `DedicatedServerInstance`, `Workspace`, `WorkspaceMembership`, `WorkspaceInvitation`, `ProviderCredential`, self-referential `Container`, `CollectionItem`, `ItemPhoto`, `SpotPriceSnapshot`, `ValuationHistory`, `AppraisalJob`, `IdentificationJob`, `ImageIdentificationCache`, `CertLookupCache`) with UUID/timestamp preservation, Fernet `ProviderCredential` decryption verification and key rotation, sequence resets, and source-to-target row-count parity checks, and verify unit tests pass with 100% coverage.
- [ ] 2.4 Implement the `sync_media_to_storage` Django management command (`backend/apps/catalog/management/commands/sync_media_to_storage.py`) to upload existing local/PVC media files (`workspaces/<ws_id>/items/<item_id>/*`) to `default_storage` idempotently and support `--verify-db` to confirm every `ItemPhoto` record's `image` and `thumbnail` exist in target storage, and verify management command unit tests pass with 100% coverage.
- [ ] 2.5 Create the executable K3s-to-Vercel migration script `scripts/migrate_k3s_to_vercel.sh` that coordinates pausing K3s background writers, extracting `FIELD_ENCRYPTION_KEY`, exporting K3s Postgres (`pg_dump` backup + `migrate_database_state`), copying `/app/media` from the K3s pod, and syncing/verifying all database records and S3 media objects, and verify `bash -n scripts/migrate_k3s_to_vercel.sh` succeeds.

## 3. Vercel Cron Endpoints & Inline Serverless Auto-Sort

- [ ] 3.1 Create authenticated cron endpoints (`/api/v1/cron/spot-refresh`, `/api/v1/cron/ai-enrichment`, and `/api/v1/cron/reappraise-stale`) using constant-time `Authorization: Bearer <CRON_SECRET>` validation and register the router on `config.api.api`, verifying unit tests cover valid token execution, missing `CRON_SECRET` (`503`), and invalid/missing bearer headers (`401`) at 100% coverage.
- [ ] 3.2 Update `_dispatch_background` in `backend/apps/catalog/auto_sort.py` so item and workspace auto-sort execute synchronously inline when running on Vercel (`VERCEL=1`), when `AUTO_SORT_INLINE=true`, when `CELERY_TASK_ALWAYS_EAGER=true`, or when no Celery broker URL is configured, and verify unit tests in `backend/apps/catalog/test_auto_sort.py` pass with 100% coverage.

## 4. Unified Vercel Configuration, WSGI Entrypoint, and Migration Documentation

- [ ] 4.1 Create the Vercel Python WSGI serverless entrypoint (`api/index.py`), `.vercelignore`, and root `vercel.json` defining the frontend static build (`frontend/dist`), backend routes (`/api/*`, `/super-admin/*`, `/media/*`, `/static/*`, `/healthz`, `/readyz`), prerendered HTML rewrites, security headers, cache-control isolation (`/assets/*` immutable vs. HTML/crawler files `no-cache`), and `crons` schedules (`/api/v1/cron/spot-refresh`, `/api/v1/cron/ai-enrichment`, `/api/v1/cron/reappraise-stale`), and verify JSON validity and WSGI entrypoint import tests pass.
- [ ] 4.2 Author `docs/VERCEL_MIGRATION.md` and update `README.md` and `openspec/config.yaml` to document Vercel as the primary production deployment target, step-by-step full K3s database and media cutover instructions (`scripts/migrate_k3s_to_vercel.sh`, `migrate_database_state`, `pg_dump` backup, `FIELD_ENCRYPTION_KEY` continuity/rotation, and `sync_media_to_storage --verify-db`), and the retained legacy/self-hosted K3s workflow, verifying all markdown links and documented commands match the implementation.

## 5. End-to-End Quality, Security, and Coverage Verification

- [ ] 5.1 Run `bash scripts/security_and_coverage.sh` and `openspec validate --all --strict` from the repository root and verify that secret scanning, Ruff, Bandit, `pip-audit`, `manage.py check --deploy`, backend pytest 100% coverage, frontend `npm audit`, TypeScript typecheck, Vitest 100% coverage, production frontend build, and OpenSpec strict validation all pass with zero errors.

## Workflow follow-up

- Open a feature branch PR (`branch -> commit -> push -> PR -> merge`) once implementation is approved.
- Archive the `migrate-k3s-to-vercel` change and sync delta specs after deployment verification.

# Spec Delta

## MODIFIED Requirements

### Requirement: Live Helm release
The HomeLab K3S Helm release `stackerstash` in namespace `stackerstash` (chart `~/Projects/Personal/HomeLab-Redo/stackerstash`) SHALL be maintained as a legacy/self-hosted deployment target after primary production for `stackerstash.com` transitions to Vercel. Operators using the self-hosted K3S target MUST NOT `helm upgrade` that release from this repo's `deploy/chart/`.

#### Scenario: Deploy from this repository
- **WHEN** an operator rolls a new image to the self-hosted K3S cluster
- **THEN** they build from this repo and run `helm upgrade --install stackerstash ~/Projects/Personal/HomeLab-Redo/stackerstash -n stackerstash`

#### Scenario: Product chart is not the live chart
- **WHEN** someone inspects `deploy/chart/values.yaml`
- **THEN** it still targets `traefik/traefik-gateway`, `registry.homelab.local`, and `redis.redis.svc`, and it is not applied

## ADDED Requirements

### Requirement: K3s production state export for Vercel cutover
The self-hosted K3S environment SHALL support exporting database `stackerstash` (via port-forward `SOURCE_DATABASE_URL` or logical snapshot) and the `/app/media` Longhorn PVC contents, along with extracting `FIELD_ENCRYPTION_KEY` from `stackerstash-secrets`, so all vaults, users, credentials, items, valuation history, caches, and photos migrate to managed Postgres and S3 storage without data loss.

#### Scenario: Operator exports Postgres and media from K3s namespace
- **WHEN** an operator executes the K3s migration script or export procedure against namespace `stackerstash`
- **THEN** a complete snapshot/stream of database `stackerstash`, the `FIELD_ENCRYPTION_KEY` from `stackerstash-secrets`, and a directory archive of `/app/media/workspaces` are extracted and verified for import into the Vercel managed Postgres and S3 backing services

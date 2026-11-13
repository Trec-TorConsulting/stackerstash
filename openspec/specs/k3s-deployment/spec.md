# k3s-deployment

## Purpose

Production for `stackerstash.com` is already installed on the HomeLab K3S cluster. Local work stays in this repo. A cluster rollout uses the homelab chart, not `deploy/chart/`.

## Requirements

### Requirement: Local development stays off the cluster database
Local development SHALL use Docker Compose or the backend virtualenv plus the Vite dev server. Local Django SHALL use SQLite when `DATABASE_URL` is unset. Local work MUST NOT point `DATABASE_URL` at `postgresql.postgresql.svc.cluster.local`.

#### Scenario: Developer runs the app on the Mac
- **WHEN** a developer starts the backend with `manage.py runserver` and no `DATABASE_URL`
- **THEN** Django uses the local SQLite file and does not connect to the cluster Postgres role `stackerstash`

### Requirement: Live Helm release
The applied release SHALL be Helm release `stackerstash` in namespace `stackerstash`, chart `~/Projects/Personal/HomeLab-Redo/stackerstash`. Operators MUST NOT `helm upgrade` that release from this repo's `deploy/chart/`.

#### Scenario: Deploy from this repository
- **WHEN** an operator rolls a new image to production
- **THEN** they build from this repo and run `helm upgrade --install stackerstash ~/Projects/Personal/HomeLab-Redo/stackerstash -n stackerstash`

#### Scenario: Product chart is not the live chart
- **WHEN** someone inspects `deploy/chart/values.yaml`
- **THEN** it still targets `traefik/traefik-gateway`, `registry.homelab.local`, and `redis.redis.svc`, and it is not applied

### Requirement: Images and registry
Backend and frontend images SHALL be published to `registry.maddscientist.com` for both `linux/amd64` and `linux/arm64`. The running tags are `stackerstash-backend:0.1.0` and `stackerstash-frontend:0.1.0`. The backend image MUST install the `packaging` package.

#### Scenario: Image push from the product checkout
- **WHEN** a developer builds both Dockerfiles for `linux/amd64,linux/arm64`
- **THEN** both tags on `registry.maddscientist.com` include amd64 and arm64 manifests

#### Scenario: Buildx cannot reach the registry VIP
- **WHEN** `docker buildx --push` cannot connect to `192.168.4.7:443`
- **THEN** the operator exports an OCI archive and pushes it with `skopeo` from the Mac

### Requirement: Gateway, hosts, and TLS
Public HTTPS SHALL use an `HTTPRoute` parented to `kube-system/cluster-gateway` listener `https` for `stackerstash.com` and `www.stackerstash.com`. The chart MUST NOT create an Ingress. Certificate `stackerstash-tls` SHALL use ClusterIssuer `letsencrypt-prod`.

#### Scenario: HTTPS request for the apex host
- **WHEN** a client requests `https://stackerstash.com/`
- **THEN** the Gateway presents `stackerstash-tls` and routes `/` to the frontend and `/api` to the backend

#### Scenario: Gateway can read the TLS Secret
- **WHEN** the Certificate Secret exists in namespace `stackerstash`
- **THEN** `traefik/gateway.yaml` lists it in `certificateRefs` and a `ReferenceGrant` allows the `kube-system` Gateway to read it

### Requirement: Postgres and Redis
Application data SHALL live in database `stackerstash`, role `stackerstash`, on the existing cluster Postgres at `postgresql.postgresql.svc.cluster.local:5432`. The deploy MUST NOT use database `trec_tor_view`. Celery SHALL use Redis Service `redis` in namespace `stackerstash` (`redis://redis:6379/0`). The deploy MUST NOT use `redis.redis.svc`.

#### Scenario: Backend readiness checks its own database
- **WHEN** the readiness probe calls `/readyz` and Postgres or Redis is unreachable
- **THEN** the endpoint returns HTTP 503

### Requirement: Runtime secret and probes
Namespace `stackerstash` SHALL have Secret `stackerstash-secrets` holding the Django secret, Fernet key, `DATABASE_URL`, allowed hosts, CSRF and CORS origins, `REDIS_URL`, and `DJANGO_DEBUG=false`. Those values MUST NOT be committed. Probes SHALL send `Host: stackerstash.com`. Pods SHALL exclude nodes `node05` and `node06`.

#### Scenario: Rollout without printing credentials
- **WHEN** an operator upgrades the release
- **THEN** the existing Secret is reused and the Secret values are not written into git or Helm values

### Requirement: Workloads and storage
The release SHALL run backend (gunicorn with 2 workers), Celery worker, Celery beat, frontend, and Redis. Backend startup SHALL run `migrate` and `collectstatic`. Backend and worker SHALL mount the Longhorn `ReadWriteMany` media PVC at `/app/media` (20Gi). Redis SHALL use its own 1Gi Longhorn PVC.

#### Scenario: Spot refresh process is running
- **WHEN** the release is healthy
- **THEN** `stackerstash-beat` is Ready and the five workloads (backend, worker, beat, frontend, Redis) are Running

### Requirement: Production media is not publicly served yet
With `DJANGO_DEBUG=false`, Django SHALL NOT mount `/media`. Uploaded files stay on the media PVC, and public `/media` returns 404 until the application adds a production media route. Operators MUST NOT set `DJANGO_DEBUG=true` on the cluster to expose media.

#### Scenario: Debug stays off in production
- **WHEN** the cluster Secret sets `DJANGO_DEBUG=false`
- **THEN** the site stays in production mode and `/media` is not served by the Django debug static helper

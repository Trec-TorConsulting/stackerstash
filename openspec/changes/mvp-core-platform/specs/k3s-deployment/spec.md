# Spec Delta: K3s Production Deployment

## Purpose

Packages the application as production-ready containers and a Helm chart compatible with the HomeLab K3s cluster, Traefik Gateway API, cert-manager TLS, PostgreSQL, Redis, and persistent Longhorn media storage.

## ADDED Requirements

### Requirement: Production container images and health probes
The system SHALL provide multi-stage Dockerfiles for the backend API/worker and frontend PWA with non-root execution and HTTP `/healthz` (liveness) and `/readyz` (readiness verifying PostgreSQL and Redis) endpoints.

#### Scenario: Readiness probe fails when database is unreachable
- **WHEN** the Kubernetes readiness probe calls `/readyz` while PostgreSQL is unreachable
- **THEN** the endpoint returns HTTP 503 so traffic is not routed to the pod

### Requirement: Helm chart and Gateway API routing
The system SHALL provide a Helm chart configuring the web deployment, Celery worker, Celery beat (for periodic spot price refresh), persistent media PVC (Longhorn), and Gateway API `HTTPRoute` + `Certificate` templates.

#### Scenario: Render Helm manifests with custom domain
- **WHEN** an operator runs `helm template` with a target hostname (e.g., `stackerstash.com`) and PostgreSQL/Redis connection values
- **THEN** Helm renders valid Kubernetes manifests including Deployments, Services, PVC, and HTTPRoute without template errors


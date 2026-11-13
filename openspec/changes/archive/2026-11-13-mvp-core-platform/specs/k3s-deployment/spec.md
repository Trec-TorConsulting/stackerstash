# Spec Delta: K3s Production Deployment

## Purpose

The live deploy contract is `openspec/specs/k3s-deployment/spec.md`. This delta keeps that requirement in sync. Do not install `deploy/chart/` over the live release.

## MODIFIED Requirements

### Requirement: Live Helm release
The applied release SHALL be Helm release `stackerstash` in namespace `stackerstash`, chart `~/Projects/Personal/HomeLab-Redo/stackerstash`. Operators MUST NOT `helm upgrade` that release from this repo's `deploy/chart/`.

#### Scenario: Deploy from this repository
- **WHEN** an operator rolls a new image to production
- **THEN** they build from this repo and run `helm upgrade --install stackerstash ~/Projects/Personal/HomeLab-Redo/stackerstash -n stackerstash`

#### Scenario: Product chart is not the live chart
- **WHEN** someone inspects `deploy/chart/values.yaml`
- **THEN** it still targets `traefik/traefik-gateway`, `registry.homelab.local`, and `redis.redis.svc`, and it is not applied

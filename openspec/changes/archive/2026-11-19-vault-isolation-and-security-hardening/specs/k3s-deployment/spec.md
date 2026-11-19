# k3s-deployment Specification Delta

## MODIFIED Requirements

### Requirement: Gateway, hosts, and TLS
Public HTTPS SHALL use an `HTTPRoute` parented to `kube-system/cluster-gateway` listener `https` for `stackerstash.com` and `www.stackerstash.com` that routes `/api`, `/super-admin`, `/static`, `/media`, `/healthz`, and `/readyz` to `stackerstash-backend` and routes `/` (including the `/admin` React SPA route) to `stackerstash-frontend`. The chart MUST NOT create an Ingress. Certificate `stackerstash-tls` SHALL use ClusterIssuer `letsencrypt-prod`.

#### Scenario: HTTPS request for the apex host
- **WHEN** a client requests `https://stackerstash.com/`
- **THEN** the Gateway presents `stackerstash-tls` and routes `/` to the frontend and `/api` to the backend

#### Scenario: Gateway routes SPA admin portal to frontend and Django super-admin to backend
- **WHEN** a client requests `https://stackerstash.com/admin` or `https://stackerstash.com/super-admin/`
- **THEN** `/admin` is served by `stackerstash-frontend` (the React Global Admin Portal SPA) and `/super-admin/` is routed to `stackerstash-backend` (Django Admin)

#### Scenario: Gateway can read the TLS Secret
- **WHEN** the Certificate Secret exists in namespace `stackerstash`
- **THEN** `traefik/gateway.yaml` lists it in `certificateRefs` and a `ReferenceGrant` allows the `kube-system` Gateway to read it

# Spec Delta

## MODIFIED Requirements

### Requirement: Nginx security headers, compression, and cache isolation
Both the Vercel Edge configuration (`vercel.json`) and the container Nginx edge server SHALL disable version exposure, serve clean prerendered HTML paths without trailing-slash redirects, apply security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy`) across all static and cached responses, and apply immutable caching to `/assets/` vs. revalidation headers to HTML and crawler files.

#### Scenario: Edge server serves static crawler file vs. hashed asset
- **WHEN** Vercel Edge or Nginx serves `/sitemap.xml` or `/index.html` versus `/assets/index-*.js`
- **THEN** `/sitemap.xml` and `/index.html` carry `no-cache` revalidation headers and security headers, while `/assets/*` carries long-lived immutable cache headers alongside the same security headers

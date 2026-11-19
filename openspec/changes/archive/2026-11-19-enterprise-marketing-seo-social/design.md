# Design

## Context

`Stacker Stash` runs as a Django 5 + Django Ninja backend behind a React 19 + Vite + Tailwind CSS v4 + `vite-plugin-pwa` frontend served by Nginx (`frontend/nginx.conf`) in Docker Compose and K3s (`stackerstash.com`). Currently:
- `frontend/src/App.tsx` defaults `VITE_SITE_MODE` to `"coming_soon"`, sending unauthenticated root `/` traffic to `ComingSoonPage.tsx` instead of `MarketingPage.tsx`.
- `MarketingPage.tsx` only lists 7 asset pills, 6 feature cards, and 2 legacy pricing cards (`Collector Vault (Free)` and `Self-Hosted / Family Cluster`), omitting Goldbacks, trading cards, local-first OCR/barcode identification, auto-sort, raw item grading & ROI, multi-source valuation freshness/locks, multi-vault & RBAC sharing, offline coin-show PWA mode, and the 4-tier SaaS matrix from `tiered-access`.
- `frontend/index.html` contains no meta description, canonical URL, Open Graph tags, Twitter Cards, or JSON-LD; `frontend/public/` lacks `robots.txt`, `sitemap.xml`, and a raster `1200x630` `og-image.png`; and `frontend/nginx.conf` lacks compression, security headers, and differentiated cache policies.

See `proposal.md` for scope and `specs/` for behavioral requirements.

## Goals / Non-Goals

**Goals:**
- Deliver full semantic HTML, route-specific SEO/OG/Twitter metadata, and JSON-LD to both zero-JS search/social crawlers and interactive browser sessions without adding runtime SSR infrastructure.
- Maintain a single structured source of truth for all shipped Stacker Stash offerings, supported assets, 4-tier SaaS + self-hosted pricing, FAQs, and route metadata.
- Harden Nginx static delivery with security headers, gzip compression, clean-URL prerender resolution, and cache-control isolation without breaking API/media/admin proxying or PWA offline behavior.
- Achieve full automated test coverage (Vitest + static/build verification) compatible with the `100%` frontend coverage gates in `full-coverage-and-security-testing`.

**Non-Goals:**
- Migrating the frontend away from Vite/React SPA to Next.js or adding backend database-backed newsletter/waitlist persistence.
- Adding backend Stripe checkout logic (`tiered-access` owns backend Stripe endpoints and Settings Billing UI; this change aligns public marketing tier presentation with `tiered-access`).
- Changing K3s `HTTPRoute` manifests or backend `/api/` routes (`openspec/specs/k3s-deployment/spec.md` remains intact).

## Decisions

### 1. Build-Time Static HTML Prerendering via Vite SSR Pass + `createRoot`
- **Decision**: Add a lightweight post-build script (`frontend/scripts/prerender.mjs`) invoked by `npm run build` (`tsc -b && vite build && vite build --ssr src/prerender.tsx --outDir .prerender-tmp && node scripts/prerender.mjs`). It renders public routes (`/`, `/marketing`, `/features`, `/pricing`, `/security`, `/privacy`, `/terms`, `/coming-soon`) via `react-dom/server` `renderToString` using `StaticRouter`, injects the rendered markup into `<div id="root">`, replaces route-specific `<title>`, meta description, canonical URL, Open Graph, Twitter Card, and JSON-LD tags inside `<head>`, writes clean directory indexes (`dist/index.html`, `dist/features/index.html`, etc.), and removes `.prerender-tmp`.
- **Rationale**: Social unfurlers (Slack, Discord, X/Twitter, Facebook, LinkedIn, iMessage) and non-JS crawlers never execute JavaScript, so client-only meta updates are invisible to them. Static build-time prerendering gives every public route full crawlable HTML and accurate social cards at zero runtime cost inside the existing `nginx:1.27-alpine` container (`frontend/Dockerfile`).
- **Client Mount Choice (`createRoot` vs `hydrateRoot`)**: Keep `createRoot` in `frontend/src/main.tsx`. If a returning authenticated user loads `/` with a stored JWT in `localStorage`, `AppRoutes` enters `"Unlocking vault..."` / `DashboardPage`, which intentionally differs from the unauthenticated prerendered marketing HTML. `createRoot` seamlessly swaps the DOM without triggering React 19 hydration mismatch errors.
- **Alternative Considered**: Adding Django template rendering for marketing routes or running a Node SSR server. Rejected because it fragments frontend assets/routing and changes K3s pod topology.

### 2. Zero-Dependency React 19 SEO Metadata Engine (`src/lib/seo.ts` + `src/components/SeoHead.tsx`)
- **Decision**: Implement a pure TypeScript route metadata registry and `<SeoHead />` helper (`src/lib/seo.ts`, `src/components/SeoHead.tsx`) that both supplies `<head>` strings to `prerender.mjs` and updates `document.title`, `<meta>`, `<link rel="canonical">`, and JSON-LD `<script data-seo-ld="true">` in `useEffect` during client-side navigation—including setting `noindex, nofollow` on `/login`, `/register`, `/invite/*`, and authenticated routes (`/collection`, `/scan`, `/containers`, `/items/*`, `/settings`, `/admin`).
- **Rationale**: `react-helmet-async` lacks clean React 19 (`^19.0.0`) peer compatibility. A dedicated typed module eliminates external dependency conflicts, guarantees build-time and runtime parity, and is straightforward to unit-test to `100%` coverage.

### 3. Single Source of Truth for Offerings, Assets, Tiers & Trust Content (`src/data/marketingCatalog.ts`)
- **Decision**: Centralize all public catalog data in `frontend/src/data/marketingCatalog.ts`:
  - **Canonical Brand**: Standardize public copy, `<title>`, OG, Twitter, JSON-LD, and legal pages on **`Stacker Stash`**, linking verified GitHub (`https://github.com/Trec-TorConsulting/stackerstash`) and omitting unverified social handles.
  - **Root Mode Default**: Update `VITE_SITE_MODE` fallback in `frontend/src/App.tsx` from `"coming_soon"` to `"marketing"`. Keep `/coming-soon` routable and allow `VITE_SITE_MODE=coming_soon` build overrides.
  - **Asset & Feature Parity**: Model all asset categories (US/World/Ancient Coins, Paper Banknotes, Goldbacks `1/4`–`100`, Gold/Silver/Platinum/Palladium/Copper Bars & Rounds, Trading & Collectible Cards, and all 11 numismatic + card slab services) and organized capability pillars (Capture & Forensics, Local-First AI/OCR, Appraisal & Grading ROI, Containers & Migration, Multi-Vault & RBAC Collaboration, Offline PWA & Security).
  - **Pricing Alignment**: Display all 4 SaaS tiers (`Collector Vault (Free)` `$0/mo`, `Plus` `$9.99/mo`, `Unlimited` `$19.99/mo`, `Dedicated Server` `$99.99/mo`) plus the `Self-Hosted / Open Source` deployment option, preserving the `"Collector Vault (Free)"` label expected by existing tests and `tiered-access`.
  - **Public Sub-Pages**: Share `PublicHeader` (with skip link, mobile menu drawer, and Web Share / copy-link control) and `SiteFooter` across `/`, `/marketing`, `/features`, `/pricing`, `/security`, `/privacy`, `/terms`, and `/coming-soon`.

### 4. Deterministic Raster Social Image (`1200x630` PNG) & Crawler Files
- **Decision**: Commit a crisp, high-contrast `1200x630` PNG social card at `frontend/public/og-image.png` (generated from a reproducible script/SVG template during authoring and verified in automated tests for PNG magic bytes and `1200x630` dimensions) alongside `frontend/public/robots.txt` and `frontend/public/sitemap.xml`.
- **Rationale**: Most social crawlers reject SVG `og:image` assets. Generating `og-image.png` as a checked-in static asset avoids adding headless browser or native graphics dependencies to the Alpine Docker builder (`frontend/Dockerfile`).

### 5. Production Nginx Edge Hardening & Workbox PWA Isolation
- **Decision**:
  - Update `frontend/nginx.conf`:
    - Add `server_tokens off;` and gzip compression for HTML, CSS, JS, JSON, SVG, XML, and text.
    - Use `try_files $uri $uri/index.html /index.html;` so prerendered clean routes (`/features` -> `/features/index.html`) resolve with HTTP 200 without 301 trailing-slash redirects, while authenticated/SPA routes fall back to `/index.html`.
    - Extract security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), microphone=(), geolocation=()`, `Content-Security-Policy`) into a shared Nginx include file (`/etc/nginx/snippets/security-headers.conf`, copied in `frontend/Dockerfile`) and include it inside every static `location` block that sets `Cache-Control` (avoiding Nginx's `add_header` inheritance drop when a child block defines its own `add_header`).
    - Set `Cache-Control: public, max-age=31536000, immutable` on `/assets/` and `Cache-Control: no-cache, must-revalidate` on HTML pages, `/sw.js`, `/manifest.webmanifest`, `/robots.txt`, and `/sitemap.xml`.
    - Preserve exact proxy blocks for `/api/`, `/super-admin/`, `/static/`, and `/media/`.
  - Update `frontend/vite.config.ts`: Add `workbox.navigateFallbackDenylist: [/^\/api\//, /^\/super-admin\//, /^\/media\//, /^\/robots\.txt$/, /^\/sitemap\.xml$/]` so the PWA Service Worker never intercepts crawler XML/TXT files or backend paths.

## Risks / Trade-offs

- **[Risk] Nginx `add_header` Inheritance Drop**: Defining `Cache-Control` via `add_header` inside a `location` block silently suppresses server-level security `add_header` directives. → **Mitigation**: Place security headers in an included `/etc/nginx/snippets/security-headers.conf` included by both `server` and caching `location` blocks, and verify presence in tests.
- **[Risk] CSP Blocking Camera, Blob Previews, or PWA Workers**: Overly strict `Content-Security-Policy` can break `react-easy-crop` blob previews, inline SVGs, Workbox service workers, or Tailwind styles. → **Mitigation**: Allow `img-src 'self' data: blob:`, `worker-src 'self'`, `style-src 'self' 'unsafe-inline'`, `script-src 'self'`, `connect-src 'self'`, and verify full `npm run build` + `vite preview` / interactive tests.
- **[Risk] Prerender Script Failing in Minimal Node Environments**: Build-time prerender runs inside `node:22-alpine` during `docker build`. → **Mitigation**: Keep `prerender.mjs` strictly pure Node ESM + Vite SSR output with zero browser/DOM/Puppeteer dependencies and clean up `.prerender-tmp` after generating HTML files.
- **[Risk] Overlap with In-Progress `tiered-access` / `shared-vaults` / `full-coverage-and-security-testing` Changes**: Multiple active OpenSpec changes touch `App.tsx`, `MarketingPage.tsx`, and `vite.config.ts`. → **Mitigation**: Preserve `"Collector Vault (Free)"` test compatibility, isolate marketing/SEO additions cleanly in `marketingCatalog.ts`/`seo.ts`/`PublicHeader.tsx`, and maintain 100% Vitest coverage across all new/modified frontend files.

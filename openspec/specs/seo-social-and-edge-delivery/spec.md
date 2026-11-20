# seo-social-and-edge-delivery Specification

## Purpose
Defines technical SEO metadata, build-time static HTML prerendering, crawler discovery files, Open Graph and Twitter/X social card previews, share controls, and production Nginx security, caching, and PWA fallback isolation for `stackerstash.com`.

## Requirements

### Requirement: Base HTML and per-route SEO metadata management
The frontend SHALL define complete baseline metadata in `index.html` and dynamically update `document.title`, `<meta name="description">`, `<meta name="robots">`, and `<link rel="canonical">` across every route using `https://stackerstash.com` canonical URLs, including `/specifications`.

#### Scenario: Navigating between public landing routes updates head metadata
- **WHEN** a user or client-side router navigates from `/` to `/pricing` or `/security`
- **THEN** the document `<title>`, `<meta name="description">`, and `<link rel="canonical">` update immediately to match the active route's `https://stackerstash.com` URL

#### Scenario: Collector views specifications page metadata
- **WHEN** a visitor navigates to `/specifications`
- **THEN** the document head updates with title "Technical Specifications — Stacker Stash", canonical URL `https://stackerstash.com/specifications`, and structured data schemas

### Requirement: Private and authenticated routes emit noindex directive
Authentication, invitation, and authenticated vault application routes (`/login`, `/register`, `/invite/*`, `/collection`, `/scan`, `/containers`, `/items/*`, `/settings`, `/admin`) SHALL set `<meta name="robots" content="noindex, nofollow">` so search engines do not index private app workflows.

#### Scenario: Visitor opens sign-in or invite route
- **WHEN** the router renders `/login`, `/register`, or `/invite/:token`
- **THEN** the document head includes `<meta name="robots" content="noindex, nofollow">`

### Requirement: Structured data JSON-LD schemas on public pages
Public marketing routes SHALL embed valid `<script type="application/ld+json">` structured data covering `SoftwareApplication` (with feature highlights and pricing offers), `Organization` (`Stacker Stash`), `WebSite`, and `FAQPage` (on pages presenting FAQs).

#### Scenario: Crawler inspects JSON-LD structured data on home page
- **WHEN** the `/` page HTML or rendered DOM is inspected
- **THEN** valid JSON-LD graphs parse cleanly without syntax errors and declare `Stacker Stash`, `https://stackerstash.com/`, and the tier `Offer` pricing catalog

### Requirement: Build-time static HTML prerendering for public routes
The production frontend build SHALL generate static prerendered HTML files with full semantic markup and route-specific SEO, Open Graph, Twitter Card, and JSON-LD `<head>` tags for `/`, `/marketing`, `/features`, `/pricing`, `/security`, `/privacy`, `/terms`, `/coming-soon`, and `/specifications`.

#### Scenario: Zero-JS crawler requests public sub-route HTML
- **WHEN** an automated crawler or social unfurler fetches static HTML for `/`, `/features`, `/pricing`, `/security`, `/privacy`, or `/terms` from the built `dist/` output
- **THEN** the served HTML already contains that route's `<h1>`, descriptive body text, canonical URL, `<meta name="description">`, `og:*` tags, `twitter:*` tags, and JSON-LD before any JavaScript executes

#### Scenario: Build system executes prerender script for specifications
- **WHEN** the production build prerender script executes
- **THEN** it outputs a prerendered `dist/specifications/index.html` file containing complete semantic HTML and meta tags

### Requirement: Robots directives and XML sitemap generation
The frontend build SHALL serve `/robots.txt` allowing indexing of public marketing routes while disallowing private and backend paths (`/api/`, `/super-admin/`, `/media/`, `/invite/`, `/settings`, `/admin`, `/collection`, `/scan`, `/containers`, `/items/`), and serve `/sitemap.xml` listing all canonical public URLs including `/specifications`.

#### Scenario: Search crawler fetches robots.txt and sitemap.xml
- **WHEN** a crawler requests `https://stackerstash.com/robots.txt` or `https://stackerstash.com/sitemap.xml`
- **THEN** `/robots.txt` references `Sitemap: https://stackerstash.com/sitemap.xml` and `/sitemap.xml` contains valid XML `<urlset>` entries for `/`, `/features`, `/pricing`, `/security`, `/privacy`, and `/terms`

#### Scenario: Search engine crawler discovers specifications in sitemap
- **WHEN** a crawler requests `/sitemap.xml`
- **THEN** the sitemap contains a valid `<loc>https://stackerstash.com/specifications</loc>` entry

### Requirement: Open Graph, Twitter Cards, and 1200x630 social image
The frontend SHALL serve a `1200x630` PNG social share image at `/og-image.png` and include complete Open Graph (`og:type`, `og:site_name`, `og:title`, `og:description`, `og:url`, `og:image`, `og:image:width`, `og:image:height`, `og:image:alt`, `og:locale`) and Twitter/X (`twitter:card` = `summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image`, `twitter:image:alt`) metadata.

#### Scenario: Link shared on Slack, Discord, X, or LinkedIn
- **WHEN** a social crawler parses the HTML of `https://stackerstash.com/` or `https://stackerstash.com/pricing`
- **THEN** it finds `og:image` pointing to `https://stackerstash.com/og-image.png` (`1200`x`630`), `twitter:card` set to `summary_large_image`, and route-accurate title and description tags

### Requirement: User-initiated social sharing and link copy action
Public marketing pages SHALL provide an accessible share button that invokes the Web Share API when supported and falls back to copying the canonical share URL with clear user feedback.

#### Scenario: Visitor shares Stacker Stash on desktop browser without Web Share API
- **WHEN** a visitor activates the Share button on the marketing page without `navigator.share`
- **THEN** the canonical URL is copied via clipboard fallback and the UI confirms the copy action accessibly

### Requirement: Nginx security headers, compression, and cache isolation
The Nginx edge server SHALL disable version exposure, enable gzip compression, serve clean prerendered HTML paths without trailing-slash redirects, apply security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy`) across all static and cached responses, and apply immutable caching to `/assets/` vs. revalidation headers to HTML and crawler files.

#### Scenario: Edge server serves static crawler file vs. hashed asset
- **WHEN** Nginx serves `/sitemap.xml` or `/index.html` versus `/assets/index-*.js`
- **THEN** `/sitemap.xml` and `/index.html` carry `no-cache` revalidation headers and security headers, while `/assets/*` carries long-lived immutable cache headers alongside the same security headers

### Requirement: PWA service-worker exclusion for crawlers and backend routes
The PWA service-worker configuration SHALL exclude `/robots.txt`, `/sitemap.xml`, `/api/`, `/super-admin/`, and `/media/` from navigation fallback interception.

#### Scenario: Crawler or backend path bypasses PWA HTML fallback
- **WHEN** a client or crawler requests `/robots.txt`, `/sitemap.xml`, or `/api/`
- **THEN** the service worker navigation fallback does not intercept the request or substitute `/index.html`

# Spec Delta: seo-social-and-edge-delivery

## MODIFIED Requirements

### Requirement: Base HTML and per-route SEO metadata management
The frontend SHALL define complete baseline metadata in `index.html` and dynamically update `document.title`, `<meta name="description">`, `<meta name="robots">`, and `<link rel="canonical">` across every route using `https://stackerstash.com` canonical URLs, including `/specifications`.

#### Scenario: Navigating between public landing routes updates head metadata
- **WHEN** a user or client-side router navigates from `/` to `/pricing` or `/security`
- **THEN** the document `<title>`, `<meta name="description">`, and `<link rel="canonical">` update immediately to match the active route's `https://stackerstash.com` URL

#### Scenario: Collector views specifications page metadata
- **WHEN** a visitor navigates to `/specifications`
- **THEN** the document head updates with title "Technical Specifications — Stacker Stash", canonical URL `https://stackerstash.com/specifications`, and structured data schemas

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

# Tasks: Stackers & Collectors Core Platform (MVP)

## 1. Backend Foundation & Multi-Tenant Identity
- [x] 1.1 Scaffold Django 5 project in `backend/` with `django-ninja`, `psycopg`, `celery`, `redis`, `cryptography`, `Pillow`, `pytest-django`, and `pyproject.toml`.
- [x] 1.2 Implement `accounts` app: custom `User` model, `Workspace`, `WorkspaceMembership`, auto-provisioned default workspace on signup, JWT/session auth endpoints (`/api/v1/auth/register`, `/login`, `/logout`, `/me`).
- [x] 1.3 Implement `ProviderCredential` model with Fernet encryption at rest and masked-hint API endpoints (`/api/v1/settings/credentials`).
- [x] 1.4 Register `accounts` models in Django Admin with staff-only access and add `/healthz` + `/readyz` probe endpoints.
- [x] 1.5 Write `pytest-django` tests for auth, workspace tenant isolation, and encrypted credential round-trip/masking.

## 2. Catalog, Containers & Multi-Photo Inventory
- [x] 2.1 Implement `catalog` app: `Container` (self-referential hierarchy), `CollectionItem` (polymorphic categories, metal/weight/purity normalization to `fine_troy_oz`, grading/cert/serial, `estimated_grade`, `ai_confidence`, `status`, `tags`, cost basis, sold tracking, cached valuations, JSONB `attributes`), and `ItemPhoto`.
- [x] 2.2 Implement REST/Ninja endpoints for Containers (tree + rolled-up totals), CollectionItems (CRUD, multi-facet filtering, sorting by value/melt/P&L/date, full-text search, quick-add presets), and ItemPhotos (upload, reorder, set primary, delete, workspace-scoped serving).
- [x] 2.3 Implement CSV/JSON collection export, bulk CSV import with validation preview, printable Insurance/Estate report endpoint, and register `catalog` models in Django Admin.
- [x] 2.4 Write `pytest-django` tests for weight/purity normalization (troy oz, avdp oz, kg), container rollups, sorting/filtering, and photo upload/isolation.

## 3. Valuation Engine & Live Spot Pricing
- [x] 3.1 Implement `valuation` app: `SpotPriceSnapshot` and `ValuationHistory` models.
- [x] 3.2 Implement `gold-api.com` spot price client (XAU, XAG, XPT, XPD, XCU) with Celery Beat periodic refresh and on-demand refresh endpoint.
- [x] 3.3 Implement valuation waterfall service: melt calculation, PCGS cert/price adapter, Greysheet BYOK adapter, cert verification URL builder (PCGS, NGC, PMG, PCGS Banknote, CACG, ANACS), and AI estimate labeling (`is_estimate=True`).
- [x] 3.4 Implement Portfolio Analytics endpoint (`/api/v1/analytics/summary`): total market value, total melt value, total cost basis, unrealized & realized P&L, Gold/Silver Ratio (GSR), average cost per troy oz (DCA) by metal, metal weight totals, category breakdown, and top-N most valuable items.
- [x] 3.5 Write `pytest-django` tests with mocked HTTP responses for spot pricing, melt/premium/P&L math, PCGS/Greysheet adapters, and analytics aggregation.

## 4. Vision Identification & Cert Extraction
- [x] 4.1 Implement `vision` app: `IdentificationJob` model and `/api/v1/vision/identify` endpoint accepting one or more uploaded images.
- [x] 4.2 Implement Gemini Vision provider adapter with structured JSON schema extraction (category, title, country, year, mint/refiner, denomination, metal, weight, purity, grading service, cert/serial number).
- [x] 4.3 Implement self-hosted Ollama Vision fallback adapter and graceful manual-entry fallback when no AI provider is configured or all fail.
- [x] 4.4 Write `pytest-django` tests for Gemini primary, Ollama fallback, cert-number non-hallucination, and manual fallback behavior.

## 5. Mobile-First React + Vite PWA Frontend
- [x] 5.1 Scaffold `frontend/` with React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, React Router, `vite-plugin-pwa`, and Vitest.
- [x] 5.2 Implement Auth flow (Login / Register) and authenticated API client with workspace context.
- [x] 5.3 Implement Dashboard view: KPI cards (Market Value, Melt Value, Cost Basis, P&L), Live Spot Ticker, Metal & Category breakdowns, and Top Most Valuable Items cards with thumbnails.
- [x] 5.4 Implement Collection Gallery & Table view: Photo Grid / Table toggle, multi-facet filters, sort controls, search bar, and CSV/JSON export trigger.
- [x] 5.5 Implement Quick Scan / Add Item flow: mobile camera capture & multi-photo upload (Obverse, Reverse, Slab Label, Receipt), optional client-side barcode/QR scan, "Identify with AI" pre-fill, live melt preview, and container picker.
- [x] 5.6 Implement Item Detail view (multi-photo viewer, melt vs. premium breakdown, P&L, cert verification link, edit/delete), Containers tree view, and Settings (BYOK Vault) page.
- [x] 5.7 Write Vitest + React Testing Library tests for key UI flows, sorting/filtering, and value formatting.

## 6. K3s Production Packaging & Verification
- [x] 6.1 Create production multi-stage `backend/Dockerfile`, `frontend/Dockerfile` (Nginx), and local `docker-compose.yml` for end-to-end dev/test.
- [x] 6.2 Create Helm chart in `deploy/chart/` (web, celery-worker, celery-beat, frontend, Longhorn media PVC, Traefik Gateway API `HTTPRoute`, `cert-manager` `Certificate`, probes, and resource limits).
- [x] 6.3 Run `openspec validate mvp-core-platform --strict`, full `pytest` suite, `npm run build` + `vitest`, and `helm lint` / `helm template`.

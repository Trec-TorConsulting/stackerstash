# Design: Stackers & Collectors Core Platform (MVP)

## 1. Architecture Overview

The platform is a multi-tenant, mobile-first SaaS web application (PWA) deployed on K3s:

```
┌──────────────────────────────────────────────────────────────────┐
│                 Traefik Gateway API (HTTPRoute + TLS)            │
└───────────────┬──────────────────────────────────┬───────────────┘
                │ /                                │ /api, /admin, /media
                ▼                                  ▼
┌───────────────────────────────┐  ┌───────────────────────────────┐
│   Frontend PWA (Nginx/Static) │  │  Backend API (Django + Ninja) │
│   React 19 + TS + Vite + TW   │  │  Gunicorn + OpenAPI + Admin   │
└───────────────────────────────┘  └───────┬───────────────┬───────┘
                                           │               │
                          ┌────────────────▼──┐     ┌──────▼──────────┐
                          │   PostgreSQL 16   │     │ Redis + Celery  │
                          │ (Tenants, Items,  │     │ (Vision AI,     │
                          │  Spots, Valuations)│     │  Spot Refresh)  │
                          └───────────────────┘     └─────────────────┘
                                           │
                                  ┌────────▼────────┐
                                  │ Longhorn PVC    │
                                  │ (/app/media)    │
                                  └─────────────────┘
```

### Why Django + Django Ninja over Frappe
- **API-first & OpenAPI-native**: Django Ninja generates a strict OpenAPI 3.1 schema for TypeScript client generation while keeping Django's battle-tested ORM, migrations, Auth, Permissions, and `/admin` operator portal.
- **PostgreSQL + JSONB**: Ideal for polymorphic collectible attributes (coins vs. paper banknotes vs. 1kg copper bars vs. Geiger slabs) without heavy ERPNext DocType overhead.
- **PWA Camera & Gallery UX**: Decoupled React + Vite PWA delivers native-feeling mobile camera capture, offline-friendly caching, and fast image-heavy sorting/filtering.

---

## 2. Backend Domain & Data Model

### Core Apps (`backend/apps/`)
1. `accounts`:
   - `User` (custom email-based auth), `Workspace` (owner + future team members), `WorkspaceMembership`.
   - `ProviderCredential`: `(workspace, provider_type [GEMINI, PCGS, GREYSHEET_KEY, GREYSHEET_TOKEN, OLLAMA_URL], encrypted_value, masked_hint, updated_at)` encrypted at rest using `cryptography.fernet.Fernet` derived from `FIELD_ENCRYPTION_KEY`.
2. `catalog`:
   - `Container`: `(id, workspace, parent_id [self-FK], name, container_type [SAFE, BOX, TUBE, BINDER, VAULT, OTHER], location_notes, created_at)`.
   - `CollectionItem`:
     - Ownership & placement: `workspace`, `container` (nullable FK), `quantity` (default 1, e.g. 20 for a tube).
     - Classification: `category` (`COIN`, `PAPER`, `BAR`, `ROUND`, `SLAB`, `FLIPPER`, `OTHER`), `title`, `country`, `year`, `mint_or_refiner`, `denomination`, `series`.
     - Bullion / Melt fields: `metal_type` (`NONE`, `GOLD`, `SILVER`, `PLATINUM`, `PALLADIUM`, `COPPER`), `weight_value`, `weight_unit` (`G`, `KG`, `OZ_T`, `OZ_AVDP`), `purity` (e.g. `0.999`, `0.900`, `0.9999`), `fine_troy_oz` (computed/cached per unit).
     - Grading & Serial fields: `grading_service` (`NONE`, `PCGS`, `NGC`, `PMG`, `PCGS_BANKNOTE`, `CACG`, `ANACS`, `ICG`, `OTHER`), `cert_number`, `grade` (certified grade), `estimated_grade` (non-certified AI/user condition), `ai_confidence` (0..1), `serial_number` (for paper notes / Geiger & bar assays).
     - Lifecycle & Financials: `status` (`IN_COLLECTION`, `FOR_SALE`, `SOLD`, `WISHLIST`), `tags` (JSON/M2M), `purchase_price` (total cost basis for the item/lot), `purchase_date`, `vendor`, `sold_price`, `sold_date`, `notes`.
     - Cached Valuation: `melt_value_unit`, `market_value_unit`, `valuation_source` (`PCGS`, `GREYSHEET`, `NUMISMEDIA`, `SPOT_MELT`, `AI_ESTIMATE`, `MANUAL`), `is_estimate` (bool), `valued_at`.
     - `attributes` (JSONField): extra category-specific fields (e.g. `edge_type`, `obverse_design`, `star_note`, `assay_type`).
   - `ItemPhoto`: `(id, item, workspace, image, label [OBVERSE, REVERSE, SLAB_LABEL, ASSAY, RECEIPT, OTHER], is_primary, sort_order, width, height, created_at)`.
3. `valuation`:
   - `SpotPriceSnapshot`: `(metal_type, price_usd_per_troy_oz, source='gold-api.com', fetched_at)`.
   - `ValuationHistory`: `(item, melt_value, market_value, source, is_estimate, raw_payload, recorded_at)`.
4. `vision`:
   - `IdentificationJob`: `(id, workspace, status, provider_used, raw_response, parsed_candidate, error_message, created_at)` for async or synchronous photo-to-draft-item identification.

### Weight Normalization
- `1 troy oz (OZ_T)` = `31.1034768 g`
- `1 avoirdupois oz (OZ_AVDP)` = `28.349523125 g` (important for copper/base bullion)
- `1 kg (KG)` = `1000 g` = `32.15074657 troy oz`
- `fine_troy_oz = (weight_in_grams / 31.1034768) * purity`
- Note: `gold-api.com` quotes XAU, XAG, XPT, XPD per troy oz, and Copper (XCU) — the adapter normalizes all spot quotes to USD per troy oz (and per gram/kg for display) so `1kg Copper` melt math is exact.

---

## 3. Vision Identification & Valuation Pipeline

Adapting the proven waterfall from `whatnot-live-assistant`:
1. **Image Intake & Barcode/QR/OCR Pre-pass**:
   - Mobile PWA captures camera photo (`<input capture="environment">` / `MediaDevices` / drag-drop upload) for Obverse, Reverse, and optional Slab Label.
   - Client or backend extracts any visible slab barcode/QR payload (`PCGS`, `NGC`, `PMG`, `CACG`, `ANACS`) to avoid hallucinating cert numbers.
2. **Vision AI Identification**:
   - Primary: Workspace BYOK **Gemini Vision** (`gemini-2.5-flash` / `gemini-2.5-pro`) with strict JSON schema output covering coins, paper banknotes, bars (e.g. 1kg copper, Geiger Edelmetalle), rounds, and slabs.
   - Fallback: Workspace-configured **Ollama Vision** URL (e.g. `qwen2.5vl` / `llama3.2-vision` on HomeLab K3s `ollama` service).
   - Output is returned as an editable **Draft Candidate**—the user reviews/tweaks before committing to the catalog.
3. **Valuation Waterfall**:
   - **Step A (Melt)**: Always compute `melt_value = fine_troy_oz * latest_spot_usd * quantity` when `metal_type != NONE`.
   - **Step B (Collector / Cert Lookup)**:
     - If `grading_service == PCGS` and workspace has PCGS token → query PCGS Cert/Price API.
     - If workspace has Greysheet BYOK key/token → query Greysheet CDN wholesale/CPG retail.
     - Generate official verification URLs for PCGS, NGC, PMG, PCGS Banknote, CACG, ANACS.
   - **Step C (AI Appraisal Fallback)**: If no verified price-guide match exists, Vision/LLM appraisal provides an estimated market range, strictly flagged `is_estimate = True` in DB and UI.

---

## 4. Frontend PWA Architecture

- **Stack**: React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, React Router, `vite-plugin-pwa`.
- **Key Views**:
  1. **Dashboard**: Portfolio KPIs (Total Market Value, Total Melt Value, Total Cost Basis, Unrealized & Realized P&L), Live Spot Ticker (Ag, Au, Cu, Pt) + Gold/Silver Ratio (GSR), Metal Weight & DCA Cost/oz Breakdown, Category Breakdown, and **Top Most Valuable Items** cards with thumbnails.
  2. **Collection Gallery & Table**: Switchable Photo Grid / Compact Table view; multi-facet filters (Category, Metal, Container, Status, Tags, Graded/Raw, Estimate vs. Verified); Sort by Value, Melt, Gain/Loss, Purchase Date, Created Date; instant search (title, cert #, serial #, mint); bulk CSV import & printable Insurance/Estate report.
  3. **Quick Scan / Add Item**: Mobile-first camera capture (Obverse/Reverse/Label), "Identify with AI" button, one-tap bullion/constitutional silver presets, editable pre-filled form with live melt preview, container picker, and cost-basis entry.
  4. **Item Detail**: Swipeable/zoomable multi-photo viewer, melt vs. collector premium breakdown, P&L badge, cert verification link, and valuation history.
  5. **Containers & Locations**: Tree view of Safes → Boxes → Tubes / Binders with rolled-up counts and values.
  6. **Settings (BYOK Vault)**: Manage Gemini, PCGS, Greysheet, and Ollama credentials + export collection CSV/JSON.

---

## 5. K3s Deployment & Testing

Production is installed. The contract is `openspec/specs/k3s-deployment/spec.md`.

- **What is live**: Helm release `stackerstash` in namespace `stackerstash`, from `~/Projects/Personal/HomeLab-Redo/stackerstash`. Hosts `stackerstash.com` and `www.stackerstash.com` on Gateway `kube-system/cluster-gateway` listener `https`. Images `registry.maddscientist.com/stackerstash-backend:0.1.0` and `stackerstash-frontend:0.1.0` (amd64 and arm64).
- **Data**: database and role `stackerstash` on the shared Postgres `postgresql.postgresql.svc.cluster.local:5432`. Celery uses in-namespace Redis `redis:6379`. Secret `stackerstash-secrets` is cluster-only.
- **Do not install `deploy/chart/`** over that release. Its values still say `traefik/traefik-gateway`, `registry.homelab.local`, and `redis.redis.svc`.
- **Containers**:
  - `backend`: Python 3.12-slim + Gunicorn (2 workers on the cluster) + `packaging` (required by Celery/kombu 5.7). Init runs `migrate` and `collectstatic`.
  - `worker` / `beat`: same backend image.
  - `frontend`: Node 22 build → Nginx. HTTPRoute sends `/api`, `/admin`, `/static`, and `/media` to the backend and `/` to the frontend.
- **Testing**:
  - Backend: `pytest` + `pytest-django` covering tenant isolation, BYOK encryption, weight/melt math, mocked spot/PCGS/Gemini/Ollama providers, and API CRUD/sorting.
  - Frontend: `vitest` + `@testing-library/react` covering gallery sorting/filtering, scan-to-form flow, and portfolio calculations.


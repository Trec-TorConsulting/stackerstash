# Stacker Stash — Coins, Paper Currency & Bullion Collection Tracker

An enterprise-grade, multi-tenant SaaS & self-hosted PWA for collectors and precious-metals stackers. Catalog coins, paper banknotes, 1 kg copper bars, Geiger silver slabs, rounds, coin flips, and PCGS/NGC/PMG graded slabs in one unified vault.

> **New to Stacker Stash?** Read the [User Guide & Migration How-Tos](docs/USER_GUIDE.md) for step-by-step instructions on scanning items, configuring BYOK keys, and migrating from CoinSnap, Numista, or PCGS/NGC.

---

## Key Features

- **Unified Polymorphic Catalog**: Track Coins, Paper Currency, Bars/Ingots, Rounds, Graded Slabs, and Coin Flips with multi-photo attachments (obverse, reverse, slab label, assay, receipt).
- **Hierarchical Physical Containers**: Model your real-world storage (`Safe / Vault` → `Monster Box` → `Coin Tube` / `Binder`) with rolled-up item counts, melt value, and market value.
- **Live Spot Prices & Normalized Bullion Math**:
  - Fetches live quotes from `gold-api.com` for Gold (`XAU`), Silver (`XAG`), Platinum (`XPT`), Palladium (`XPD`), and Copper (`HG`, automatically converted from USD/lb to USD/troy oz).
  - Auto-refreshes on the Dashboard (with a one-click inline refresh icon) and via Celery Beat every 5 minutes.
  - Supports troy ounces (`ozt`), grams (`g`), kilograms (`kg`), and avoirdupois ounces (`oz`).
- **Multi-Platform CSV Migration Wizard**:
  - Auto-detects exports from **CoinSnap**, **Numista**, **PCGS/NGC Set Registry**, **Stacker Stash**, or custom spreadsheets.
  - Interactive column mapper with live sample preview, currency/metal/grade normalization, title synthesis, and optional best-effort photo URL importing.
- **Vision AI & Valuation Waterfall (BYOK)**:
  - **Vision AI**: Workspace Bring-Your-Own-Key **Gemini Vision** primary with automatic fallback to self-hosted **Ollama** vision models, plus manual entry.
  - **Collector Pricing**: PCGS cert lookup, Greysheet CDN (BYOK), official cert verification URLs (PCGS, NGC, PMG, PCGS Banknote, CACG, ANACS), and clearly labeled AI Estimates (`is_estimate=true`).
- **Portfolio Analytics & Reporting**: Total Market vs. Melt Value, Cost Basis & Unrealized P&L, Gold/Silver Ratio (GSR), Average Cost per Troy Oz (DCA), Top Valuable Items, CSV/JSON exports, and print-ready Insurance Reports.

---

## Architecture

- **Backend (`backend/`)**: Django 5 + Django Ninja (OpenAPI 3.1 at `/api/v1/docs`) + PostgreSQL (or SQLite for local dev) + Celery/Redis + Django Admin (`/admin/`).
- **Frontend (`frontend/`)**: React 19 + TypeScript + Vite + Tailwind CSS v4 + TanStack Query + `vite-plugin-pwa`.
- **K3s Deployment**: Live release is Helm chart `~/Projects/Personal/HomeLab-Redo/stackerstash` (namespace `stackerstash`, hosts `stackerstash.com` and `www`). This repo's `deploy/chart/` is a sketch and must not be installed over that release. Deploy contract: [`openspec/specs/k3s-deployment/spec.md`](openspec/specs/k3s-deployment/spec.md).

---

## Quick Start

### Option 1: Full Stack via Docker Compose
```bash
cp .env.example .env
docker compose up --build
```
- Frontend PWA: `http://localhost:8080`
- Backend API & OpenAPI Docs: `http://localhost:8000/api/v1/docs`
- Django Admin: `http://localhost:8000/admin/`

### Option 2: Local Development

**Backend:**
```bash
cd backend
uv sync
.venv/bin/python manage.py migrate
.venv/bin/python manage.py createsuperuser   # optional, for /admin/
.venv/bin/python manage.py runserver 8000
```

**Frontend PWA:**
```bash
cd frontend
npm install
npm run dev
```

---

## Testing & Verification

```bash
# Backend tests & linter
cd backend
.venv/bin/pytest
.venv/bin/ruff check apps config tests

# Frontend typecheck, build & Vitest
cd frontend
npm run build
npm test

# Helm chart validation (sketch only — do not install this chart on the cluster)
helm lint deploy/chart
helm template stackerstash deploy/chart > /dev/null
```

---

## Deploy to K3S

Local dev stays on SQLite or Docker Compose. Production data is database `stackerstash` on the cluster Postgres. Do not point a laptop `DATABASE_URL` at that server.

The installed chart is `~/Projects/Personal/HomeLab-Redo/stackerstash`. Build the images here, then upgrade that release. `deploy/chart/` still points at `registry.homelab.local`, `traefik/traefik-gateway`, and `redis.redis.svc`.

```bash
cd ~/Projects/Personal/Stackers-coins-paper-collection-tracking

docker buildx build --platform linux/amd64,linux/arm64 --push \
  -t registry.maddscientist.com/stackerstash-backend:0.1.0 \
  -f backend/Dockerfile backend

docker buildx build --platform linux/amd64,linux/arm64 --push \
  -t registry.maddscientist.com/stackerstash-frontend:0.1.0 \
  -f frontend/Dockerfile frontend

helm upgrade --install stackerstash ~/Projects/Personal/HomeLab-Redo/stackerstash -n stackerstash
kubectl rollout status deployment/stackerstash-backend -n stackerstash
```

If `docker buildx --push` cannot reach `registry.maddscientist.com` (`192.168.4.7:443`), export an OCI archive and push it with `skopeo` from the Mac. Leave Secret `stackerstash-secrets` in place. Full rules, including TLS and the `/media` production gap, are in [`openspec/specs/k3s-deployment/spec.md`](openspec/specs/k3s-deployment/spec.md).

---

## OpenSpec Workflow & Documentation

Specifications, architecture decisions, and tracked changes live under `openspec/changes/`:
- `mvp-core-platform` — Core multi-tenant platform, catalog, valuation, vision, and K3s deployment
- `openspec/specs/k3s-deployment/spec.md` — How production on K3S is actually deployed
- `migration-csv-importer` — Multi-platform CSV migration wizard (CoinSnap, Numista, PCGS/NGC)
- `user-docs-and-howtos` — User guide, migration how-tos, and README documentation

Validate specs anytime with:
```bash
openspec validate --all --strict
```

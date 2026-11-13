# StackVault — Coins, Paper Currency & Bullion Collection Tracker

An enterprise-grade, multi-tenant SaaS & self-hosted PWA for collectors and precious-metals stackers. Catalog coins, paper banknotes, 1kg copper bars, Geiger silver slabs, rounds, coin flips, and PCGS/NGC/PMG graded slabs in one unified vault.

## Architecture

- **Backend (`backend/`)**: Django 5 + Django Ninja (OpenAPI 3.1 at `/api/v1/docs`) + PostgreSQL + Celery/Redis + Django Admin (`/admin/`).
- **Frontend (`frontend/`)**: React 19 + TypeScript + Vite + Tailwind CSS v4 + TanStack Query + `vite-plugin-pwa`.
- **Vision & Valuation Pipeline**:
  - **Vision AI**: Workspace BYOK **Gemini Vision** primary with automatic fallback to self-hosted **Ollama** vision models, plus graceful manual entry.
  - **Live Spot Prices**: `gold-api.com` for Gold (Au), Silver (Ag), Platinum (Pt), Palladium (Pd), and Copper (Cu) with normalized troy-ounce, gram, kg, and avdp-oz math.
  - **Collector Pricing**: PCGS cert lookup, Greysheet CDN (BYOK), official cert verification URLs (PCGS, NGC, PMG, PCGS Banknote, CACG, ANACS), and clearly labeled AI Estimates (`is_estimate=true`).
  - **Analytics**: Total Market vs. Melt Value, Cost Basis & Unrealized/Realized P&L, Gold/Silver Ratio (GSR), Average Cost per Troy Oz (DCA), and Most Valuable Items rankings.
- **K3s Deployment (`deploy/chart/`)**: Helm chart with Longhorn `ReadWriteMany` media PVC, Traefik Gateway API `HTTPRoute`, `cert-manager` TLS `Certificate`, `/healthz` and `/readyz` probes.

## Local Development

### Backend
```bash
cd backend
uv sync
.venv/bin/python manage.py migrate
.venv/bin/python manage.py createsuperuser
.venv/bin/python manage.py runserver 8000
```

### Frontend PWA
```bash
cd frontend
npm install
npm run dev
```

### Full Stack via Docker Compose
```bash
docker compose up --build
```

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

# Helm chart validation
helm lint deploy/chart
helm template stackvault deploy/chart > /dev/null
```

## OpenSpec Workflow

All specifications, architecture decisions, and tasks live under `openspec/changes/mvp-core-platform/`. Validate specs anytime with:
```bash
openspec validate mvp-core-platform --strict
```


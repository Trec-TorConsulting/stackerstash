# Proposal: Stackers & Collectors Core Platform (MVP)

## Why

Serious precious-metals stackers and numismatic collectors own diverse holdings—tubes of coins, 1kg copper bars, Geiger silver slabs, graded PCGS/NGC/PMG slabs, raw paper currency, coin flips, and rounds—that existing single-category apps like CoinSnap cannot identify, value, or organize together. We need a unified, privacy-respecting, multi-tenant SaaS web app (mobile-first PWA) that identifies any collectible or bullion piece from a photo, computes live melt and collector values, tracks containers and cost basis, and runs production-grade on our K3s cluster.

## What Changes

- Introduce a multi-tenant SaaS backend built on **Django + Django Ninja (OpenAPI) + PostgreSQL + Celery/Redis** with built-in Django Admin portal and encrypted per-user BYOK API key vault.
- Introduce a mobile-first **React + TypeScript + Vite PWA** featuring live camera/photo intake, high-density sortable photo galleries, container/location hierarchy, and portfolio analytics.
- Implement a universal **Vision Identification & Cert Extraction** pipeline (Gemini Vision primary, self-hosted Ollama fallback, plus barcode/QR/OCR cert scanning for PCGS/NGC/PMG/etc.).
- Implement a **Valuation & Portfolio Analytics** engine combining live spot prices (`gold-api.com` for Ag, Au, Cu, Pt), third-party cert/price lookups (PCGS, Greysheet CDN, NumisMedia FMV), melt-vs-numismatic premium calculation, and cost-basis P&L.
- Package the platform with **Docker + Helm chart** following HomeLab K3s conventions (PostgreSQL, Redis, Longhorn media storage, Traefik Gateway API `HTTPRoute`, `cert-manager`).

## Capabilities

### New Capabilities
- `identity-tenancy`: Multi-tenant user authentication, workspace isolation, encrypted BYOK secret vault, and Django Admin portal.
- `catalog-inventory`: Polymorphic collectible/bullion item catalog, hierarchical containers/locations, multi-photo gallery, cert/serial tracking, and rich sorting/filtering.
- `vision-identification`: Camera/photo upload intake, multimodal Vision AI identification (Gemini + Ollama), and slab barcode/QR/OCR cert extraction.
- `valuation-analytics`: Live spot metal prices, numismatic/cert appraisal integration, melt vs. collector premium, cost-basis P&L, and portfolio summary/top-items analytics.
- `k3s-deployment`: Containerized production build, Helm chart, health/readiness probes, and K3s Gateway API manifests.

### Modified Capabilities
<!-- None; greenfield project -->

## Impact

- New Django backend (`backend/`), React/Vite PWA frontend (`frontend/`), and K3s Helm deployment (`deploy/chart/`).
- External integrations: `gold-api.com` (spot prices), Gemini API / self-hosted Ollama (vision/appraisal), and optional BYOK PCGS / Greysheet APIs.
- Full automated test coverage (`pytest-django` backend suite, Vitest/Playwright frontend suite).


# Proposal: Build Full Specifications Page & Resolve Stubs

## Why
On `/features`, the call-to-action link `Explore full specifications →` currently links to `/features` itself (a circular self-reference), leaving collectors without an exhaustive, technical reference of supported asset classification data models, slab verification URL patterns, grading scales, camera reticles, spot metal conversion formulas, and security architecture. Additionally, a codebase deep dive identified unfinished/stubbed artifacts—most notably a fake, unpersisted email lead-capture form on `/coming-soon` and omissions of specifications links from primary header and footer navigation—which violate the platform's standard of verified destinations and zero fake lead forms.

## What Changes
- **New Full Specifications Page & Route (`/specifications`, with `/specs` alias)**: Create a dedicated, exhaustive technical specifications page detailing:
  - Supported asset attributes and data models (Coins, Paper Banknotes, Goldbacks, Bullion Bars/Rounds, Trading/Sports Cards).
  - 12 grading services and certified slab verification deep-link schemas (`PCGS`, `NGC`, `PMG`, `PCGS Banknote`, `CACG`, `CAC`, `ANACS`, `ICG`, `PSA`, `BGS`, `CGC`, `SGC`, `TAG`) along with barcode parsing regex rules.
  - Sheldon 1–70 and card 1–10 grading scales, strike designations (`DMPL`, `DCAM`, `FB`, `FS`, `FBL`, `FH`, `RD/RB/BN`), and card sub-grades.
  - Valuation & physical melt floor algorithms (live 5-metal spot math, copper avoirdupois-to-troy ounce normalization, Goldback 24K aurum benchmark, IQR comp outlier trimming, raw-to-grade break-even ROI formula).
  - Vision intake and camera capture pipeline specifications (reticle ratios 1:1, 1.586:1, 3:4; glare and screen/moiré anti-spoof checks; OCR/catalog/vision cascade).
  - Storage hierarchy and security architecture (unlimited-depth container tree, recursive value rollups, Fernet-encrypted BYOK secrets, HMAC-signed media, and offline PWA IndexedDB schema).
- **Resolve Self-Referencing Links**: Update `AssetsAndFeaturesSection` in `MarketingPage.tsx` so `Explore full specifications →` links directly to `/specifications` instead of looping back to `/features`.
- **Primary Navigation & Footer Integration**: Add `Specifications` to `PublicHeader.tsx` (desktop nav and mobile drawer) and `SiteFooter.tsx`.
- **Eliminate Fake / Unpersisted Lead Capture**: Clean up `/coming-soon` by removing the mock email form that only toggles component state, replacing it with an authentic early access CTA to `/register` and `/login` consistent with the live platform.
- **Edge Delivery, SEO & Prerendering**: Add `/specifications` to static HTML prerendering (`prerender.tsx`), XML sitemap (`sitemap.xml`), and dynamic SEO head configuration (`seo.ts`) with dedicated JSON-LD structured data.

## Capabilities

### Modified Capabilities
- `public-marketing-website`: Add requirement for dedicated public full specifications page (`/specifications` and `/specs`), update navigation and footer links, remove circular self-referencing links, and eliminate unpersisted mock lead forms in favor of live account access CTAs.
- `seo-social-and-edge-delivery`: Expand static prerendering list, XML sitemap, and SEO metadata matrix to include `/specifications` with canonical tagging and structured metadata.

## Impact
- **Frontend Code**: `frontend/src/App.tsx`, `frontend/src/pages/MarketingPage.tsx`, `frontend/src/pages/SpecificationsPage.tsx` (new), `frontend/src/pages/ComingSoonPage.tsx`, `frontend/src/components/PublicHeader.tsx`, `frontend/src/components/SiteFooter.tsx`, `frontend/src/lib/seo.ts`, `frontend/src/prerender.tsx`, `frontend/src/data/marketingCatalog.ts`, `frontend/public/sitemap.xml`.
- **Backend / APIs**: No backend schema or database migrations required; leverages existing reference models and deterministic grading schemas already in `backend/apps/catalog/reference_data/`.
- **Testing**: Frontend unit and integration tests in `frontend/src/__tests__/marketingSeo.test.tsx` and new specifications test suite ensuring 100% route, link, and prerender coverage.

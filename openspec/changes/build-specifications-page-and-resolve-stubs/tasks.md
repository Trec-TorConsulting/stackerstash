# Tasks: Build Full Specifications Page & Resolve Stubs

## 1. Technical Specifications Data Catalog

- [ ] 1.1 Create `frontend/src/data/specificationsCatalog.ts` defining structured specifications for numismatics (Sheldon 1–70, strike designations), banknotes (Friedberg, PMG, Goldbacks), bullion (5 metals, troy/gram/avoirdupois conversions), cards (TCG/Sports attributes, 1–10 grades, sub-grades), grading services (12 services, cert URLs, barcode patterns), vision pipeline, and valuation algorithms; verify compile without TypeScript errors.

## 2. Specifications Page Component & Routing

- [ ] 2.1 Implement `frontend/src/pages/SpecificationsPage.tsx` featuring accessible category navigation pills, searchable/filterable spec tables, interactive cert verification deep-links, and verify rendering with unit tests.
- [ ] 2.2 Register `/specifications` and `/specs` routes in `frontend/src/App.tsx` for both unauthenticated visitors and authenticated vault layouts, and verify route resolution.

## 3. Link Fixes & Navigation Integration

- [ ] 3.1 Update `MarketingPage.tsx` so the "Explore full specifications →" link directs to `/specifications` instead of the circular `/features` destination.
- [ ] 3.2 Update `PublicHeader.tsx` (desktop navigation and mobile drawer) and `SiteFooter.tsx` to include `Specifications` links and verify accessible navigation.

## 4. Stub Resolution & Early Access Form Cleanup

- [ ] 4.1 Update `ComingSoonPage.tsx` to remove the unpersisted mock email state form and replace it with authentic direct access call-to-actions (`/register` and `/login`), satisfying the verified destination and zero fake forms requirement.

## 5. SEO, Prerender & Full Test Verification

- [ ] 5.1 Update `frontend/src/lib/seo.ts` to provide title, description, canonical link, and JSON-LD schema for `/specifications`.
- [ ] 5.2 Add `/specifications` to `frontend/src/prerender.tsx` and `frontend/public/sitemap.xml`, and verify static prerender generation.
- [ ] 5.3 Update tests in `frontend/src/__tests__/marketingSeo.test.tsx` and create `frontend/src/__tests__/specifications.test.tsx` to verify all links, routes, SEO tags, and prerender output pass with `npm test`.

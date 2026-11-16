# Tasks

- [x] 1.1 Add `detect_circular_coin`, harden `_salient_foreground_mask` / `_remove_background_grabcut` / `detect_rectangular_subject`, and wire `shape_hint="coin"` into `api.py` and `importer.py`.
- [x] 1.2 Lower `detect_coin_in_slab` `min_r` to `0.13 * sw` (with CLAHE fallback) so small-denomination slabbed coins (dimes, cents, nickels, quarters) extract cleanly.
- [x] 1.3 Add `POST /api/v1/catalog/items/{item_id}/photos/{photo_id}/rotate` endpoint and **Rotate 90°** button in `ItemDetailPage.tsx` + `api.ts`.
- [x] 2.1 Fix `purity` float precision leak in `ScanAddPage.tsx`.
- [x] 2.2 Fix form `id`/`name`/`label` accessibility, wrap password fields in `<form>` on `SettingsPage.tsx`, and replace deprecated `apple-mobile-web-app-capable` meta tag in `frontend/index.html`.
- [x] 3.1 Deduplicate `Graded Slab` / `Graded` badges on `CollectionPage.tsx` cards.
- [x] 3.2 Add fine-weight fallback from `gross_weight_g` × `purity` when `fine_weight_oz == 0`, and show `—` for Dashboard `Unrealized P&L` when `total_cost_basis == 0`.
- [x] 4.1 Hide/update `Vault Sign In` in `SiteFooter.tsx` when authenticated, add ellipsis truncation to `SettingsPage.tsx` credential badge, and improve mobile header logo contrast in `Layout.tsx`.
- [ ] 5.1 Add/update tests, run `openspec validate image-crop-and-ui-polish`, build frontend (`npm run build`), and execute `branch -> commit -> push -> pr -> merge -> deploy`.

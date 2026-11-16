# Design

## 1. Image Processing & Photo Rotation
- **Direct circular coin detection (`detect_circular_coin`)**:
  - Downscale original image to `<= 480px`, apply `CLAHE` on luminance (`clipLimit=2.0`, `tileGridSize=(8, 8)`), `GaussianBlur(5, 5)`, and `Canny(40, 120)`.
  - Run `HoughCircles` (`min_r = 0.14 * min_dim`, `max_r = 0.49 * min_dim`, `param2=28` with `param2=20` fallback).
  - Score candidates by 72-angle circumference edge coverage (`>= 40` angles), inner-vs-outer LAB contrast, interior detail std, and center proximity.
- **Small-denomination slab extraction (`detect_coin_in_slab`)**:
  - Lower `min_r` from `0.25 * sw` to `0.13 * sw` (and widen `cy_s` upper bound slightly to `0.85 * sh`), with CLAHE + `param2=20` fallback so dimes, cents, nickels, and quarters inside NGC/PCGS slabs are detected reliably.
- **GrabCut & Saliency Hardening**:
  - Score `_salient_foreground_mask` contours with Gaussian center weighting and border-touch penalties (`0.25` for `>=2` edges, `0.6` for `1` edge).
  - In `_remove_background_grabcut`, when `has_alpha=True`, only seed the deep interior core as `GC_FGD` (`7x7` kernel, 3 iterations). After GrabCut, if the central `30%×30%` region has `< 15%` foreground, retry with a center-seeded mask.
- **Rectangular Sleeve/Mat Trimming (`detect_rectangular_subject`)**:
  - Compute outer rim vs. eroded interior luminance (`has_dark_rim`); allow LAB-distance Otsu refinement up to `extent < 0.96` and `area_ratio <= 0.94`.
- **90° Photo Rotation**:
  - Add `POST /api/v1/catalog/items/{item_id}/photos/{photo_id}/rotate` (default `degrees=90` clockwise, using `Image.ROTATE_270` / `Image.ROTATE_90` / `Image.ROTATE_180` to preserve lossless pixels & alpha).
  - Add a **Rotate 90°** button on `ItemDetailPage.tsx` next to **Clean BG**.

## 2. Form Precision, Accessibility & UI Polish
- **Purity float formatting**: In `ScanAddPage.tsx`, normalize numeric purity values with `Number(c.purity.toFixed(4)).toString()` (or `String(Number(Number(c.purity).toFixed(4)))`) to eliminate IEEE-754 float noise like `0.9990000128746033`.
- **Accessibility / DOM**:
  - Add `id`/`name`/`htmlFor` or `aria-label` on inputs/selects in `CollectionPage.tsx`, `ScanAddPage.tsx`, and `SettingsPage.tsx`.
  - Wrap password inputs in `SettingsPage.tsx` inside `<form onSubmit={...}>` elements.
  - Replace `apple-mobile-web-app-capable` with `mobile-web-app-capable` in `frontend/index.html`.
- **Card Badges & Valuation**:
  - In `CollectionPage.tsx`, omit the redundant `Graded` pill when `item.category === "SLAB"` (since `Graded Slab` is already shown), and keep badges cleanly spaced.
  - In `backend/apps/catalog/models.py` / `api.py` (where `fine_weight_oz` / `melt_value` are computed), fall back to `(gross_weight_g / 31.1034768) * purity` when `fine_weight_oz == 0` and `gross_weight_g > 0` on precious metals.
  - In `DashboardPage.tsx`, render `—` for Unrealized P&L when `Number(summary.total_cost_basis) === 0`.
- **Footer, Settings & Mobile Logo**:
  - In `SiteFooter.tsx`, check auth state (`useAuth()`) and show `Vault` (`/collection`) instead of `Vault Sign In` when authenticated.
  - In `SettingsPage.tsx`, add `max-w-[220px] truncate` on the credential `Configured (...)` badge.
  - In `Layout.tsx`, brighten the mobile header logo icon/badge for clear contrast on dark backgrounds.

# Tasks: iOS PWA Viewport and Navigation Fix

## 1. Viewport & PWA HTML Configuration

- [x] 1.1 Update viewport meta tag in `frontend/index.html` to include `viewport-fit=cover`, `maximum-scale=1.0`, and `user-scalable=no`, and add `<meta name="apple-mobile-web-app-capable" content="yes" />`. Verify tags are properly configured in `index.html`.
- [x] 1.2 Validate `frontend/vite.config.ts` PWA manifest configuration for standalone mode, theme color, and status bar settings.

## 2. Global CSS Overscroll and Touch Containment

- [x] 2.1 Add root overscroll locking (`overscroll-behavior-y: none`, `-webkit-overflow-scrolling: touch`), safe area variable definitions, and `touch-action: manipulation` in `frontend/src/index.css`. Verify CSS syntax with frontend build.

## 3. Safe-Area Insets & Hardware-Composited Navigation

- [x] 3.1 Update `frontend/src/components/Layout.tsx` mobile bottom `<nav>` to include `pb-[env(safe-area-inset-bottom)]` and hardware compositing layer (`transform: translateZ(0)` / `translate-z-0`) to prevent jitter and float during inertia scroll.
- [x] 3.2 Update `frontend/src/components/Layout.tsx` mobile header with top safe area padding (`pt-[env(safe-area-inset-top)]`) and adjust content padding to `pb-[calc(4rem+env(safe-area-inset-bottom))]` for home indicator clearance.
- [x] 3.3 Adopt dynamic viewport units (`min-h-screen min-h-dvh`) in `frontend/src/components/Layout.tsx` and main root wrappers to prevent layout reflow when mobile browser bars toggle.

## 4. Verification & Validation

- [x] 4.1 Run frontend test suite (`npm test -- --run` in `frontend/`) and verify all test suites pass cleanly.
- [x] 4.2 Run frontend production build (`npm run build` in `frontend/`) and verify asset bundling, PWA manifest generation, and service worker registration succeed without errors.

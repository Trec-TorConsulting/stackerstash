# Proposal: iOS PWA Viewport and Navigation Fix

## Why
When testing Stacker Stash on iOS devices (Safari and installed Home Screen PWA), the app displays web-like elastic bouncing, horizontal/vertical drift, and jittery floating navigation. This occurs because the viewport lacks `viewport-fit=cover` and scale constraints, `apple-mobile-web-app-capable` is missing from HTML meta tags, the fixed bottom navigation lacks hardware acceleration and safe-area insets (`env(safe-area-inset-bottom)`), and document-level overscroll bounce is unconstrained. Providing an app-like viewport lock and anchored navigation restores a smooth, native iOS feel.

## What Changes
- **Viewport & PWA Meta Tag Alignment**:
  - Update `viewport` meta tag in `frontend/index.html` to include `viewport-fit=cover`, `maximum-scale=1.0`, and `user-scalable=no`.
  - Add `<meta name="apple-mobile-web-app-capable" content="yes" />` alongside existing mobile meta tags to ensure true standalone execution when added to iOS Home Screen.
- **Overscroll & Touch Action Containment**:
  - In `frontend/src/index.css`, apply `overscroll-behavior-y: none`, `-webkit-overflow-scrolling: touch`, and `-webkit-tap-highlight-color: transparent` to prevent page rubber-banding and elastic bounce.
  - Define CSS custom properties for safe-area insets (`--sat`, `--sab`, `--sal`, `--sar`).
  - Set `touch-action: manipulation` on buttons, navigation links, and interactive controls to eliminate double-tap zoom drift.
- **Safe Area Insets & Stationary Bottom Navigation**:
  - Update `frontend/src/components/Layout.tsx` mobile bottom `<nav>` with `pb-[env(safe-area-inset-bottom)]`, `translate-z-0`, and WebKit GPU compositing to prevent jumping/jittering during inertia scrolling.
  - Pad top mobile header with `pt-[env(safe-area-inset-top)]` for notch and dynamic island clearance under `black-translucent` status bar style.
  - Adjust main content bottom padding to `calc(4rem + env(safe-area-inset-bottom))` so items and footer actions are never obscured by the home indicator bar or fixed nav.
  - Adopt dynamic viewport units (`min-h-dvh` / `h-dvh`) on root shell layouts to prevent viewport shifts when browser chrome appears or disappears.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `pwa-progressive-and-offline-appraisal`: Add requirement and scenarios for iOS standalone PWA viewport lock, safe-area inset adaptation, and stationary bottom navigation anchoring.

## Impact
- **Affected code**: `frontend/index.html`, `frontend/src/index.css`, `frontend/src/components/Layout.tsx`, `frontend/src/App.tsx`.
- **User experience**: Eliminates elastic webpage movement, double-tap zoom drift, and navigation jumping on iOS Safari and installed PWA; protects home indicator touch target clearance.
- **Dependencies & APIs**: No backend or external API changes required.

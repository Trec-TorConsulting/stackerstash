# Design: iOS PWA Viewport and Navigation Fix

## Context
See `proposal.md` for problem motivation and user observations.
Currently, `frontend/index.html` specifies standard viewport bounds (`width=device-width, initial-scale=1.0`) without `viewport-fit=cover`, maximum scale limits, or `apple-mobile-web-app-capable`. On iOS WebKit, this triggers default browser bounce behaviors, pinch/double-tap page drift, and unstyled letterboxing around the iPhone home indicator and notch. Furthermore, `frontend/src/components/Layout.tsx` anchors the bottom navigation bar with simple `fixed bottom-0` without hardware compositing or `env(safe-area-inset-bottom)` padding, leading to visual jumping when iOS dynamic toolbars resize or when momentum scrolling occurs.

## Goals / Non-Goals

**Goals:**
- Provide a stable, stationary app shell on iOS Safari and installed PWA with no jittery bottom bar movement.
- Eliminate accidental double-tap zoom drift and whole-page horizontal/vertical rubber-banding.
- Ensure all interactive elements clear the iOS home indicator bar and top status bar/notch.
- Use native WebKit capabilities (`viewport-fit=cover`, `overscroll-behavior-y: none`, CSS safe area environment variables, dynamic viewport units `dvh`, GPU compositing `transform: translateZ(0)`).

**Non-Goals:**
- Converting the web app to a native iOS binary (Swift/Capacitor/React Native).
- Modifying backend APIs, valuation logic, or authentication endpoints.
- Altering desktop or tablet viewport behavior beyond standard responsive parity.

## Decisions

### 1. Viewport Meta Configuration
- **Decision**: Update viewport tag in `frontend/index.html` to:
  `width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover`.
  Add `<meta name="apple-mobile-web-app-capable" content="yes" />`.
- **Rationale**: `viewport-fit=cover` permits full-screen canvas in standalone and Safari mode while exposing `env(safe-area-inset-*)`. `user-scalable=no` and `maximum-scale=1.0` prevent inadvertent page zooms when tapping navigation buttons or inputs rapidly.
- **Alternatives Considered**: Keeping user-scalable enabled resulted in intermittent tap-zooms that shifted the viewport off-center on iPhone.

### 2. Overscroll and Touch Containment in CSS
- **Decision**: Apply `overscroll-behavior-y: none`, `-webkit-overflow-scrolling: touch`, and `touch-action: manipulation` on root containers and interactive elements in `frontend/src/index.css`.
- **Rationale**: Native iOS Safari initiates an elastic rubber-band animation on the root viewport when scrolled past boundaries. `overscroll-behavior-y: none` locks the outer viewport while allowing inner overflow containers to scroll smoothly. `touch-action: manipulation` disables the 300ms double-tap-to-zoom gesture without breaking fast scrolling.
- **Alternatives Considered**: Using JavaScript `touchmove.preventDefault()` listeners; rejected because passive touch listeners in CSS perform significantly better without blocking main thread frame rates.

### 3. Safe-Area Insets and GPU Compositing for Bottom Nav
- **Decision**:
  - In `Layout.tsx`, wrap the mobile bottom navigation with `pb-[env(safe-area-inset-bottom)]` and hardware layer promotion `translate-z-0` (`transform: translateZ(0)`).
  - Add top safe area padding `pt-[env(safe-area-inset-top)]` to the mobile header.
  - Adjust main content bottom spacing to `pb-[calc(4rem+env(safe-area-inset-bottom))]` to maintain adequate clearance above the taller safe-area padded bottom bar.
  - Adopt `min-h-dvh` in root layout wrappers in place of `min-h-screen` (`100vh`).
- **Rationale**: `transform: translateZ(0)` forces WebKit to create a separate GPU compositing layer for the fixed bottom bar, preventing it from detaching or flickering during iOS inertia scrolling. Safe-area insets prevent the home indicator bar from overlapping navigation icons.

## Risks / Trade-offs

- **[Risk]** Accessibility trade-off with `user-scalable=no` preventing pinch-to-zoom on regular text.
  → **Mitigation**: Constrain `touch-action: manipulation` primarily to buttons and nav controls; collection photos and high-resolution item slabs feature dedicated modal zoom/crop views (`PhotoCropRotateView`).
- **[Risk]** Older browsers not supporting `dvh` units.
  → **Mitigation**: Use Tailwind `min-h-screen min-h-dvh` fallback pairing so older engines fall back to standard `100vh`.

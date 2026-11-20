# Spec Delta: pwa-progressive-and-offline-appraisal

## ADDED Requirements

### Requirement: iOS PWA standalone viewport lock and stationary navigation
The system SHALL lock viewport scaling, prevent elastic document rubber-banding, adapt to device safe-area insets, and anchor mobile navigation stably during inertia scrolling when running in iOS Safari or standalone PWA mode.

#### Scenario: Standalone iOS launch with safe-area insets
- **WHEN** a user opens the app on an iOS device in Safari or as an installed Home Screen PWA
- **THEN** the viewport occupies the full screen with `viewport-fit=cover`, status bar styling adapts to safe-area insets, and top and bottom app chrome clears device notches and home indicators

#### Scenario: Inertia scrolling without elastic window bounce or floating nav jitter
- **WHEN** a user scrolls a catalog view or dashboard with inertial flick gestures on iOS
- **THEN** the document does not elastic rubber-band or pan horizontally, and the mobile bottom navigation remains fixed at the bottom with hardware compositing

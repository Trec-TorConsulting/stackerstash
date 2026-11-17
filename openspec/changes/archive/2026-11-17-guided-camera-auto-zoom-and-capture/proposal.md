# Proposal

## Why

Taking steady, well-framed close-up photos of small coins, slab labels, and banknotes on a phone or desktop webcam is awkward when users have to hold the item steady with one hand while manually adjusting zoom and tapping the shutter with the other. `GuidedCameraModal` already performs live 450ms exposure/sharpness analysis and supports hardware/digital zoom, so adding smart **Auto-Zoom** and **Auto-Capture** makes intake effortless, consistent, and hands-free.

## What Changes

- **User-Friendly Auto-Capture (Hands-Free Shutter)**:
  - Add an **Auto-Capture** toggle (enabled by default in live camera mode) that monitors consecutive sharp, well-lit, and steady frames, shows a clear visual countdown/lock-on indicator (`"Hold steady… capturing"`), and automatically snaps the photo once the item is in a good spot.
  - Include a brief cooldown/reset when transitioning from Step 1 (Front) to Step 2 (Back) so users have time to flip the coin or note before auto-capture arms again.
- **Smart Auto-Zoom (Subject Framing)**:
  - Add an **Auto-Zoom** toggle that compares center-reticle detail against outer-frame detail on the live sample canvas; when a small coin or subject occupies too little of the frame, smoothly step zoom in (capped at `2.0x`) using hardware zoom where supported and clean reticle-centered digital crop otherwise.
  - Keep the manual zoom slider and manual shutter button always accessible—touching the zoom slider automatically yields manual control without fighting the user.

## Capabilities

### New Capabilities
<!-- None; extends existing vision-identification camera intake behavior. -->

### Modified Capabilities
- `vision-identification`: Add user-friendly hands-free auto-capture (with stability detection, visual lock-on feedback, and front-to-back flip cooldown) and smart auto-zoom framing with seamless manual override to the camera intake requirement.

## Impact

- **Frontend**:
  - `frontend/src/components/GuidedCameraModal.tsx` (frame-stability & center-vs-outer subject sizing metrics, Auto-Capture & Auto-Zoom toggles, visual lock-on progress indicator, front-to-back flip cooldown, manual override handling)
  - `frontend/src/__tests__/intake.test.tsx` (unit/integration tests for Auto-Capture, Auto-Zoom, toggles, and manual override)
- **Backend**: None (purely client-side capture UX producing the same high-detail JPEG `File` objects).


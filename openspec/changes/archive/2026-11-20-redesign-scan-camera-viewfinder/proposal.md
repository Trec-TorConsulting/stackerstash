# Proposal: Redesign Scan Camera Viewfinder

## Why
When scanning items on mobile devices (such as iPhone), the camera viewfinder in `ScanAddPage` is cramped into a squat 4:3 box where a heavy dark vignette shadow (`shadow-[0_0_0_9999px]`), top status pill, and large action buttons cover up the frame and obscure the collectible. Furthermore, `getUserMedia` auto-starts upon page load without an explicit user gesture, causing abrupt layout shifts and prompting for camera permissions repeatedly on iOS. Replacing the obstructed inline view with an unobstructed preview, integrating the full-featured `GuidedCameraModal`, and requiring explicit user activation restores a clean, native-feeling camera experience that preserves iOS remembered permissions.

## What Changes
- **Explicit Camera Activation**:
  - Default `cameraOpen` to `false` in `ScanAddPage` so the camera stream only initializes upon explicit user interaction ("Open Camera" or "Take Photo").
  - Eliminates automatic permission prompts on route navigation and ensures compliance with iOS WebKit user-gesture security policies.
- **Unobstructed Viewfinder Layout**:
  - Remove the opaque dark outer vignette (`shadow-[0_0_0_9999px]`) from the viewfinder overlay.
  - Replace the heavy overlay with subtle, semi-transparent corner alignment guides and a minimalist center reticle.
  - Relocate the action controls ("Snap Front/Back Photo", "Close Camera") outside and below the video preview frame (or on a slim translucent bottom dock), keeping 100% of the viewfinder canvas unobstructed.
  - Expand the mobile video container from squat `aspect-[4/3]` to a spacious portrait-friendly aspect ratio (`aspect-[3/4]` or `min-h-[360px]`).
- **Guided Camera Modal Integration**:
  - Wire the pre-existing full-screen [`GuidedCameraModal`](file:///Users/trecto282@cable.comcast.com/Projects/Personal/Stackers-coins-paper-collection-tracking/frontend/src/components/GuidedCameraModal.tsx) into `ScanAddPage` via a primary "Guided Scan" action, providing collectors with coin/note/slab/card reticles, torch toggle, zoom slider, auto-snap, and dual-side review.
- **Native Camera Fallback & Permission Guidance**:
  - Provide an accessible tip in `ScanAddPage` detailing how iPhone users can permanently enable camera access in Safari Website Settings (`aA` -> Website Settings -> Camera -> Allow).
  - Retain the direct native camera fallback (`<input type="file" capture="environment" />`) for collectors who prefer using the iOS system camera app without browser media stream prompts.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `guided-camera-capture`: Update requirements to enforce unobstructed viewfinder framing, externalized/docked controls, explicit gesture-based activation, and integrated full-screen guided modal capture.

## Impact
- **Affected code**: `frontend/src/pages/ScanAddPage.tsx`, `frontend/src/components/GuidedCameraModal.tsx`.
- **User experience**: Eliminates obscured camera viewports on iPhone, eliminates auto-start permission prompts, and provides both a spacious inline viewfinder and a rich full-screen guided capture modal.
- **Dependencies & APIs**: No new third-party packages or backend API changes required.

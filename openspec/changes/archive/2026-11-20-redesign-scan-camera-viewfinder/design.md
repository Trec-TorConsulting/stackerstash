# Design: Redesign Scan Camera Viewfinder

## Context
See `proposal.md` for user problem and screenshot analysis.
In `frontend/src/pages/ScanAddPage.tsx`, the inline camera viewfinder was configured with `cameraOpen = Boolean(navigator.mediaDevices?.getUserMedia)`, causing `getUserMedia()` to execute on initial render whenever the user visits `/scan`. When active, the video stream is rendered in a squat 4:3 frame containing a 224px dashed box with `shadow-[0_0_0_9999px_rgba(2,6,23,0.45)]` (which severely dims the surrounding video) and two prominent buttons ("Close Camera" and "Snap Front Photo") positioned directly inside the bottom of the viewfinder. On an iPhone screen, this obscures more than 60% of the live preview.

Meanwhile, the repository contains a comprehensive, accessible full-screen modal component ([`GuidedCameraModal.tsx`](file:///Users/trecto282@cable.comcast.com/Projects/Personal/Stackers-coins-paper-collection-tracking/frontend/src/components/GuidedCameraModal.tsx)) that was not integrated into `ScanAddPage`.

## Goals / Non-Goals

**Goals:**
- Eliminate all viewfinder visual obstructions: no darkening vignette shadows over the video feed, no primary action buttons floating on top of the image frame.
- Expand the mobile video preview to a spacious portrait-friendly aspect ratio (`aspect-[3/4]` or `min-h-[380px]`) with subtle corner framing brackets.
- Move camera controls ("Snap Photo", "Close Camera") neatly below the video preview.
- Integrate `GuidedCameraModal` into `ScanAddPage` as a dedicated full-screen capture path with reticle shape selection (coin/note/slab/card), zoom slider, torch toggle, and dual obverse/reverse flow.
- Ensure camera initialization requires an explicit user tap, avoiding automatic permission prompts and complying with iOS WebKit permission persistence policies.
- Provide clear in-app guidance for iPhone users on permanently granting camera permissions in Safari Website Settings.

**Non-Goals:**
- Removing the native file input camera fallback (`capture="environment"`).
- Altering the backend image processing, quality gating, or auto-crop server pipelines.

## Decisions

### 1. Explicit Camera Activation Model
- **Decision**: In `ScanAddPage.tsx`, initialize `const [cameraOpen, setCameraOpen] = useState(false)` and `const [guidedModalOpen, setGuidedModalOpen] = useState(false)`.
- **Rationale**: WebKit on iOS requires a user gesture for media devices. Firing `getUserMedia()` automatically on mount triggers frequent permission re-prompts and disrupts navigation. Requiring a button tap allows iOS to honor stored permissions smoothly.
- **Alternatives Considered**: Keeping auto-open enabled caused jarring layout jumps and constant permission alerts on iOS.

### 2. Clean, Unobstructed Inline Viewfinder Layout
- **Decision**:
  - Replace the heavy `shadow-[0_0_0_9999px]` mask with delicate gold corner brackets (`border-t-2 border-l-2`, etc.) and a minimal center crosshair that leave 100% of the video canvas bright and visible.
  - Move the "Snap Photo" and "Close Camera" buttons into an anchored control bar **directly beneath** the video viewport.
  - Update the container aspect ratio from `aspect-[4/3]` to `aspect-[3/4] sm:aspect-video` so mobile portrait viewports provide substantial vertical room for centering coins and notes.
- **Rationale**: Placing buttons beneath the preview ensures the user's fingers never block the collectible they are trying to frame.

### 3. Integrated Full-Screen Guided Camera Modal
- **Decision**: Add a prominent "Guided Camera (Full Screen)" action on `ScanAddPage` that opens `GuidedCameraModal`.
- **Rationale**: `GuidedCameraModal` already provides hands-free auto-snap, shape reticles (circle/note/slab), torch control, digital/optical zoom, and dual-side front-then-back sequencing. Giving users access to this full-screen experience delivers a CoinSnap-level capture workflow.

### 4. iOS Permission Helper Banner
- **Decision**: Add a concise, non-intrusive tip card: "Tip for iPhone: Tap **aA** in Safari's address bar > **Website Settings** > set **Camera** to **Allow** to remember permission permanently."
- **Rationale**: Educates users on iOS WebKit's native settings without requiring complex workarounds.

## Risks / Trade-offs

- **[Risk]** Existing tests might expect `cameraOpen` to be initially true when `getUserMedia` is mocked.
  → **Mitigation**: Verify and update `frontend/src/__tests__/scanAddCoverage.test.tsx` and related tests to trigger the open camera action before asserting viewfinder states.

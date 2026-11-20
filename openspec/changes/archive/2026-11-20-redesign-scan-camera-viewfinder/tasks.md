# Tasks: Redesign Scan Camera Viewfinder

## 1. Inline Viewfinder Redesign & Explicit Activation

- [x] 1.1 Update `frontend/src/pages/ScanAddPage.tsx` inline viewfinder to remove the dark `shadow-[0_0_0_9999px]` vignette, replace it with subtle corner guide brackets, expand mobile aspect ratio to `aspect-[3/4] sm:aspect-video`, and move action buttons underneath the video preview.
- [x] 1.2 Change `cameraOpen` initialization in `frontend/src/pages/ScanAddPage.tsx` to default to `false`, starting `getUserMedia` only upon explicit user button tap.

## 2. Guided Camera Modal & iOS Permission Guidance

- [x] 2.1 Integrate `GuidedCameraModal` into `frontend/src/pages/ScanAddPage.tsx` via a prominent "Guided Scan" button, passing captured obverse and reverse files to `ingestFiles`.
- [x] 2.2 Add an iOS camera permission assistance tip in `ScanAddPage.tsx` explaining how to permanently allow camera access via Safari Website Settings.

## 3. Verification & Testing

- [x] 3.1 Update and run frontend test suite (`npm test -- --run` in `frontend/`) covering explicit camera opening, unobstructed viewfinder capture, and `GuidedCameraModal` integration.
- [x] 3.2 Run production build (`npm run build` in `frontend/`) and verify zero TypeScript, bundling, or SSR errors.

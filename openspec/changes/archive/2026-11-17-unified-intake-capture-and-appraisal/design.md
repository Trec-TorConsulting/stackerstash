# Design

## Context

See `proposal.md` for motivation and `specs/` for behavioral requirements. Currently, `frontend/src/pages/ScanAddPage.tsx` uses a plain `<input type="file" capture="environment">` and calls `identify_images` (`backend/apps/vision/services.py`), `backend/apps/catalog/image_processing.py` provides `process_item_image` (floodfill background removal + tight crop + detail enhancement), and `backend/apps/catalog/importer.py` handles CSV imports. None of these paths currently enforce guided capture, image authenticity/quality verification, or automatic post-intake appraisal.

## Goals / Non-Goals

**Goals:**
- Deliver a smooth CoinSnap-style live camera experience in the PWA without adding multi-megabyte client ML dependencies.
- Catch "pic-of-a-pic" / screen photos, severe blur, and edited/synthetic uploads via a fast heuristic + AI verification gate, with transparent warn-and-override UX.
- Converge Camera, Upload, and CSV Import into one uniform post-intake pipeline (title normalization + background `AppraisalJob`).

**Non-Goals:**
- Training custom on-device CNNs for coin detection (canvas edge/sharpness/luminance heuristics + guided reticle + AI vision cover this cleanly).
- Hard-blocking legitimate vintage/auction uploads when the user explicitly chooses to override a warning.

## Decisions

### 1. Client-Side Live Frame Guidance (`GuidedCameraModal.tsx`)
- **Choice**: Use native `navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } })` with an adaptive SVG reticle (circle for `COIN`/`ROUND`, rounded rectangle for `PAPER`/`SLAB`/`BAR`). Run a lightweight 300ms interval on a downscaled offscreen `<canvas>` (160x160) to compute:
  - **Exposure**: Mean luminance (warn if < 45 too dark or > 230 blown out).
  - **Sharpness**: Sobel/gradient variance inside the reticle (warn if below threshold).
  - **Zoom**: Use `MediaStreamTrack` hardware `zoom` capability when supported, falling back to CSS/canvas crop zoom (1x–3x).
- **Rationale**: Zero external dependencies, <1ms per frame, works on iOS Safari and Android Chrome PWAs, and falls back gracefully to `<input type="file" capture="environment">` if camera permissions are denied.

### 2. Two-Tier Image Authenticity & Quality Gate
- **Choice**:
  - **Tier 1 — Fast Python Heuristics (`backend/apps/catalog/image_processing.py`)**:
    - `analyze_image_quality_and_forensics(image_bytes, mode="camera"|"upload")`:
      - Minimum dimension check (< 400px -> `LOW_RESOLUTION` warning).
      - Sharpness variance check (`BLURRY` warning).
      - Exposure check (`UNDEREXPOSED` / `OVEREXPOSED` warning).
      - Upload-only deeper checks: EXIF `Software` / `ImageDescription` inspection for screenshot/editor/AI tags (`SCREENSHOT_OR_EDITED`), aspect-ratio/status-bar heuristic for phone screenshots, and high-frequency periodic FFT/grid energy check for screen moiré (`PIC_OF_PIC`).
  - **Tier 2 — AI Vision Authenticity Check (`backend/apps/vision/services.py`)**:
    - Extend `IDENTIFICATION_PROMPT` (and a lightweight `verify_images` check) to return `authenticity`: `{ "is_physical_item": bool, "is_pic_of_pic": bool, "is_synthetic_or_edited": bool, "front_back_consistent": bool, "warnings": [str] }`.
  - **Outcome**: Combine Tier 1 + Tier 2 into `verification_status` (`VERIFIED` | `FLAGGED`), returning warnings to `ScanAddPage` so the user can either retake/re-upload or click **Proceed Anyway** (which persists `photo_verification_status = "OVERRIDDEN"`).
- **Rationale**: Combines deterministic pixel/EXIF checks (which work even without AI keys) with semantic AI vision checks (which catch subtle monitor bezels, printed photos, or mismatched Front/Back coins).

### 3. Data Model Extensions (`CollectionItem` & `ItemPhoto`)
- **Choice**:
  - Add `intake_source` (`CAMERA`, `UPLOAD`, `CSV`, `MANUAL`) and `photo_verification_status` (`VERIFIED`, `FLAGGED`, `OVERRIDDEN`, `NONE`) + `photo_verification_notes` (`JSONField`) to `CollectionItem`.
  - Add `verification_status` and `verification_notes` (`JSONField`) to `ItemPhoto`.
- **Rationale**: Keeps verification provenance auditable per photo and surfaced cleanly as a badge on `ItemDetailPage.tsx`.

### 4. Unified Post-Intake Orchestration & Throttled CSV Appraisal
- **Choice**:
  - Add `auto_appraise: bool = True` (default `True` for `CAMERA`, `UPLOAD`, `CSV`) in item creation & CSV confirm flows:
    - Normalize title via `_clean_item_title` immediately at save time.
    - For single-item creation (`CAMERA` / `UPLOAD`), call `start_appraisal_job(item, workspace)` and return `appraisal_job_id` on `ItemOut` (or creation response) so `ItemDetailPage` immediately polls `AppraisalProgressBanner`.
    - For CSV/Bulk Import (`importer.py`), spawn a single daemon batch thread with `ThreadPoolExecutor(max_workers=2)` that processes the imported items sequentially/throttled so SQLite write locks and external API rate limits are respected.
- **Rationale**: Guarantees 100% uniformity across Camera, Upload, and CSV imports without overwhelming local SQLite or external APIs during bulk imports.

## Risks / Trade-offs

- **False Positives on Vintage / Auction Photos** → Warn-and-flag with explicit user override (`OVERRIDDEN`) ensures legitimate photos are never blocked.
- **iOS Safari `getUserMedia` Constraints** → Always provide graceful fallback to `<input type="file" capture="environment">` if `mediaDevices` or permissions fail.
- **Bulk CSV Rate Limits** → Throttling CSV background appraisals to `max_workers=2` prevents rate-limit spikes on Gemini/Numista/eBay.


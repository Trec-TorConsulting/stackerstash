# Proposal: Vision Providers and Photo Quality Gate Tuning

## Why
Collectors capturing or uploading item photos in `ScanAddPage` encountered two blocking issues:
1. When upstream Gemini hits rate limits / quota exhaustion (`HTTP 429`), all backup vision AI providers failed:
   - Groq vision failed with HTTP 404 because of an obsolete/non-existent model slug (`meta-llama/llama-4-scout-17b-16e-instruct`).
   - OpenRouter failed with HTTP 404 because the free tier slug `qwen/qwen2.5-vl-72b-instruct:free` was relocated upstream to paid `qwen/qwen2.5-vl-72b-instruct`.
   - Local Ollama failed with an SSRF validation rejection (`Blocked internal or metadata host for OLLAMA_URL: ollama.ollama.svc.cluster.local`) because internal cluster suffix checks unconditionally overrode the allowlist.
2. In-frame photo captures triggered false-positive "Photo Authenticity / Quality Warning" banners with:
   - *"Subject appears clipped near frame edges — reframe with a small border."*
   The background edge-clipping heuristic flagged any photo where outer 3-pixel strips exceeded standard deviation 22.0, which naturally occurs on woodgrain tables, fabric, paper, and lighting gradients, even when the collectible was safely centered inside the viewfinder.

## What Changes
- **Vision Provider Cascade Resilience**:
  - Update Groq vision configuration to active models: `llama-3.2-11b-vision-preview` and `llama-3.2-90b-vision-preview`, automatically cascading on 404/429.
  - Update OpenRouter vision configuration to cascade across `qwen/qwen2.5-vl-72b-instruct`, `qwen/qwen2.5-vl-72b-instruct:free`, and `openrouter/free`.
  - Fix Ollama SSRF validation in `backend/apps/accounts/models.py` to honor `OLLAMA_ALLOWED_HOSTS` before cluster suffix checks, and include `ollama.ollama.svc.cluster.local` in default allowed hosts so Kubernetes cluster deployments work out of the box.
- **Photo Quality & Edge Clipping Refinement**:
  - Update `analyze_image_quality_and_forensics` to check whether the detected subject bounding box (`detect_subject_crop_box`) is safely inside the frame with border clearance ($>1.5\%$ margin).
  - If the subject is safely centered within the frame, zero the `clipped_edges` count so natural table grain/gradients never trigger false quality warnings.

## Capabilities

### Modified Capabilities
- `vision-identification`: Support resilient multi-model fallback cascades for Groq and OpenRouter, and permit allowlisted Kubernetes cluster endpoints for Ollama.
- `image-authenticity-and-quality-gate`: Prevent false-positive edge-clipping warnings when a subject is verified within frame borders.

## Impact
- **Affected code**: `backend/apps/vision/services.py`, `backend/apps/accounts/models.py`, `backend/apps/catalog/image_processing.py`, `backend/config/settings.py`, `frontend/src/pages/SettingsPage.tsx`.
- **User experience**: Fluid AI identification even when Gemini quota is exhausted, with functional Groq, OpenRouter, and Ollama fallbacks, and no false-positive photo authenticity warnings for centered items.

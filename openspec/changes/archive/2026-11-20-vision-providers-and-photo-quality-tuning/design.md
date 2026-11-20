# Design: Vision Providers & Photo Quality Gate Tuning

## Overview
This design resolves vision provider cascade failures when Gemini is rate-limited and tunes the edge-clipping image quality heuristics to eliminate false-positive warnings.

## Architecture

```
User Photo -> analyze_image_quality_and_forensics (Subject bounds clearance check)
           -> identify_images -> Gemini Vision (2.5-flash -> 2.5-flash-lite)
                              -> Groq Vision (llama-3.2-11b-vision-preview -> 90b)
                              -> OpenRouter Vision (qwen2.5-vl-72b -> :free -> openrouter/free)
                              -> Ollama Vision (cluster allowed hosts check)
```

## Details

### 1. Vision Provider Model Configurations
- **Groq**: Replace non-existent `meta-llama/llama-4-scout-17b-16e-instruct` with active `GROQ_VISION_MODELS = ("llama-3.2-11b-vision-preview", "llama-3.2-90b-vision-preview")`.
- **OpenRouter**: Set `OPENROUTER_VISION_MODELS = ("qwen/qwen2.5-vl-72b-instruct", "qwen/qwen2.5-vl-72b-instruct:free", "openrouter/free")`.
- **Cascade**: In both `identify_images` and `_attempt_ai_appraisal`, loop through model candidates on 404/429 errors before logging failure.

### 2. Ollama SSRF Allowlist Precedence
- In `backend/apps/accounts/models.py`, check `hostname in allowed_hosts` before checking `_BLOCKED_OLLAMA_HOST_SUFFIXES`.
- In `backend/config/settings.py`, include `ollama.ollama.svc.cluster.local` in `OLLAMA_ALLOWED_HOSTS` defaults.
- Always retain strict blocking for metadata IPs (`169.254.169.254`, `100.100.100.200`, `metadata.google.internal`).

### 3. Subject Bounds Clearance Check
- In `analyze_image_quality_and_forensics`, invoke `detect_subject_crop_box(img)`.
- If bounding box has $>1.5\%$ clearance from all image edges, set `is_safely_inside = True` and `metrics["clipped_edges"] = 0`.

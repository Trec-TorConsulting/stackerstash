# Tasks: Vision Providers & Photo Quality Gate Tuning

## 1. Vision Provider Fallback Fixes
- [x] 1.1 Update Groq vision models to `llama-3.2-11b-vision-preview` and `llama-3.2-90b-vision-preview` with model cascade in `backend/apps/vision/services.py`.
- [x] 1.2 Update OpenRouter vision models to `qwen/qwen2.5-vl-72b-instruct`, `:free`, and `openrouter/free` in `backend/apps/vision/services.py`.
- [x] 1.3 Fix Ollama SSRF URL validation to prioritize `allowed_hosts` before cluster suffix checks in `backend/apps/accounts/models.py`.
- [x] 1.4 Add `ollama.ollama.svc.cluster.local` to `OLLAMA_ALLOWED_HOSTS` in `backend/config/settings.py` and update hint in `frontend/src/pages/SettingsPage.tsx`.

## 2. Image Quality Gate Sensitivity Tuning
- [x] 2.1 Add subject bounding box clearance check in `backend/apps/catalog/image_processing.py` to prevent false clipped-edges warnings.
- [x] 2.2 Add unit test in `backend/tests/test_image_verification.py` verifying centered subject on textured background does not trigger clipping warnings.
- [x] 2.3 Verify OWASP SSRF test in `backend/tests/test_security_owasp.py` passes for allowlisted cluster hosts.

from __future__ import annotations

import base64
import io
import json
import logging
import re
import time
from decimal import Decimal
from typing import Any

import httpx
from django.core.cache import cache
from PIL import Image, ImageOps

from apps.accounts.models import ProviderCredential, Workspace
from apps.catalog.models import CollectionItem

from .models import IdentificationJob
from .ocr import extract_text_from_images, parse_ocr_numismatic_hints

logger = logging.getLogger(__name__)

GEMINI_VISION_MODELS: tuple[str, ...] = (
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
)
GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
GROQ_TEXT_MODEL = "llama-3.3-70b-versatile"
OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_VISION_MODEL = "qwen/qwen2.5-vl-72b-instruct:free"
OPENROUTER_TEXT_MODEL = "meta-llama/llama-3.3-70b-instruct:free"

IDENTIFICATION_PROMPT = """You are an expert numismatist, paper-currency specialist, and precious-metals bullion authenticator.
Analyze the provided image(s) of a collectible or bullion item (which may be a coin, paper banknote, bar/ingot such as Geiger or 1kg copper, round, coin flip, or PCGS/NGC/PMG/CACG/ANACS graded slab).

Return ONLY valid JSON with these exact keys:
{
  "category": "COIN|PAPER|BAR|ROUND|SLAB|FLIPPER|OTHER",
  "title": "concise descriptive title",
  "country": "",
  "year": "",
  "mint_or_refiner": "",
  "denomination": "",
  "series": "",
  "metal_type": "NONE|GOLD|SILVER|PLATINUM|PALLADIUM|COPPER",
  "weight_value": 0,
  "weight_unit": "OZ_T|G|KG|OZ_AVDP",
  "purity": 0.999,
  "grading_service": "NONE|PCGS|NGC|PMG|PCGS_BANKNOTE|CACG|ANACS|ICG|OTHER",
  "cert_number": "",
  "grade": "",
  "slab_designation": "",
  "estimated_grade": "",
  "serial_number": "",
  "estimated_value_usd": 0,
  "ai_confidence": 0.0,
  "notes": "",
  "authenticity": {
    "is_physical_item": true,
    "is_pic_of_pic": false,
    "is_synthetic_or_edited": false,
    "front_back_consistent": true,
    "warnings": []
  }
}

Strict rules:
- NEVER invent or guess a cert_number or serial_number. Only populate them if clearly legible in the image or barcode hint.
- Check carefully whether the image shows a real physical item vs. a photo of a screen/monitor, a printed photo, a screenshot, or a synthetic/edited image. Set authenticity flags and add concise warnings if suspicious.
- If the item is encapsulated in a third-party grading slab (PCGS, NGC, PMG, PCGS Banknote, CACG, ANACS, ICG, etc.), set "category" to "SLAB", populate "grading_service", "grade", "cert_number" (the slab certification/registry number), and "slab_designation" (e.g., First Strike, Early Releases, DCAM, UCAM, PL, DMPL, EPQ, PPQ, Star, CAC, Pedigree).
- For paper currency (including slabbed banknotes) or serialized bars, put the note/bar serial number in "serial_number" (separate from the slab "cert_number").
- Put certified slab grades in "grade" ONLY if it is a third-party slab; put raw/unverified condition estimates in "estimated_grade".
- Set "ai_confidence" between 0.0 and 1.0.
"""


def _get_secret(workspace: Workspace, provider: str) -> str:
    cred = ProviderCredential.objects.filter(workspace=workspace, provider=provider).first()
    return cred.get_secret() if cred else ""


def _extract_json_block(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1:
        cleaned = cleaned[start : end + 1]
    return json.loads(cleaned)


def _normalize_candidate(raw: dict[str, Any], barcode_hint: str | None = None) -> dict[str, Any]:
    candidate = {
        "category": raw.get("category") or "COIN",
        "title": raw.get("title") or "",
        "country": raw.get("country") or "",
        "year": str(raw.get("year") or ""),
        "mint_or_refiner": raw.get("mint_or_refiner") or "",
        "denomination": raw.get("denomination") or "",
        "series": raw.get("series") or "",
        "metal_type": raw.get("metal_type") or "NONE",
        "weight_value": raw.get("weight_value") or 0,
        "weight_unit": raw.get("weight_unit") or "OZ_T",
        "purity": raw.get("purity") if raw.get("purity") is not None else 0.999,
        "grading_service": raw.get("grading_service") or "NONE",
        "cert_number": raw.get("cert_number") or (barcode_hint or ""),
        "grade": raw.get("grade") or "",
        "slab_designation": raw.get("slab_designation") or "",
        "estimated_grade": raw.get("estimated_grade") or "",
        "serial_number": raw.get("serial_number") or "",
        "estimated_value_usd": raw.get("estimated_value_usd") or 0,
        "ai_confidence": float(raw.get("ai_confidence") or 0.0),
        "notes": raw.get("notes") or "",
    }
    return candidate


def _sanitize_error_message(message: str) -> str:
    """Redact API keys and bearer tokens before logging or returning error diagnostics."""
    cleaned = re.sub(r"([?&]key=)[^&\s]+", r"\1***", str(message))
    return re.sub(r"(Bearer\s+)[^\s\"']+", r"\1***", cleaned, flags=re.IGNORECASE)


def _is_retryable_quota_error(exc: Exception) -> bool:
    """Return True if an exception represents an HTTP 429/503 quota or transient rate-limit error."""
    if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code in {429, 503}:
        return True
    cause = getattr(exc, "__cause__", None)
    if isinstance(cause, httpx.HTTPStatusError) and cause.response.status_code in {429, 503}:
        return True
    msg = str(exc)
    return "HTTP 429:" in msg or "HTTP 503:" in msg or "429 Too Many Requests" in msg


def _infer_image_mime(img_bytes: bytes, declared_mime: str | None) -> str:
    mime = (declared_mime or "").strip().lower()
    if mime and mime != "application/octet-stream":
        return mime
    if img_bytes.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if img_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(img_bytes) >= 12 and img_bytes[:4] == b"RIFF" and img_bytes[8:12] == b"WEBP":
        return "image/webp"
    if len(img_bytes) >= 12 and img_bytes[4:8] == b"ftyp":
        brand = img_bytes[8:12]
        if brand in {b"heic", b"heix", b"hevc", b"hevx", b"mif1"}:
            return "image/heic"
        if brand in {b"heif", b"msf1"}:
            return "image/heif"
    return "image/jpeg"


def _prepare_images_for_vision(
    images: list[tuple[bytes, str]], max_dimension: int = 1024
) -> list[tuple[bytes, str]]:
    """
    Normalize orientation, downscale large mobile/camera photos, and re-encode as JPEG
    so both Gemini and Ollama receive compact, standard image payloads.
    """
    prepared: list[tuple[bytes, str]] = []
    for img_bytes, mime_type in images:
        try:
            with Image.open(io.BytesIO(img_bytes)) as opened:
                img = ImageOps.exif_transpose(opened)
                if max(img.size) > max_dimension:
                    img.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
                if img.mode in {"RGBA", "LA", "P"}:
                    rgba = img.convert("RGBA")
                    bg = Image.new("RGB", rgba.size, (255, 255, 255))
                    bg.paste(rgba, mask=rgba.split()[-1])
                    rgb = bg
                elif img.mode != "RGB":
                    rgb = img.convert("RGB")
                else:
                    rgb = img
                out = io.BytesIO()
                rgb.save(out, format="JPEG", quality=88, optimize=True)
                prepared.append((out.getvalue(), "image/jpeg"))
        except Exception:
            prepared.append((img_bytes, _infer_image_mime(img_bytes, mime_type)))
    return prepared


def _extract_gemini_text(data: dict[str, Any]) -> str:
    candidates = data.get("candidates") or []
    if not candidates:
        block_reason = (data.get("promptFeedback") or {}).get("blockReason")
        raise ValueError(f"Gemini returned no candidates (blockReason={block_reason or 'unknown'})")
    parts = ((candidates[0].get("content") or {}).get("parts")) or []
    for part in parts:
        if not part.get("thought") and isinstance(part.get("text"), str) and part["text"].strip():
            return part["text"]
    for part in reversed(parts):
        if isinstance(part.get("text"), str) and part["text"].strip():
            return part["text"]
    finish_reason = candidates[0].get("finishReason")
    raise ValueError(f"Gemini candidate contained no text (finishReason={finish_reason or 'unknown'})")


def _call_gemini_vision_model(
    images: list[tuple[bytes, str]],
    api_key: str,
    prompt: str,
    model_name: str,
    timeout: float = 45.0,
) -> dict[str, Any]:
    parts: list[dict[str, Any]] = [{"text": prompt}]
    for img_bytes, mime_type in images:
        parts.append(
            {
                "inline_data": {
                    "mime_type": mime_type or "image/jpeg",
                    "data": base64.b64encode(img_bytes).decode("ascii"),
                }
            }
        )
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model_name}:generateContent?key={api_key}"
    )
    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.1,
            "maxOutputTokens": 768,
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    with httpx.Client(timeout=timeout) as client:
        resp = client.post(url, json=payload)
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = _sanitize_error_message(exc.response.text[:300])
            raise RuntimeError(f"HTTP {exc.response.status_code}: {detail}") from exc
        data = resp.json()
    text = _extract_gemini_text(data)
    return {"parsed": _extract_json_block(text), "raw": data}


def _call_gemini_vision(
    images: list[tuple[bytes, str]],
    api_key: str,
    prompt: str,
    timeout: float = 45.0,
    models: tuple[str, ...] = GEMINI_VISION_MODELS,
) -> dict[str, Any]:
    """Call Gemini Vision, cascading through fallback models on HTTP 429/503 quota errors."""
    last_exc: Exception | None = None
    for idx, model_name in enumerate(models):
        try:
            return _call_gemini_vision_model(images, api_key, prompt, model_name, timeout=timeout)
        except Exception as exc:
            last_exc = exc
            if _is_retryable_quota_error(exc) and idx < len(models) - 1:
                logger.warning(
                    "Gemini model %s hit quota/rate-limit, cascading to next model: %s",
                    model_name,
                    _sanitize_error_message(str(exc)),
                )
                continue
            raise
    if last_exc is not None:
        raise last_exc
    raise RuntimeError("No Gemini vision models configured")


def _call_openai_compat_chat(
    endpoint: str,
    api_key: str,
    model_name: str,
    prompt: str,
    images: list[tuple[bytes, str]] | None = None,
    extra_headers: dict[str, str] | None = None,
    timeout: float = 45.0,
) -> dict[str, Any]:
    """Call an OpenAI-compatible chat/completions endpoint (Groq or OpenRouter) for vision or text."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)

    if images:
        content: Any = [{"type": "text", "text": prompt}]
        for img_bytes, mime_type in images:
            b64 = base64.b64encode(img_bytes).decode("ascii")
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime_type or 'image/jpeg'};base64,{b64}"},
                }
            )
    else:
        content = prompt

    payload: dict[str, Any] = {
        "model": model_name,
        "messages": [{"role": "user", "content": content}],
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
    }
    with httpx.Client(timeout=timeout) as client:
        resp = client.post(endpoint, headers=headers, json=payload)
        if resp.status_code == 400 and "response_format" in resp.text:
            payload.pop("response_format", None)
            resp = client.post(endpoint, headers=headers, json=payload)
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = _sanitize_error_message(exc.response.text[:300])
            raise RuntimeError(f"HTTP {exc.response.status_code}: {detail}") from exc
        data = resp.json()
    text = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
    if not str(text).strip():
        raise ValueError("Provider returned empty completion text")
    return {"parsed": _extract_json_block(str(text)), "raw": data}


_GEMINI_COOLDOWN_SECONDS = 120


def _gemini_cooldown_key(workspace: Workspace) -> str:
    return f"vision:gemini_quota_cooldown:{workspace.id}"


def _is_gemini_in_cooldown(workspace: Workspace) -> bool:
    return bool(cache.get(_gemini_cooldown_key(workspace)))


def _mark_gemini_cooldown(workspace: Workspace, ttl: int = _GEMINI_COOLDOWN_SECONDS) -> None:
    cache.set(_gemini_cooldown_key(workspace), True, timeout=ttl)


def _is_quota_error(msg: str) -> bool:
    """Return True when an upstream provider error indicates HTTP 429 or quota exhaustion."""
    lower = (msg or "").lower()
    return "429" in lower or "quota" in lower or "rate limit" in lower or "too many requests" in lower


def _parse_ollama_response(raw_body: str) -> tuple[str, Any]:
    """Parse an Ollama /api/chat response from either JSON or NDJSON chunks."""
    stripped = (raw_body or "").strip()
    if not stripped:
        raise ValueError("Ollama returned empty response body")

    try:
        data = json.loads(stripped)
        if isinstance(data, dict):
            msg = data.get("message") or {}
            text = msg.get("content") or data.get("response") or msg.get("thinking") or ""
            if not str(text).strip():
                raise ValueError("Ollama returned empty completion text")
            return str(text), data
    except json.JSONDecodeError:
        pass

    chunks: list[dict[str, Any]] = []
    parts: list[str] = []
    thinking_parts: list[str] = []
    for line in stripped.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            chunks = []
            break
        if isinstance(obj, dict):
            chunks.append(obj)
            msg = obj.get("message") or {}
            chunk_text = msg.get("content") or obj.get("response") or ""
            if chunk_text:
                parts.append(str(chunk_text))
            elif msg.get("thinking"):
                thinking_parts.append(str(msg["thinking"]))

    if chunks:
        joined = "".join(parts) or "".join(thinking_parts)
        if not joined.strip():
            raise ValueError("Ollama returned empty completion text")
        return joined, {"chunks": chunks}

    raise ValueError(f"Ollama returned non-JSON response: {stripped[:200]}")


def _post_ollama_chat(
    ollama_url: str,
    model_name: str,
    messages: list[dict[str, Any]],
    timeout: float = 45.0,
) -> tuple[dict[str, Any], Any]:
    """Call Ollama /api/chat with thinking disabled and JSON output enforced."""
    endpoint = f"{ollama_url.rstrip('/')}/api/chat"
    payload: dict[str, Any] = {
        "model": model_name,
        "stream": False,
        "think": False,
        "format": "json",
        "options": {"temperature": 0.1, "num_predict": 512},
        "messages": messages,
    }
    with httpx.Client(timeout=timeout) as client:
        resp = client.post(endpoint, json=payload)
        if resp.status_code == 400 and "think" in resp.text.lower():
            payload.pop("think", None)
            resp = client.post(endpoint, json=payload)
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise RuntimeError(f"HTTP {exc.response.status_code}: {exc.response.text[:300]}") from exc
        raw_body = resp.text
    text, data = _parse_ollama_response(raw_body)
    return _extract_json_block(text), data


def _call_ollama_vision(
    images: list[tuple[bytes, str]],
    ollama_url: str,
    model_name: str,
    prompt: str,
    timeout: float = 45.0,
) -> dict[str, Any]:
    message: dict[str, Any] = {"role": "user", "content": prompt}
    if images:
        message["images"] = [base64.b64encode(b).decode("ascii") for b, _ in images]
    parsed, data = _post_ollama_chat(
        ollama_url,
        model_name or "llama3.2-vision",
        [message],
        timeout=timeout,
    )
    return {"parsed": parsed, "raw": data}


def _run_image_verification(
    images: list[tuple[bytes, str]],
    parsed: dict[str, Any] | None,
    intake_mode: str,
) -> tuple[str, list[str]]:
    from apps.catalog.image_processing import analyze_image_quality_and_forensics

    warnings: list[str] = []
    for idx, (img_bytes, _) in enumerate(images):
        res = analyze_image_quality_and_forensics(img_bytes, mode=intake_mode)
        for w in res["warnings"]:
            prefix = f"Photo {idx + 1}: " if len(images) > 1 else ""
            warnings.append(f"{prefix}{w}")

    auth = (parsed or {}).get("authenticity") or {}
    if isinstance(auth, dict):
        if auth.get("is_pic_of_pic") or auth.get("is_physical_item") is False:
            warnings.append("AI detected a possible photo of a screen/print rather than a physical item.")
        if auth.get("is_synthetic_or_edited"):
            warnings.append("AI detected signs of heavy editing or synthetic generation.")
        if len(images) >= 2 and auth.get("front_back_consistent") is False:
            warnings.append("Front and back images may not belong to the same coin or note.")
        for w in auth.get("warnings") or []:
            ws = str(w).strip()
            if ws and ws not in warnings:
                warnings.append(ws)

    status = "FLAGGED" if warnings else "VERIFIED"
    return status, warnings


def _enrich_candidate_from_catalog(
    candidate: dict[str, Any], workspace: Workspace
) -> dict[str, Any]:
    """Enrich an OCR-derived candidate using PCGS cert or Numista catalog APIs when configured."""
    from apps.valuation.providers import lookup_numista_specs, lookup_pcgs_cert

    pcgs_token = _get_secret(workspace, ProviderCredential.Provider.PCGS)
    if candidate.get("grading_service") == "PCGS" and candidate.get("cert_number") and pcgs_token:
        pcgs_res = lookup_pcgs_cert(candidate["cert_number"], pcgs_token)
        if pcgs_res and pcgs_res.get("market_value") and not candidate.get("estimated_value_usd"):
            candidate["estimated_value_usd"] = float(pcgs_res["market_value"])

    numista_key = _get_secret(workspace, ProviderCredential.Provider.NUMISTA_KEY)
    if candidate.get("title") and numista_key:
        numista_res = lookup_numista_specs(
            candidate["title"],
            year=str(candidate.get("year") or ""),
            country=str(candidate.get("country") or ""),
            denomination=str(candidate.get("denomination") or ""),
            api_key=numista_key,
        )
        if numista_res:
            specs = numista_res.get("specs") or {}
            if specs.get("gross_weight_grams") and not candidate.get("weight_value"):
                candidate["weight_value"] = float(specs["gross_weight_grams"])
                candidate["weight_unit"] = "G"
    return candidate


def _attempt_ocr_fallback(
    *,
    workspace: Workspace,
    images: list[tuple[bytes, str]],
    vision_images: list[tuple[bytes, str]],
    barcode_hint: str | None,
    intake_mode: str,
    gemini_key: str,
    groq_key: str,
    openrouter_key: str,
    ollama_url: str,
    ollama_model: str,
    provider_errors: list[str],
    skip_ollama_text: bool = False,
    skip_gemini: bool = False,
    deadline: float | None = None,
) -> dict[str, Any] | None:
    """Run local OCR, optional text-only LLM structuring, and deterministic catalog enrichment."""
    if deadline is not None and deadline - time.monotonic() < 12.0:
        return None
    ocr_text = extract_text_from_images(vision_images)
    if not ocr_text.strip():
        return None
    hints = parse_ocr_numismatic_hints(ocr_text, barcode_hint=barcode_hint)
    if not hints.get("has_usable_hints"):
        return None

    ocr_prompt = (
        f"{IDENTIFICATION_PROMPT}\n"
        "No image is attached. Parse the following OCR-extracted text from the item into the JSON schema above.\n"
        f"OCR Text:\n{ocr_text}\n"
    )
    if barcode_hint:
        ocr_prompt += f"Detected slab barcode/QR hint: {barcode_hint}\n"

    parsed_res: dict[str, Any] | None = None
    provider_used = "OCR_CATALOG"

    def _text_timeout() -> float:
        if deadline is None:
            return 10.0
        return min(10.0, max(2.0, deadline - time.monotonic()))

    # Try text-only LLM structuring (zero image tokens)
    text_attempts: list[tuple[str, Any]] = []
    if groq_key:
        text_attempts.append(
            (
                "Groq-Text",
                lambda: _call_openai_compat_chat(
                    GROQ_CHAT_URL,
                    groq_key,
                    GROQ_TEXT_MODEL,
                    ocr_prompt,
                    images=None,
                    timeout=_text_timeout(),
                ),
            )
        )
    if openrouter_key:
        text_attempts.append(
            (
                "OpenRouter-Text",
                lambda: _call_openai_compat_chat(
                    OPENROUTER_CHAT_URL,
                    openrouter_key,
                    OPENROUTER_TEXT_MODEL,
                    ocr_prompt,
                    images=None,
                    extra_headers={
                        "HTTP-Referer": "https://stackerstash.com",
                        "X-Title": "Stackers Stash",
                    },
                    timeout=_text_timeout(),
                ),
            )
        )
    if gemini_key and not skip_gemini:
        text_attempts.append(
            (
                "Gemini-Text",
                lambda: _call_gemini_vision_model(
                    [], gemini_key, ocr_prompt, "gemini-2.5-flash-lite", timeout=_text_timeout()
                ),
            )
        )
    if ollama_url and not skip_ollama_text:
        text_attempts.append(
            (
                "Ollama-Text",
                lambda: _call_ollama_vision(
                    [], ollama_url, ollama_model, ocr_prompt, timeout=_text_timeout()
                ),
            )
        )

    for label, fn in text_attempts:
        if deadline is not None and deadline - time.monotonic() < 5.0:
            break
        try:
            parsed_res = fn()
            provider_used = "OCR_TEXT"
            break
        except Exception as exc:
            logger.debug("OCR text-only LLM (%s) failed: %s", label, _sanitize_error_message(str(exc)))

    raw_parsed = parsed_res["parsed"] if parsed_res else hints
    candidate = _normalize_candidate(raw_parsed, barcode_hint)
    candidate = _enrich_candidate_from_catalog(candidate, workspace)

    job = IdentificationJob.objects.create(
        workspace=workspace,
        status=IdentificationJob.Status.SUCCEEDED,
        provider_used=provider_used,
        parsed_candidate=candidate,
        raw_response=(parsed_res.get("raw") if parsed_res else {"ocr_text": ocr_text}) or {},
    )
    verification_status, verification_warnings = _run_image_verification(
        images, raw_parsed, intake_mode
    )
    err_summary = f" ({'; '.join(provider_errors)})" if provider_errors else ""
    warning = f"Vision AI unavailable{err_summary}; pre-filled using local OCR fallback ({provider_used})."
    return {
        "job_id": str(job.id),
        "provider_used": provider_used,
        "candidate": candidate,
        "warning": warning,
        "provider_errors": provider_errors,
        "verification_status": verification_status,
        "verification_warnings": verification_warnings,
        "quota_deferred": any(_is_quota_error(e) for e in provider_errors),
    }


def _merge_ocr_hints_into_parsed(
    parsed: dict[str, Any], ocr_hints: dict[str, Any]
) -> dict[str, Any]:
    """Fill missing fields in a vision provider's parsed dict using local OCR hints."""
    merged = dict(parsed)
    for field in (
        "year",
        "serial_number",
        "denomination",
        "country",
        "series",
        "mint_or_refiner",
        "cert_number",
        "grade",
    ):
        if not str(merged.get(field) or "").strip() and str(ocr_hints.get(field) or "").strip():
            merged[field] = ocr_hints[field]
    if (not merged.get("grading_service") or merged.get("grading_service") == "NONE") and (
        ocr_hints.get("grading_service") and ocr_hints.get("grading_service") != "NONE"
    ):
        merged["grading_service"] = ocr_hints["grading_service"]
    if (not merged.get("metal_type") or merged.get("metal_type") == "NONE") and (
        ocr_hints.get("metal_type") and ocr_hints.get("metal_type") != "NONE"
    ):
        merged["metal_type"] = ocr_hints["metal_type"]
    if not merged.get("weight_value") and ocr_hints.get("weight_value"):
        merged["weight_value"] = ocr_hints["weight_value"]
        if not merged.get("weight_unit") and ocr_hints.get("weight_unit"):
            merged["weight_unit"] = ocr_hints["weight_unit"]
    return merged


def _record_vision_success(
    workspace: Workspace,
    provider_used: str,
    res: dict[str, Any],
    images: list[tuple[bytes, str]],
    barcode_hint: str | None,
    intake_mode: str,
    warning: str | None = None,
    quota_deferred: bool = False,
) -> dict[str, Any]:
    candidate = _normalize_candidate(res["parsed"], barcode_hint)
    job = IdentificationJob.objects.create(
        workspace=workspace,
        status=IdentificationJob.Status.SUCCEEDED,
        provider_used=provider_used,
        parsed_candidate=candidate,
        raw_response=res.get("raw") or {},
    )
    verification_status, verification_warnings = _run_image_verification(
        images, res["parsed"], intake_mode
    )
    return {
        "job_id": str(job.id),
        "provider_used": provider_used,
        "candidate": candidate,
        "warning": warning,
        "verification_status": verification_status,
        "verification_warnings": verification_warnings,
        "quota_deferred": quota_deferred,
    }


def identify_images(
    images: list[tuple[bytes, str]],
    workspace: Workspace,
    barcode_hint: str | None = None,
    intake_mode: str = "camera",
) -> dict[str, Any]:
    """Identify item metadata from images using Gemini cascade, Groq, OpenRouter, Ollama, or OCR/manual fallback."""
    prompt = IDENTIFICATION_PROMPT
    if barcode_hint:
        prompt += f"\nDetected slab barcode/QR hint: {barcode_hint}\n"

    gemini_key = _get_secret(workspace, ProviderCredential.Provider.GEMINI)
    groq_key = _get_secret(workspace, ProviderCredential.Provider.GROQ_API_KEY)
    openrouter_key = _get_secret(workspace, ProviderCredential.Provider.OPENROUTER_API_KEY)
    ollama_url = _get_secret(workspace, ProviderCredential.Provider.OLLAMA_URL)
    ollama_model = (
        _get_secret(workspace, ProviderCredential.Provider.OLLAMA_MODEL) or "llama3.2-vision"
    )

    vision_images = _prepare_images_for_vision(images)
    provider_errors: list[str] = []
    # Stay safely under Gunicorn's 60s worker timeout in production
    deadline = time.monotonic() + 40.0
    ollama_failed = False
    gemini_quota_hit = False

    if gemini_key:
        if _is_gemini_in_cooldown(workspace):
            gemini_quota_hit = True
            provider_errors.append("Gemini: Skipped (429 quota cooldown active)")
        else:
            try:
                remaining = deadline - time.monotonic()
                res = _call_gemini_vision(
                    vision_images,
                    gemini_key,
                    prompt,
                    timeout=min(25.0, max(5.0, remaining)),
                )
                return _record_vision_success(
                    workspace, "GEMINI", res, images, barcode_hint, intake_mode
                )
            except Exception as exc:
                err_msg = _sanitize_error_message(str(exc))
                gemini_quota_hit = _is_quota_error(err_msg)
                if gemini_quota_hit:
                    _mark_gemini_cooldown(workspace)
                logger.warning("Gemini vision failed, checking fallback providers: %s", err_msg)
                provider_errors.append(f"Gemini: {err_msg}")

    if groq_key:
        remaining = deadline - time.monotonic()
        if remaining >= 5.0:
            try:
                res = _call_openai_compat_chat(
                    GROQ_CHAT_URL,
                    groq_key,
                    GROQ_VISION_MODEL,
                    prompt,
                    images=vision_images,
                    timeout=min(25.0, remaining),
                )
                return _record_vision_success(
                    workspace, "GROQ", res, images, barcode_hint, intake_mode
                )
            except Exception as exc:
                err_msg = _sanitize_error_message(str(exc))
                logger.warning("Groq vision failed, checking next fallback: %s", err_msg)
                provider_errors.append(f"Groq: {err_msg}")

    if openrouter_key:
        remaining = deadline - time.monotonic()
        if remaining >= 5.0:
            try:
                res = _call_openai_compat_chat(
                    OPENROUTER_CHAT_URL,
                    openrouter_key,
                    OPENROUTER_VISION_MODEL,
                    prompt,
                    images=vision_images,
                    extra_headers={"HTTP-Referer": "https://stackerstash.com", "X-Title": "Stackers Stash"},
                    timeout=min(25.0, remaining),
                )
                return _record_vision_success(
                    workspace, "OPENROUTER", res, images, barcode_hint, intake_mode
                )
            except Exception as exc:
                err_msg = _sanitize_error_message(str(exc))
                logger.warning("OpenRouter vision failed, checking Ollama fallback: %s", err_msg)
                provider_errors.append(f"OpenRouter: {err_msg}")

    if ollama_url:
        remaining = deadline - time.monotonic()
        if remaining < 5.0:
            ollama_failed = True
            logger.warning("Skipping Ollama vision fallback: request time budget exhausted")
            provider_errors.append("Ollama: Skipped (request time budget exhausted)")
        else:
            try:
                ollama_images = _prepare_images_for_vision(images, max_dimension=768)
                res = _call_ollama_vision(
                    ollama_images,
                    ollama_url,
                    ollama_model,
                    prompt,
                    timeout=min(25.0, remaining),
                )
                if deadline - time.monotonic() >= 6.0:
                    try:
                        ocr_text = extract_text_from_images(ollama_images)
                        if ocr_text.strip():
                            ocr_hints = parse_ocr_numismatic_hints(
                                ocr_text, barcode_hint=barcode_hint
                            )
                            if ocr_hints.get("has_usable_hints"):
                                res["parsed"] = _merge_ocr_hints_into_parsed(
                                    res["parsed"], ocr_hints
                                )
                    except Exception as ocr_exc:
                        logger.debug("Post-Ollama OCR enrichment skipped: %s", ocr_exc)
                warn = (
                    "Gemini quota exceeded (429); identified basic details with Ollama + OCR and queued for full Gemini upgrade when quota returns."
                    if gemini_quota_hit
                    else None
                )
                return _record_vision_success(
                    workspace,
                    "OLLAMA",
                    res,
                    images,
                    barcode_hint,
                    intake_mode,
                    warning=warn,
                    quota_deferred=gemini_quota_hit,
                )
            except Exception as exc:
                ollama_failed = True
                err_msg = _sanitize_error_message(str(exc))
                logger.warning("Ollama vision failed: %s", err_msg)
                provider_errors.append(f"Ollama: {err_msg}")

    if deadline - time.monotonic() >= 12.0:
        ocr_result = _attempt_ocr_fallback(
            workspace=workspace,
            images=images,
            vision_images=vision_images,
            barcode_hint=barcode_hint,
            intake_mode=intake_mode,
            gemini_key=gemini_key,
            groq_key=groq_key,
            openrouter_key=openrouter_key,
            ollama_url=ollama_url,
            ollama_model=ollama_model,
            provider_errors=provider_errors,
            skip_ollama_text=ollama_failed or (deadline - time.monotonic() < 5.0),
            skip_gemini=gemini_quota_hit or _is_gemini_in_cooldown(workspace),
            deadline=deadline,
        )
        if ocr_result is not None:
            return ocr_result
    else:
        provider_errors.append("OCR fallback skipped: request deadline near Gunicorn timeout")

    fallback_candidate = _normalize_candidate({}, barcode_hint)
    combined_error = "; ".join(provider_errors)
    job = IdentificationJob.objects.create(
        workspace=workspace,
        status=IdentificationJob.Status.MANUAL_FALLBACK,
        provider_used="MANUAL",
        parsed_candidate=fallback_candidate,
        error_message=combined_error,
    )
    verification_status, verification_warnings = _run_image_verification(
        images, None, intake_mode
    )
    warning_msg = (
        f"No AI vision provider succeeded ({combined_error}). Complete item details manually or configure Gemini/Groq/OpenRouter/Ollama in Settings."
        if combined_error
        else "No AI vision provider succeeded. Complete item details manually or configure Gemini/Groq/OpenRouter/Ollama in Settings."
    )
    return {
        "job_id": str(job.id),
        "provider_used": "MANUAL",
        "candidate": fallback_candidate,
        "warning": warning_msg,
        "provider_errors": provider_errors,
        "verification_status": verification_status,
        "verification_warnings": verification_warnings,
        "quota_deferred": gemini_quota_hit,
    }


def _collect_item_photo_b64(
    item: CollectionItem, limit: int = 3, max_dimension: int = 1024
) -> list[tuple[str, str]]:
    """Return up to `limit` downscaled (mime_type, base64_data) tuples prioritizing OBVERSE, REVERSE, SLAB."""
    priority = {"OBVERSE": 0, "REVERSE": 1, "SLAB": 2, "DETAIL": 3, "OTHER": 4}
    photos = sorted(
        list(item.photos.all()),
        key=lambda p: (priority.get(p.label, 9), p.sort_order),
    )
    raw_images: list[tuple[bytes, str]] = []
    for photo in photos:
        if len(raw_images) >= limit:
            break
        try:
            with photo.image.open("rb") as f:
                raw = f.read()
            if not raw:
                continue
            name = (photo.image.name or "").lower()
            mime = "image/png" if name.endswith(".png") else "image/webp" if name.endswith(".webp") else "image/jpeg"
            raw_images.append((raw, mime))
        except Exception as exc:
            logger.debug("Skipping unreadable photo %s for item %s: %s", photo.id, item.id, exc)
    if not raw_images:
        return []
    prepared = _prepare_images_for_vision(raw_images, max_dimension=max_dimension)
    return [(mime, base64.b64encode(img_bytes).decode("ascii")) for img_bytes, mime in prepared]


def _normalize_ai_appraisal(
    parsed: dict[str, Any],
    photo_inspected: bool,
    is_raw_gradeable: bool = False,
    grounded_sources: list[dict[str, str]] | None = None,
) -> tuple[Decimal | None, dict[str, Any]]:
    raw_mid = parsed.get("mid_usd") or parsed.get("estimated_value_usd") or 0
    try:
        mid_val = Decimal(str(raw_mid)).quantize(Decimal("0.01"))
    except Exception:
        mid_val = Decimal("0.00")
    if mid_val <= Decimal("0.00"):
        return None, {}

    def _dec_or_none(val: Any) -> str | None:
        if val is None or val == "":
            return None
        try:
            d = Decimal(str(val)).quantize(Decimal("0.01"))
            return str(d) if d > 0 else None
        except Exception:
            return None

    low_str = _dec_or_none(parsed.get("low_usd"))
    high_str = _dec_or_none(parsed.get("high_usd"))
    drivers = [str(d).strip() for d in (parsed.get("valuation_drivers") or []) if str(d).strip()]
    if not photo_inspected:
        drivers.append("Surface condition was not visually inspected (text-only appraisal).")

    valid_tiers = {"BULLION", "SEMI_NUMISMATIC", "KEY_DATE_COLLECTIBLE", "NUMISMATIC"}
    tier = str(parsed.get("collectibility_tier") or "").upper()
    if tier not in valid_tiers:
        tier = "BULLION" if "bullion" in str(parsed).lower() else "SEMI_NUMISMATIC"

    upside_str: str | None = None
    if is_raw_gradeable and parsed.get("grading_upside_usd") not in (None, ""):
        try:
            upside_str = str(Decimal(str(parsed["grading_upside_usd"])).quantize(Decimal("0.01")))
        except Exception:
            upside_str = None

    normalized = {
        "low_usd": low_str or str((mid_val * Decimal("0.85")).quantize(Decimal("0.01"))),
        "mid_usd": str(mid_val),
        "high_usd": high_str or str((mid_val * Decimal("1.15")).quantize(Decimal("0.01"))),
        "valuation_drivers": drivers[:6],
        "collectibility_tier": tier,
        "hold_outlook": str(parsed.get("hold_outlook") or "").strip(),
        "inferred_specs": parsed.get("inferred_specs") if isinstance(parsed.get("inferred_specs"), dict) else {},
        "photo_inspected": photo_inspected,
        "grounded_sources": grounded_sources or [],
        "estimated_grade": str(parsed.get("estimated_grade") or "").strip()[:32] if is_raw_gradeable else "",
        "estimated_grade_range": str(parsed.get("estimated_grade_range") or "").strip()[:32] if is_raw_gradeable else "",
        "estimated_grade_rationale": str(parsed.get("estimated_grade_rationale") or "").strip() if is_raw_gradeable else "",
        "grading_upside_usd": upside_str,
        "normalized_title": str(parsed.get("normalized_title") or "").strip()[:200],
    }
    return mid_val, normalized


def _extract_gemini_grounded_sources(data: dict[str, Any]) -> list[dict[str, str]]:
    chunks = (
        data.get("candidates", [{}])[0]
        .get("groundingMetadata", {})
        .get("groundingChunks", [])
    )
    out: list[dict[str, str]] = []
    for chunk in chunks:
        web = chunk.get("web") or {}
        uri = str(web.get("uri") or "").strip()
        title = str(web.get("title") or "").strip()
        if uri:
            out.append({"title": title or uri, "uri": uri})
    return out[:5]


def estimate_item_value_with_ai(
    item: CollectionItem, workspace: Workspace
) -> tuple[Decimal | None, dict[str, Any]]:
    """Multimodal AI appraisal using item photos (when present), optional search grounding, and raw grade estimation."""
    gemini_key = _get_secret(workspace, ProviderCredential.Provider.GEMINI)
    groq_key = _get_secret(workspace, ProviderCredential.Provider.GROQ_API_KEY)
    openrouter_key = _get_secret(workspace, ProviderCredential.Provider.OPENROUTER_API_KEY)
    ollama_url = _get_secret(workspace, ProviderCredential.Provider.OLLAMA_URL)
    ollama_model = _get_secret(workspace, ProviderCredential.Provider.OLLAMA_MODEL) or "qwen2.5vl:7b"
    if not gemini_key and not groq_key and not openrouter_key and not ollama_url:
        return None, {}

    encoded_photos = _collect_item_photo_b64(item, limit=2, max_dimension=768)
    photo_inspected = len(encoded_photos) > 0
    is_raw_gradeable = (
        item.grading_service == CollectionItem.GradingService.NONE
        and item.category in {"COIN", "PAPER", "FLIPPER", "ROUND"}
    )
    grade_scale = "PMG 1-70 paper currency scale" if item.category == "PAPER" else "Sheldon 1-70 coin scale"
    raw_grade_schema = (
        f', "estimated_grade": "<{grade_scale}, e.g. AU55 or MS63>", '
        '"estimated_grade_range": "<e.g. AU50-AU58>", '
        '"estimated_grade_rationale": "<surface, luster, wear, strike notes>", '
        '"grading_upside_usd": <net USD gain/loss after ~$40 grading fees>'
        if is_raw_gradeable
        else ""
    )

    prompt = (
        "You are an expert numismatist and bullion appraiser. Analyze the item metadata"
        + (" and attached obverse/reverse/slab photos" if photo_inspected else " (no photos attached)")
        + " and return ONLY valid JSON with these exact keys:\n"
        '{"low_usd": <number>, "mid_usd": <number>, "high_usd": <number>, '
        '"normalized_title": "<clean uniform collector title, e.g. 1893-S Morgan Silver Dollar, no hype words>", '
        '"valuation_drivers": ["<reason 1>", "<reason 2>"], '
        '"collectibility_tier": "BULLION|SEMI_NUMISMATIC|KEY_DATE_COLLECTIBLE|NUMISMATIC", '
        '"hold_outlook": "<1-2 sentence hold vs liquidity thesis, including grading upside if raw>", '
        '"inferred_specs": {"mint_mark": "", "mintage": null, "variety": "", "composition": "", '
        '"gross_weight_grams": null, "diameter_mm": null, "thickness_mm": null, "edge_type": "", "designer": ""}'
        + raw_grade_schema
        + "}\n\n"
        f"Title: {item.title}\nCategory: {item.category}\nCountry: {item.country}\n"
        f"Year: {item.year}\nMint/Refiner: {item.mint_or_refiner}\nMint Mark: {item.mint_mark}\n"
        f"Denomination: {item.denomination}\nSeries: {item.series}\nVariety: {item.variety}\n"
        f"Grading: {item.grading_service} {item.grade} (Est: {item.estimated_grade})\n"
        f"Metal: {item.metal_type} {item.fine_troy_oz} fine ozt | Melt floor: ${item.melt_value_unit}\n"
    )

    deadline = time.monotonic() + 40.0
    gemini_quota_hit = False
    if gemini_key:
        if _is_gemini_in_cooldown(workspace):
            gemini_quota_hit = True
        else:
            parts: list[dict[str, Any]] = [{"text": prompt}]
            for mime, b64 in encoded_photos:
                parts.append({"inlineData": {"mimeType": mime, "data": b64}})

            for model_name in GEMINI_VISION_MODELS:
                if deadline - time.monotonic() < 4.0:
                    break
                url = (
                    "https://generativelanguage.googleapis.com/v1beta/models/"
                    f"{model_name}:generateContent?key={gemini_key}"
                )
                quota_exhausted = False
                # Ground only on primary flash model to conserve quota/tokens on lite fallback
                grounding_modes = (True, False) if model_name == GEMINI_VISION_MODELS[0] else (False,)
                for use_grounding in grounding_modes:
                    remaining = deadline - time.monotonic()
                    if remaining < 4.0:
                        break
                    payload_body: dict[str, Any] = {
                        "contents": [{"parts": parts}],
                        "generationConfig": (
                            {"temperature": 0.1, "maxOutputTokens": 768, "thinkingConfig": {"thinkingBudget": 0}}
                            if use_grounding
                            else {
                                "responseMimeType": "application/json",
                                "temperature": 0.1,
                                "maxOutputTokens": 768,
                                "thinkingConfig": {"thinkingBudget": 0},
                            }
                        ),
                    }
                    if use_grounding:
                        payload_body["tools"] = [{"google_search": {}}]
                    try:
                        with httpx.Client(timeout=min(25.0, remaining)) as client:
                            resp = client.post(url, json=payload_body)
                            resp.raise_for_status()
                            data = resp.json()
                        text_out = _extract_gemini_text(data)
                        parsed = _extract_json_block(text_out)
                        grounded = _extract_gemini_grounded_sources(data) if use_grounding else []
                        val, normalized = _normalize_ai_appraisal(
                            parsed,
                            photo_inspected,
                            is_raw_gradeable=is_raw_gradeable,
                            grounded_sources=grounded,
                        )
                        if val is not None:
                            normalized["ai_provider"] = "GEMINI"
                            normalized["gemini_quota_hit"] = False
                            return val, normalized
                    except Exception as exc:
                        logger.warning(
                            "Gemini AI appraisal (model=%s, grounding=%s) failed: %s",
                            model_name,
                            use_grounding,
                            _sanitize_error_message(str(exc)),
                        )
                        if _is_retryable_quota_error(exc):
                            quota_exhausted = True
                            gemini_quota_hit = True
                            break
                if quota_exhausted:
                    continue
            if gemini_quota_hit:
                _mark_gemini_cooldown(workspace)

    raw_images_for_compat: list[tuple[bytes, str]] | None = (
        [(base64.b64decode(b64), mime) for mime, b64 in encoded_photos] if encoded_photos else None
    )

    if groq_key and deadline - time.monotonic() >= 4.0:
        try:
            model = GROQ_VISION_MODEL if raw_images_for_compat else GROQ_TEXT_MODEL
            res = _call_openai_compat_chat(
                GROQ_CHAT_URL,
                groq_key,
                model,
                prompt,
                images=raw_images_for_compat,
                timeout=min(25.0, deadline - time.monotonic()),
            )
            val, normalized = _normalize_ai_appraisal(
                res["parsed"], photo_inspected, is_raw_gradeable=is_raw_gradeable
            )
            if val is not None:
                return val, normalized
        except Exception as exc:
            logger.warning("Groq AI appraisal failed: %s", _sanitize_error_message(str(exc)))

    if openrouter_key and deadline - time.monotonic() >= 4.0:
        try:
            model = OPENROUTER_VISION_MODEL if raw_images_for_compat else OPENROUTER_TEXT_MODEL
            res = _call_openai_compat_chat(
                OPENROUTER_CHAT_URL,
                openrouter_key,
                model,
                prompt,
                images=raw_images_for_compat,
                extra_headers={"HTTP-Referer": "https://stackerstash.com", "X-Title": "Stackers Stash"},
                timeout=min(25.0, deadline - time.monotonic()),
            )
            val, normalized = _normalize_ai_appraisal(
                res["parsed"], photo_inspected, is_raw_gradeable=is_raw_gradeable
            )
            if val is not None:
                return val, normalized
        except Exception as exc:
            logger.warning("OpenRouter AI appraisal failed: %s", _sanitize_error_message(str(exc)))

    if ollama_url and deadline - time.monotonic() >= 4.0:
        try:
            msg: dict[str, Any] = {"role": "user", "content": prompt}
            if encoded_photos:
                msg["images"] = [b64 for _, b64 in encoded_photos]
            parsed, _ = _post_ollama_chat(
                ollama_url,
                ollama_model,
                [msg],
                timeout=min(25.0, deadline - time.monotonic()),
            )
            val, normalized = _normalize_ai_appraisal(
                parsed, photo_inspected, is_raw_gradeable=is_raw_gradeable
            )
            if val is not None:
                normalized["ai_provider"] = "OLLAMA"
                normalized["gemini_quota_hit"] = gemini_quota_hit
                return val, normalized
        except Exception as exc:
            logger.warning("Ollama AI appraisal failed: %s", _sanitize_error_message(str(exc)))

    return None, {"gemini_quota_hit": gemini_quota_hit} if gemini_quota_hit else {}


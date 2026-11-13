from __future__ import annotations

import base64
import json
import logging
from decimal import Decimal
from typing import Any

import httpx

from apps.accounts.models import ProviderCredential, Workspace
from apps.catalog.models import CollectionItem

from .models import IdentificationJob

logger = logging.getLogger(__name__)

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
  "estimated_grade": "",
  "serial_number": "",
  "estimated_value_usd": 0,
  "ai_confidence": 0.0,
  "notes": ""
}

Strict rules:
- NEVER invent or guess a cert_number or serial_number. Only populate them if clearly legible in the image or barcode hint.
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
        "estimated_grade": raw.get("estimated_grade") or "",
        "serial_number": raw.get("serial_number") or "",
        "estimated_value_usd": raw.get("estimated_value_usd") or 0,
        "ai_confidence": float(raw.get("ai_confidence") or 0.0),
        "notes": raw.get("notes") or "",
    }
    return candidate


def _call_gemini_vision(
    images: list[tuple[bytes, str]], api_key: str, prompt: str, timeout: float = 25.0
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
        f"gemini-2.5-flash:generateContent?key={api_key}"
    )
    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.1},
    }
    with httpx.Client(timeout=timeout) as client:
        resp = client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    return {"parsed": _extract_json_block(text), "raw": data}


def _call_ollama_vision(
    images: list[tuple[bytes, str]],
    ollama_url: str,
    model_name: str,
    prompt: str,
    timeout: float = 45.0,
) -> dict[str, Any]:
    b64_images = [base64.b64encode(b).decode("ascii") for b, _ in images]
    endpoint = f"{ollama_url.rstrip('/')}/api/chat"
    payload = {
        "model": model_name or "llama3.2-vision",
        "stream": False,
        "format": "json",
        "messages": [
            {
                "role": "user",
                "content": prompt,
                "images": b64_images,
            }
        ],
    }
    with httpx.Client(timeout=timeout) as client:
        resp = client.post(endpoint, json=payload)
        resp.raise_for_status()
        data = resp.json()
    text = data["message"]["content"]
    return {"parsed": _extract_json_block(text), "raw": data}


def identify_images(
    images: list[tuple[bytes, str]],
    workspace: Workspace,
    barcode_hint: str | None = None,
) -> dict[str, Any]:
    """Identify item metadata from images using Gemini primary, Ollama fallback, or manual fallback."""
    prompt = IDENTIFICATION_PROMPT
    if barcode_hint:
        prompt += f"\nDetected slab barcode/QR hint: {barcode_hint}\n"

    gemini_key = _get_secret(workspace, ProviderCredential.Provider.GEMINI)
    ollama_url = _get_secret(workspace, ProviderCredential.Provider.OLLAMA_URL)
    ollama_model = (
        _get_secret(workspace, ProviderCredential.Provider.OLLAMA_MODEL) or "llama3.2-vision"
    )

    last_error = ""
    if gemini_key:
        try:
            res = _call_gemini_vision(images, gemini_key, prompt)
            candidate = _normalize_candidate(res["parsed"], barcode_hint)
            job = IdentificationJob.objects.create(
                workspace=workspace,
                status=IdentificationJob.Status.SUCCEEDED,
                provider_used="GEMINI",
                parsed_candidate=candidate,
                raw_response=res["raw"],
            )
            return {
                "job_id": str(job.id),
                "provider_used": "GEMINI",
                "candidate": candidate,
                "warning": None,
            }
        except Exception as exc:
            logger.warning("Gemini vision failed, checking Ollama fallback: %s", exc)
            last_error = str(exc)

    if ollama_url:
        try:
            res = _call_ollama_vision(images, ollama_url, ollama_model, prompt)
            candidate = _normalize_candidate(res["parsed"], barcode_hint)
            job = IdentificationJob.objects.create(
                workspace=workspace,
                status=IdentificationJob.Status.SUCCEEDED,
                provider_used="OLLAMA",
                parsed_candidate=candidate,
                raw_response=res["raw"],
            )
            return {
                "job_id": str(job.id),
                "provider_used": "OLLAMA",
                "candidate": candidate,
                "warning": None,
            }
        except Exception as exc:
            logger.warning("Ollama vision failed: %s", exc)
            last_error = str(exc)

    fallback_candidate = _normalize_candidate({}, barcode_hint)
    job = IdentificationJob.objects.create(
        workspace=workspace,
        status=IdentificationJob.Status.MANUAL_FALLBACK,
        provider_used="MANUAL",
        parsed_candidate=fallback_candidate,
        error_message=last_error,
    )
    return {
        "job_id": str(job.id),
        "provider_used": "MANUAL",
        "candidate": fallback_candidate,
        "warning": (
            "No AI vision provider succeeded. Complete item details manually or configure Gemini/Ollama in Settings."
        ),
    }


def estimate_item_value_with_ai(
    item: CollectionItem, workspace: Workspace
) -> tuple[Decimal | None, dict[str, Any]]:
    """Fallback text-based AI appraisal when no verified price guide matches."""
    gemini_key = _get_secret(workspace, ProviderCredential.Provider.GEMINI)
    if not gemini_key:
        return None, {}
    prompt = (
        "Provide a conservative USD fair market value estimate for this collectible item as JSON "
        '{"estimated_value_usd": <number>, "rationale": "<short string>"}.\n'
        f"Title: {item.title}\nCategory: {item.category}\nCountry: {item.country}\n"
        f"Year: {item.year}\nDenomination: {item.denomination}\n"
        f"Grading: {item.grading_service} {item.grade}\nMetal: {item.metal_type} {item.fine_troy_oz} ozt\n"
    )
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.5-flash:generateContent?key={gemini_key}"
    )
    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(
                url,
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"responseMimeType": "application/json", "temperature": 0.1},
                },
            )
            resp.raise_for_status()
            data = resp.json()
        parsed = _extract_json_block(data["candidates"][0]["content"]["parts"][0]["text"])
        val = Decimal(str(parsed.get("estimated_value_usd") or 0)).quantize(Decimal("0.01"))
        return (val if val > 0 else None), parsed
    except Exception as exc:
        logger.warning("AI valuation fallback failed: %s", exc)
        return None, {}


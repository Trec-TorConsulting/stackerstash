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


def identify_images(
    images: list[tuple[bytes, str]],
    workspace: Workspace,
    barcode_hint: str | None = None,
    intake_mode: str = "camera",
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
            verification_status, verification_warnings = _run_image_verification(
                images, res["parsed"], intake_mode
            )
            return {
                "job_id": str(job.id),
                "provider_used": "GEMINI",
                "candidate": candidate,
                "warning": None,
                "verification_status": verification_status,
                "verification_warnings": verification_warnings,
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
            verification_status, verification_warnings = _run_image_verification(
                images, res["parsed"], intake_mode
            )
            return {
                "job_id": str(job.id),
                "provider_used": "OLLAMA",
                "candidate": candidate,
                "warning": None,
                "verification_status": verification_status,
                "verification_warnings": verification_warnings,
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
    verification_status, verification_warnings = _run_image_verification(
        images, None, intake_mode
    )
    return {
        "job_id": str(job.id),
        "provider_used": "MANUAL",
        "candidate": fallback_candidate,
        "warning": (
            "No AI vision provider succeeded. Complete item details manually or configure Gemini/Ollama in Settings."
        ),
        "verification_status": verification_status,
        "verification_warnings": verification_warnings,
    }


def _collect_item_photo_b64(item: CollectionItem, limit: int = 3) -> list[tuple[str, str]]:
    """Return up to `limit` (mime_type, base64_data) tuples prioritizing OBVERSE, REVERSE, SLAB."""
    priority = {"OBVERSE": 0, "REVERSE": 1, "SLAB": 2, "DETAIL": 3, "OTHER": 4}
    photos = sorted(
        list(item.photos.all()),
        key=lambda p: (priority.get(p.label, 9), p.sort_order),
    )
    encoded: list[tuple[str, str]] = []
    for photo in photos:
        if len(encoded) >= limit:
            break
        try:
            with photo.image.open("rb") as f:
                raw = f.read()
            if not raw:
                continue
            name = (photo.image.name or "").lower()
            mime = "image/png" if name.endswith(".png") else "image/webp" if name.endswith(".webp") else "image/jpeg"
            encoded.append((mime, base64.b64encode(raw).decode("ascii")))
        except Exception as exc:
            logger.debug("Skipping unreadable photo %s for item %s: %s", photo.id, item.id, exc)
    return encoded


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
    ollama_url = _get_secret(workspace, ProviderCredential.Provider.OLLAMA_URL)
    ollama_model = _get_secret(workspace, ProviderCredential.Provider.OLLAMA_MODEL) or "qwen2.5vl:7b"
    if not gemini_key and not ollama_url:
        return None, {}

    encoded_photos = _collect_item_photo_b64(item, limit=3)
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

    if gemini_key:
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"gemini-2.5-flash:generateContent?key={gemini_key}"
        )
        parts: list[dict[str, Any]] = [{"text": prompt}]
        for mime, b64 in encoded_photos:
            parts.append({"inlineData": {"mimeType": mime, "data": b64}})

        # Try grounded Google Search first, then fall back to standard JSON mode
        for use_grounding in (True, False):
            payload_body: dict[str, Any] = {
                "contents": [{"parts": parts}],
                "generationConfig": {"temperature": 0.1}
                if use_grounding
                else {"responseMimeType": "application/json", "temperature": 0.1},
            }
            if use_grounding:
                payload_body["tools"] = [{"google_search": {}}]
            try:
                with httpx.Client(timeout=20.0) as client:
                    resp = client.post(url, json=payload_body)
                    resp.raise_for_status()
                    data = resp.json()
                text_out = data["candidates"][0]["content"]["parts"][0]["text"]
                parsed = _extract_json_block(text_out)
                grounded = _extract_gemini_grounded_sources(data) if use_grounding else []
                val, normalized = _normalize_ai_appraisal(
                    parsed,
                    photo_inspected,
                    is_raw_gradeable=is_raw_gradeable,
                    grounded_sources=grounded,
                )
                if val is not None:
                    return val, normalized
            except Exception as exc:
                logger.warning("Gemini AI appraisal (grounding=%s) failed: %s", use_grounding, exc)

    if ollama_url:
        try:
            msg: dict[str, Any] = {"role": "user", "content": prompt}
            if encoded_photos:
                msg["images"] = [b64 for _, b64 in encoded_photos]
            with httpx.Client(timeout=30.0) as client:
                resp = client.post(
                    f"{ollama_url.rstrip('/')}/api/chat",
                    json={"model": ollama_model, "messages": [msg], "stream": False, "format": "json"},
                )
                resp.raise_for_status()
                data = resp.json()
            parsed = _extract_json_block(data["message"]["content"])
            val, normalized = _normalize_ai_appraisal(
                parsed, photo_inspected, is_raw_gradeable=is_raw_gradeable
            )
            if val is not None:
                return val, normalized
        except Exception as exc:
            logger.warning("Ollama AI appraisal failed: %s", exc)

    return None, {}


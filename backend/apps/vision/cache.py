from __future__ import annotations

import hashlib
import io
import logging
from typing import Any

from django.core.cache import cache
from PIL import Image, ImageOps

from apps.accounts.models import Workspace
from apps.vision.models import CertLookupCache, ImageIdentificationCache

logger = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 days in Redis hot cache
_DHASH_MAX_HAMMING = 3


def compute_dhash(img_bytes: bytes) -> str:
    """Compute a 64-bit difference hash (16 hex chars) for an image."""
    try:
        with Image.open(io.BytesIO(img_bytes)) as opened:
            img = ImageOps.exif_transpose(opened).convert("L").resize(
                (9, 8), Image.Resampling.LANCZOS
            )
            pixels = list(
                img.get_flattened_data() if hasattr(img, "get_flattened_data") else img.getdata()
            )
        bits = 0
        for row in range(8):
            offset = row * 9
            for col in range(8):
                bits = (bits << 1) | int(pixels[offset + col] > pixels[offset + col + 1])
        return f"{bits:016x}"
    except Exception:
        return ""


def dhash_hamming_distance(a: str, b: str) -> int:
    if not a or not b or len(a) != len(b):
        return 64
    try:
        return (int(a, 16) ^ int(b, 16)).bit_count()
    except ValueError:
        return 64


def compute_images_fingerprint(images: list[tuple[bytes, str]]) -> tuple[str, str]:
    """Return (combined_sha256, primary_dhash) for an ordered list of image bytes."""
    h = hashlib.sha256()
    for raw, _ in images:
        h.update(hashlib.sha256(raw).digest())
    primary_dhash = compute_dhash(images[0][0]) if images else ""
    return h.hexdigest(), primary_dhash


def lookup_image_cache(
    workspace: Workspace, images: list[tuple[bytes, str]]
) -> dict[str, Any] | None:
    """Look up cached candidate by exact SHA-256 or close perceptual dHash."""
    if not images:
        return None
    sha256, primary_dhash = compute_images_fingerprint(images)
    redis_key = f"vision:idcache:{workspace.id}:{sha256}"
    try:
        cached = cache.get(redis_key)
        if isinstance(cached, dict) and cached.get("parsed_candidate"):
            return cached
    except Exception as exc:
        logger.debug("Redis image cache read skipped: %s", exc)

    exact = ImageIdentificationCache.objects.filter(
        workspace=workspace, sha256=sha256
    ).first()
    if exact and exact.parsed_candidate:
        ImageIdentificationCache.objects.filter(id=exact.id).update(hit_count=exact.hit_count + 1)
        data = {
            "provider_used": exact.provider_used,
            "parsed_candidate": exact.parsed_candidate,
        }
        try:
            cache.set(redis_key, data, _CACHE_TTL_SECONDS)
        except Exception as exc:
            logger.debug("Redis image cache write skipped: %s", exc)
        return data

    if primary_dhash:
        recent = ImageIdentificationCache.objects.filter(
            workspace=workspace
        ).exclude(dhash="").order_by("-updated_at")[:50]
        for entry in recent:
            if dhash_hamming_distance(primary_dhash, entry.dhash) <= _DHASH_MAX_HAMMING:
                ImageIdentificationCache.objects.filter(id=entry.id).update(
                    hit_count=entry.hit_count + 1
                )
                return {
                    "provider_used": entry.provider_used,
                    "parsed_candidate": entry.parsed_candidate,
                }
    return None


def store_image_cache(
    workspace: Workspace,
    images: list[tuple[bytes, str]],
    provider_used: str,
    parsed_candidate: dict[str, Any],
) -> None:
    if not images or not parsed_candidate:
        return
    sha256, primary_dhash = compute_images_fingerprint(images)
    ImageIdentificationCache.objects.update_or_create(
        workspace=workspace,
        sha256=sha256,
        defaults={
            "dhash": primary_dhash,
            "provider_used": provider_used,
            "parsed_candidate": parsed_candidate,
        },
    )
    redis_key = f"vision:idcache:{workspace.id}:{sha256}"
    try:
        cache.set(
            redis_key,
            {"provider_used": provider_used, "parsed_candidate": parsed_candidate},
            _CACHE_TTL_SECONDS,
        )
    except Exception as exc:
        logger.debug("Redis image cache store skipped: %s", exc)


def _cert_redis_key(svc: str, num: str) -> str:
    digest = hashlib.sha256(f"{svc}:{num}".encode()).hexdigest()[:24]
    return f"vision:certcache:{svc}:{digest}"


def lookup_cert_cache(grading_service: str, cert_number: str) -> dict[str, Any] | None:
    svc = (grading_service or "").strip().upper()
    num = (cert_number or "").strip()
    if not svc or svc == "NONE" or not num:
        return None
    redis_key = _cert_redis_key(svc, num)
    try:
        cached = cache.get(redis_key)
        if isinstance(cached, dict) and cached:
            return cached
    except Exception as exc:
        logger.debug("Redis cert cache read skipped: %s", exc)

    try:
        row = CertLookupCache.objects.filter(grading_service=svc, cert_number=num).first()
    except Exception:
        row = None
    if row and row.payload:
        try:
            cache.set(redis_key, row.payload, _CACHE_TTL_SECONDS)
        except Exception as exc:
            logger.debug("Redis cert cache fill skipped: %s", exc)
        return row.payload
    return None


def store_cert_cache(
    grading_service: str,
    cert_number: str,
    payload: dict[str, Any],
    source: str = "CERT_LOOKUP",
) -> None:
    svc = (grading_service or "").strip().upper()
    num = (cert_number or "").strip()
    if not svc or svc == "NONE" or not num or not payload:
        return
    try:
        CertLookupCache.objects.update_or_create(
            grading_service=svc,
            cert_number=num,
            defaults={"payload": payload, "source": source},
        )
    except Exception as exc:
        logger.debug("DB cert cache write skipped: %s", exc)
    redis_key = _cert_redis_key(svc, num)
    try:
        cache.set(redis_key, payload, _CACHE_TTL_SECONDS)
    except Exception as exc:
        logger.debug("Redis cert cache store skipped: %s", exc)

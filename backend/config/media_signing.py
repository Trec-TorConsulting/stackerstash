"""Coarse-bucketed HMAC URL signing and verification for uploaded media assets."""

from __future__ import annotations

import hashlib
import hmac
import re
import time
from pathlib import Path
from urllib.parse import unquote

from django.conf import settings
from django.http import Http404

_BUCKET_SECONDS = 7 * 24 * 60 * 60
_SIGNED_PATH_RE = re.compile(r"^s/(?P<exp>\d+)/(?P<sig>[0-9a-f]{32})/(?P<rel_path>.+)$")


class MediaSignatureError(Exception):
    """Raised when a media request lacks a valid, unexpired HMAC signature."""


def _compute_signature(exp: int, rel_path: str) -> str:
    msg = f"{exp}:{rel_path}".encode()
    key = settings.SECRET_KEY.encode("utf-8")
    return hmac.new(key, msg, hashlib.sha256).hexdigest()[:32]


def build_signed_media_url(relative_path: str, *, now: int | None = None) -> str:
    """Return a rolling 7-day-bucket HMAC-signed media URL under MEDIA_URL."""
    rel = (relative_path or "").lstrip("/")
    if not rel:
        return ""
    ts = int(now if now is not None else time.time())
    exp = ((ts // _BUCKET_SECONDS) + 2) * _BUCKET_SECONDS
    sig = _compute_signature(exp, rel)
    prefix = "/" + settings.MEDIA_URL.strip("/")
    return f"{prefix}/s/{exp}/{sig}/{rel}"


def _contains_traversal(raw_path: str) -> bool:
    decoded = unquote(raw_path or "")
    normalized = decoded.replace("\\", "/")
    parts = [part for part in normalized.split("/") if part]
    return ".." in parts or normalized.startswith("/")


def verify_signed_media_path(raw_path: str, *, now: int | None = None) -> str:
    """Validate signature, expiry, and path containment; return safe relative path."""
    if _contains_traversal(raw_path):
        raise Http404("Invalid media path.")

    match = _SIGNED_PATH_RE.match(raw_path)
    if not match:
        raise MediaSignatureError("Signed media URL required.")

    exp = int(match.group("exp"))
    sig = match.group("sig")
    rel_path = match.group("rel_path")

    if _contains_traversal(rel_path):
        raise Http404("Invalid media path.")

    ts = int(now if now is not None else time.time())
    if exp < ts:
        raise MediaSignatureError("Signed media URL has expired.")

    expected = _compute_signature(exp, rel_path)
    if not hmac.compare_digest(sig, expected):
        raise MediaSignatureError("Invalid media signature.")

    media_root = Path(settings.MEDIA_ROOT).resolve()
    candidate = (media_root / rel_path).resolve()
    if not candidate.is_relative_to(media_root):
        raise Http404("Invalid media path.")

    return rel_path

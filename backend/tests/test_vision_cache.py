from __future__ import annotations

import io

import pytest
from PIL import Image, ImageDraw

from apps.vision.cache import (
    compute_dhash,
    lookup_cert_cache,
    lookup_image_cache,
    store_cert_cache,
    store_image_cache,
)


def _sample_image_bytes(quality: int = 95, size: tuple[int, int] = (200, 200)) -> bytes:
    img = Image.new("RGB", size, color=(35, 35, 38))
    draw = ImageDraw.Draw(img)
    draw.ellipse((40, 40, 160, 160), fill=(212, 175, 55), outline=(90, 80, 30), width=4)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


@pytest.mark.django_db
def test_image_identification_cache_exact_and_perceptual_dhash(user_a):
    _, ws, _ = user_a
    img_bytes = _sample_image_bytes(quality=95)
    assert compute_dhash(img_bytes)

    assert lookup_image_cache(ws, [(img_bytes, "image/jpeg")]) is None

    candidate = {"title": "American Gold Eagle 1 oz", "category": "COIN"}
    store_image_cache(ws, [(img_bytes, "image/jpeg")], "GEMINI", candidate)

    # Exact SHA-256 hit
    hit = lookup_image_cache(ws, [(img_bytes, "image/jpeg")])
    assert hit is not None
    assert hit["parsed_candidate"]["title"] == "American Gold Eagle 1 oz"

    # Slightly re-compressed version (different SHA-256, identical/close dHash)
    recompressed = _sample_image_bytes(quality=72)
    assert recompressed != img_bytes
    dhash_hit = lookup_image_cache(ws, [(recompressed, "image/jpeg")])
    assert dhash_hit is not None
    assert dhash_hit["parsed_candidate"]["title"] == "American Gold Eagle 1 oz"


@pytest.mark.django_db
def test_cert_lookup_cache_hit_and_miss(user_a, user_b):
    _, ws_a, _ = user_a
    _, ws_b, _ = user_b

    assert lookup_cert_cache("PCGS", "99999999") is None
    store_cert_cache("PCGS", "99999999", {"grade": "MS65", "title": "2025-P Quarter"})
    hit = lookup_cert_cache("pcgs", "99999999")
    assert hit == {"grade": "MS65", "title": "2025-P Quarter"}

    # Workspace-scoped BYOK / free-text cache entries are isolated between Vault A and Vault B
    store_cert_cache(
        "NUMISTA",
        "a" * 64,
        {"specs": {"composition": "Vault A Private Silver"}},
        source="NUMISTA",
        workspace=ws_a,
    )
    assert lookup_cert_cache("NUMISTA", "a" * 64, workspace=ws_a) == {
        "specs": {"composition": "Vault A Private Silver"}
    }
    assert lookup_cert_cache("NUMISTA", "a" * 64, workspace=ws_b) is None
    assert lookup_cert_cache("NUMISTA", "a" * 64, workspace=None) is None


@pytest.mark.django_db
def test_pcgs_and_numista_providers_use_server_cache(monkeypatch):
    from decimal import Decimal

    from apps.valuation import providers

    calls = {"pcgs": 0, "numista": 0}

    class FakeResp:
        def __init__(self, payload):
            self.status_code = 200
            self._payload = payload

        def json(self):
            return self._payload

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, url, **kwargs):
            if "pcgs.com" in url:
                calls["pcgs"] += 1
                return FakeResp({"PriceGuideValue": "55.00", "Diameter": "24.26"})
            calls["numista"] += 1
            if "types?" in url or url.endswith("/types"):
                return FakeResp({"types": [{"id": 123}]})
            return FakeResp({"weight": 31.103, "size": 40.6, "composition": {"text": "Silver .999"}})

    monkeypatch.setattr(providers.httpx, "Client", FakeClient)

    r1 = providers.lookup_pcgs_cert("61829511", "tok")
    r2 = providers.lookup_pcgs_cert("61829511", "tok")
    assert r1 is not None and r2 is not None
    assert r2["market_value"] == Decimal("55.00")
    assert calls["pcgs"] == 1

    n1 = providers.lookup_numista_specs("American Silver Eagle", "2024", "USA", "$1", api_key="k")
    n2 = providers.lookup_numista_specs("American Silver Eagle", "2024", "USA", "$1", api_key="k")
    assert n1 is not None and n2 is not None
    assert n2["specs"]["diameter_mm"] == Decimal("40.60")
    assert calls["numista"] == 2  # 1 search + 1 detail, 0 on second lookup


@pytest.mark.django_db
def test_vision_cache_error_and_fallback_branches(monkeypatch):
    from unittest.mock import patch

    from apps.accounts.models import User, create_default_workspace_for_user
    from apps.vision.cache import (
        dhash_hamming_distance,
        lookup_cert_cache,
        lookup_image_cache,
        store_cert_cache,
        store_image_cache,
    )
    from apps.vision.models import CertLookupCache, ImageIdentificationCache

    assert dhash_hamming_distance("", "abc") == 64
    assert dhash_hamming_distance("zzzzzzzzzzzzzzzz", "0000000000000000") == 64

    owner = User.objects.create_user(email="cache_edge@example.com", password="pw")
    ws = create_default_workspace_for_user(owner, name="Cache Vault")

    assert lookup_image_cache(ws, []) is None
    store_image_cache(ws, [], "MANUAL", {"title": "skip"})

    # Redis cache failures handled gracefully on read and write
    img = [(b"\x89PNG\r\n\x1a\nbadpng", "image/png")]
    ImageIdentificationCache.objects.create(
        workspace=ws,
        sha256="dummy",
        dhash="0000000000000000",
        provider_used="GEMINI",
        parsed_candidate={"title": "Cached"},
    )
    with patch("apps.vision.cache.cache.get", side_effect=RuntimeError("redis down")), patch(
        "apps.vision.cache.cache.set", side_effect=RuntimeError("redis write down")
    ):
        store_image_cache(ws, img, "GEMINI", {"title": "Saved"})
        hit = lookup_image_cache(ws, img)
        assert hit is not None and hit["parsed_candidate"]["title"] == "Saved"

    # Lookup cert cache: invalid args, redis failure, DB fallback hit + write exception
    assert lookup_cert_cache("NONE", "123") is None
    assert lookup_cert_cache("PCGS", "") is None
    CertLookupCache.objects.create(
        grading_service="PCGS", cert_number="777888", payload={"title": "1921 Morgan"}, source="PCGS"
    )
    with patch("apps.vision.cache.cache.get", side_effect=RuntimeError("redis down")), patch(
        "apps.vision.cache.cache.set", side_effect=RuntimeError("redis set down")
    ), patch("apps.vision.models.CertLookupCache.objects.update_or_create", side_effect=RuntimeError("db err")):
        store_cert_cache("NONE", "123", {"x": 1})
        store_cert_cache("PCGS", "777888", {"title": "Updated"})
        cert_hit = lookup_cert_cache("PCGS", "777888")
        assert cert_hit == {"title": "1921 Morgan"}


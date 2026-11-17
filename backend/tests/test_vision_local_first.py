from __future__ import annotations

import io

import pytest
from PIL import Image, ImageDraw

from apps.accounts.crypto import encrypt_secret
from apps.accounts.models import ProviderCredential
from apps.vision import services


def _make_jpeg(size: tuple[int, int] = (400, 300), color=(40, 40, 42)) -> bytes:
    img = Image.new("RGB", size, color=color)
    draw = ImageDraw.Draw(img)
    draw.rectangle((60, 60, 340, 240), fill=(210, 180, 90))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


@pytest.mark.django_db
def test_identify_images_resolves_via_local_catalog_with_zero_ai_calls(user_a, monkeypatch):
    _, ws, _ = user_a
    ProviderCredential.objects.create(
        workspace=ws,
        provider=ProviderCredential.Provider.GEMINI,
        encrypted_value="fake-key",
    )

    monkeypatch.setattr(
        services,
        "extract_text_from_images",
        lambda imgs: "UTAH\nGoldback\n1/4\nNegotiable Instrument\n2023",
    )

    def _fail_if_called(*args, **kwargs):
        raise AssertionError("Vision/Text LLM should not be called on static catalog match")

    monkeypatch.setattr(services, "_call_gemini_vision", _fail_if_called)
    monkeypatch.setattr(services, "_call_gemini_vision_model", _fail_if_called)

    img1 = _make_jpeg()
    res = services.identify_images([(img1, "image/jpeg")], ws)
    assert res["provider_used"] == "LOCAL_CATALOG"
    assert res["candidate"]["category"] == "PAPER"
    assert res["candidate"]["metal_type"] == "GOLD"
    assert "Utah" in res["candidate"]["title"]

    # Second call with same image hits ImageIdentificationCache (CACHE)
    res2 = services.identify_images([(img1, "image/jpeg")], ws)
    assert res2["provider_used"] == "CACHE"
    assert res2["candidate"]["title"] == res["candidate"]["title"]


@pytest.mark.django_db
def test_identify_images_fast_local_mode_never_calls_ai(user_a, monkeypatch):
    _, ws, _ = user_a
    ProviderCredential.objects.create(
        workspace=ws,
        provider=ProviderCredential.Provider.GEMINI,
        encrypted_value="fake-key",
    )
    monkeypatch.setattr(
        services,
        "extract_text_from_images",
        lambda imgs: "PCGS MS65 1921 Morgan Dollar #12345678",
    )

    def _fail_if_called(*args, **kwargs):
        raise AssertionError("AI must not be called in fast_local mode")

    monkeypatch.setattr(services, "_call_gemini_vision", _fail_if_called)
    monkeypatch.setattr(services, "_call_gemini_vision_model", _fail_if_called)

    res = services.identify_images([(_make_jpeg(), "image/jpeg")], ws, identify_mode="fast_local")
    assert res["provider_used"] in ("LOCAL_CATALOG", "OCR_LOCAL")
    assert res["candidate"]["grading_service"] == "PCGS"


@pytest.mark.django_db
def test_identify_images_uses_text_only_tier_before_vision_when_ocr_is_rich(user_a, monkeypatch):
    _, ws, _ = user_a
    ProviderCredential.objects.create(
        workspace=ws,
        provider=ProviderCredential.Provider.GROQ_API_KEY,
        encrypted_value=encrypt_secret("fake-groq"),
    )
    monkeypatch.setattr(
        services,
        "extract_text_from_images",
        lambda imgs: "RARE PRIVATE MINT MEDAL 1974 COMMEMORATIVE EDITION 1 OZ SILVER",
    )
    monkeypatch.setattr("apps.catalog.reference_catalog.match_static_reference", lambda *a, **kw: None)

    called = {"text": 0, "vision": 0}

    def fake_openai_compat(url, key, model, prompt, images=None, **kwargs):
        if images:
            called["vision"] += 1
        else:
            called["text"] += 1
        return {
            "parsed": {
                "category": "ROUND",
                "title": "1974 Private Mint Commemorative 1 oz Silver Medal",
                "metal_type": "SILVER",
                "weight_value": 1,
                "weight_unit": "OZ_T",
                "purity": 0.999,
            },
            "raw": {},
        }

    monkeypatch.setattr(services, "_call_openai_compat_chat", fake_openai_compat)
    res = services.identify_images([(_make_jpeg(), "image/jpeg")], ws)
    assert res["provider_used"] == "OCR_TEXT"
    assert called["text"] == 1
    assert called["vision"] == 0


def test_build_vision_composite_combines_two_images_within_768px():
    a = _make_jpeg((1024, 768), (100, 100, 100))
    b = _make_jpeg((1024, 768), (150, 150, 150))
    out = services._build_vision_composite([(a, "image/jpeg"), (b, "image/jpeg")], max_side=768)
    assert len(out) == 1
    with Image.open(io.BytesIO(out[0][0])) as im:
        assert max(im.size) <= 768

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


@pytest.mark.django_db
def test_vision_services_comprehensive_branches(monkeypatch):
    import time
    from decimal import Decimal
    from unittest.mock import MagicMock, patch

    import httpx
    import respx
    from django.core.cache import cache
    from django.core.files.uploadedfile import SimpleUploadedFile

    from apps.accounts.models import ProviderCredential, User, create_default_workspace_for_user
    from apps.catalog.models import CollectionItem, ItemPhoto
    from apps.vision import services

    cache.clear()
    owner = User.objects.create_user(email="vision_edge@example.com", password="pw")
    ws = create_default_workspace_for_user(owner, name="Vision Edge Vault")

    # JSON block fenced extraction
    assert services._extract_json_block("```json\n{\"title\": \"Coin\"}\n```") == {"title": "Coin"}

    # Retryable quota errors via __cause__ and HTTP 503 text
    cause_exc = httpx.HTTPStatusError("429", request=MagicMock(), response=httpx.Response(429))
    wrapped = RuntimeError("wrapped")
    wrapped.__cause__ = cause_exc
    assert services._is_retryable_quota_error(wrapped) is True
    assert services._is_retryable_quota_error(RuntimeError("HTTP 503: busy")) is True

    # _infer_image_mime magic signatures
    assert services._infer_image_mime(b"\xff\xd8\xffabc", None) == "image/jpeg"
    assert services._infer_image_mime(b"\x89PNG\r\n\x1a\nabc", "application/octet-stream") == "image/png"
    assert services._infer_image_mime(b"RIFF1234WEBP", None) == "image/webp"
    assert services._infer_image_mime(b"\x00\x00\x00\x18ftypheic", None) == "image/heic"
    assert services._infer_image_mime(b"\x00\x00\x00\x18ftypheif", None) == "image/heif"
    assert services._infer_image_mime(b"randombytes123", None) == "image/jpeg"

    # _prepare_images_for_vision RGBA paste onto white, Grayscale 'L', 1-bit '1' convert (214), and unreadable bytes fallback
    rgba_buf = io.BytesIO()
    Image.new("RGBA", (2000, 2000), (200, 180, 100, 128)).save(rgba_buf, format="PNG")
    l_buf = io.BytesIO()
    Image.new("L", (100, 100), 128).save(l_buf, format="PNG")
    one_buf = io.BytesIO()
    Image.new("1", (100, 100), 1).save(one_buf, format="PNG")
    rgb_buf = io.BytesIO()
    Image.new("RGB", (100, 100), (120, 130, 140)).save(rgb_buf, format="JPEG")
    prepped = services._prepare_images_for_vision(
        [
            (rgba_buf.getvalue(), "image/png"),
            (l_buf.getvalue(), "image/png"),
            (one_buf.getvalue(), "image/png"),
            (rgb_buf.getvalue(), "image/jpeg"),
            (b"\xff\xd8\xffbad", "application/octet-stream"),
        ],
        max_dimension=400,
    )
    assert len(prepped) == 5

    # _extract_gemini_text edge cases
    with pytest.raises(ValueError, match="no candidates"):
        services._extract_gemini_text({"promptFeedback": {"blockReason": "SAFETY"}})
    assert services._extract_gemini_text({"candidates": [{"content": {"parts": [{"thought": True, "text": "{\"a\":1}"}]}}]}) == "{\"a\":1}"
    with pytest.raises(ValueError, match="no text"):
        services._extract_gemini_text({"candidates": [{"finishReason": "STOP", "content": {"parts": []}}]})

    # _parse_ollama_response JSON, empty, NDJSON streaming chunks + thinking fallback, non-JSON
    with pytest.raises(ValueError, match="empty response"):
        services._parse_ollama_response("   ")
    with pytest.raises(ValueError, match="empty completion"):
        services._parse_ollama_response('{"message": {"content": ""}}')
    nd_body = '{"message": {"content": "{\\"title\\": "}}\n{"message": {"content": "\\"Morgan\\"}"}}\n'
    assert services._parse_ollama_response(nd_body)[0] == '{"title": "Morgan"}'
    think_nd = '\n{"message": {"thinking": "{\\"title\\": \\"Think\\"}"}}\n\n{"done": true}\n'
    assert "Think" in services._parse_ollama_response(think_nd)[0]
    with pytest.raises(ValueError, match="empty completion"):
        services._parse_ollama_response('{"message": {}}\n{"done": true}\n')
    with pytest.raises(ValueError, match="non-JSON"):
        services._parse_ollama_response("not json at all")

    with respx.mock(assert_all_called=False) as router:
        # _call_gemini_vision cascading 429 then success + empty models error
        router.post(
            "https://generativelanguage.googleapis.com/v1beta/models/m1:generateContent"
        ).mock(return_value=httpx.Response(429, text="quota?key=SECRET123"))
        router.post(
            "https://generativelanguage.googleapis.com/v1beta/models/m2:generateContent"
        ).mock(return_value=httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "{\"title\": \"ASE\"}"}]}}]}))
        assert services._call_gemini_vision([(prepped[0][0], "image/jpeg")], "k", "p", models=("m1", "m2"))["parsed"]["title"] == "ASE"
        with pytest.raises(RuntimeError, match="No Gemini vision"):
            services._call_gemini_vision([], "k", "p", models=())
        # All fail
        router.post(
            "https://generativelanguage.googleapis.com/v1beta/models/m1:generateContent"
        ).mock(return_value=httpx.Response(429, text="still 429"))
        with pytest.raises(RuntimeError, match="HTTP 429"):
            services._call_gemini_vision([], "k", "p", models=("m1",))

        # _call_openai_compat_chat 400 response_format fallback, 500 error, empty completion text
        router.post("https://compat.example.com/v1/chat/completions").mock(
            side_effect=[
                httpx.Response(400, text="unsupported response_format"),
                httpx.Response(200, json={"choices": [{"message": {"content": '{"title": "Gold"}'}}]}),
            ]
        )
        assert services._call_openai_compat_chat("https://compat.example.com/v1/chat/completions", "key", "m", "p")["parsed"]["title"] == "Gold"
        router.post("https://compat.example.com/v1/chat/completions").mock(
            return_value=httpx.Response(200, json={"choices": [{"message": {"content": ""}}]})
        )
        with pytest.raises(ValueError, match="empty completion"):
            services._call_openai_compat_chat("https://compat.example.com/v1/chat/completions", "key", "m", "p")
        router.post("https://compat.example.com/v1/chat/completions").mock(return_value=httpx.Response(500, text="server err"))
        with pytest.raises(RuntimeError, match="HTTP 500"):
            services._call_openai_compat_chat("https://compat.example.com/v1/chat/completions", "key", "m", "p")

        # _post_ollama_chat think fallback + error + _call_ollama_vision
        router.post("http://ollama.local/api/chat").mock(
            side_effect=[
                httpx.Response(400, text="unknown field think"),
                httpx.Response(200, json={"message": {"content": '{"title": "Bar"}'}}),
            ]
        )
        assert services._call_ollama_vision([(prepped[0][0], "image/jpeg")], "http://ollama.local", "m", "p")["parsed"]["title"] == "Bar"
        router.post("http://ollama.local/api/chat").mock(return_value=httpx.Response(500, text="err"))
        with pytest.raises(RuntimeError, match="HTTP 500"):
            services._post_ollama_chat("http://ollama.local", "m", [{"role": "user", "content": "hi"}])

    # _run_image_verification synthetic & front/back & warnings
    status, warns = services._run_image_verification(
        [(prepped[0][0], "image/jpeg"), (prepped[0][0], "image/jpeg")],
        {"authenticity": {"is_synthetic_or_edited": True, "front_back_consistent": False, "warnings": ["Custom warn"]}},
        "camera",
    )
    assert status == "FLAGGED" and any("Custom warn" in w for w in warns)

    # _enrich_candidate_from_catalog PCGS & Numista enrichment
    for prov, val in [("PCGS", "pcgs-k"), ("NUMISTA_KEY", "num-k")]:
        c, _ = ProviderCredential.objects.get_or_create(workspace=ws, provider=prov, defaults={"encrypted_value": ""})
        c.set_secret(val)
        c.save()
    with patch(
        "apps.valuation.providers.lookup_pcgs_cert", return_value={"market_value": "120.00"}
    ), patch(
        "apps.valuation.providers.lookup_numista_specs", return_value={"specs": {"gross_weight_grams": "31.10"}}
    ):
        cand = services._enrich_candidate_from_catalog(
            {"title": "Morgan", "grading_service": "PCGS", "cert_number": "1234567"}, ws
        )
        assert cand["estimated_value_usd"] == 120.0 and cand["weight_unit"] == "G"

    # _merge_ocr_hints_into_parsed & _build_vision_composite fallback
    merged = services._merge_ocr_hints_into_parsed(
        {"title": "Morgan"},
        {"year": "1921", "grading_service": "NGC", "metal_type": "SILVER", "weight_value": 1.0, "weight_unit": "OZ_T"},
    )
    assert merged["grading_service"] == "NGC" and merged["metal_type"] == "SILVER" and merged["weight_value"] == 1.0
    assert services._build_vision_composite([(b"bad", "image/jpeg"), (b"bad2", "image/jpeg")]) == [(b"bad", "image/jpeg"), (b"bad2", "image/jpeg")]
    assert services._build_vision_composite([(prepped[0][0], "image/jpeg")]) == [(prepped[0][0], "image/jpeg")]

    # _attempt_ocr_fallback early returns & text-only Gemini/Ollama paths
    assert services._attempt_ocr_fallback(
        workspace=ws, images=[], vision_images=[], barcode_hint=None, intake_mode="camera",
        gemini_key="", groq_key="", openrouter_key="", ollama_url="", ollama_model="",
        provider_errors=[], deadline=time.monotonic() + 2.0,
    ) is None
    assert services._attempt_ocr_fallback(
        workspace=ws, images=[], vision_images=[], barcode_hint=None, intake_mode="camera",
        gemini_key="", groq_key="", openrouter_key="", ollama_url="", ollama_model="",
        provider_errors=[], precomputed_ocr_text="",
    ) is None
    assert services._attempt_ocr_fallback(
        workspace=ws, images=[], vision_images=[], barcode_hint=None, intake_mode="camera",
        gemini_key="", groq_key="", openrouter_key="", ollama_url="", ollama_model="",
        provider_errors=[], precomputed_ocr_text="text", precomputed_hints={"has_usable_hints": False},
    ) is None

    # fast_local mode: OCR_LOCAL and MANUAL fallback; identify_images deadline/provider cascade
    monkeypatch.setattr("apps.catalog.reference_catalog.match_static_reference", lambda *a, **kw: None)
    with patch("apps.vision.services.extract_text_from_images", return_value="1921 MORGAN PCGS MS65 12345678"), patch(
        "apps.vision.cache.lookup_cert_cache", return_value={"title": "Cached Morgan", "grade": "MS65"}
    ), patch("apps.vision.cache.lookup_image_cache", return_value=None):
        fl_ocr = services.identify_images([(prepped[0][0], "image/jpeg")], ws, identify_mode="fast_local")
        assert fl_ocr["provider_used"] == "OCR_LOCAL"
    with patch("apps.vision.services.extract_text_from_images", return_value=""), patch(
        "apps.vision.cache.lookup_image_cache", return_value=None
    ):
        fl_man = services.identify_images([(prepped[0][0], "image/jpeg")], ws, identify_mode="fast_local")
        assert fl_man["provider_used"] == "MANUAL"

    # Full identify_images: cooldown Gemini + OpenRouter fail + Ollama fail + deadline exceeded skip + cache store error
    for prov, val in [
        ("GEMINI", "gem-k"),
        ("GROQ_API_KEY", "grq-k"),
        ("OPENROUTER_API_KEY", "or-k"),
        ("OLLAMA_URL", "http://ollama.local"),
    ]:
        c, _ = ProviderCredential.objects.get_or_create(workspace=ws, provider=prov, defaults={"encrypted_value": ""})
        c.set_secret(val)
        c.save()
    services._mark_gemini_cooldown(ws, ttl=60)
    with patch("apps.vision.cache.lookup_image_cache", return_value=None), patch(
        "apps.vision.services.extract_text_from_images", return_value="short"
    ), patch(
        "apps.vision.services._call_openai_compat_chat", side_effect=RuntimeError("compat down")
    ), patch(
        "apps.vision.services._call_ollama_vision", side_effect=RuntimeError("ollama down")
    ):
        manual_res = services.identify_images([(prepped[0][0], "image/jpeg")], ws)
        assert manual_res["provider_used"] == "MANUAL"
        assert manual_res["quota_deferred"] is True

    # _collect_item_photo_b64 + _normalize_ai_appraisal + estimate_item_value_with_ai (Gemini grounding, Groq, OpenRouter, Ollama)
    item = CollectionItem.objects.create(workspace=ws, title="1921 Morgan Dollar", category="COIN")
    ItemPhoto.objects.create(workspace=ws, item=item, image=SimpleUploadedFile("a.png", l_buf.getvalue(), content_type="image/png"), label="OBVERSE", sort_order=1)
    bad_p = ItemPhoto.objects.create(workspace=ws, item=item, label="REVERSE", sort_order=2)
    bad_p.image.name = "missing/photo.webp"
    bad_p.save(update_fields=["image"])
    ItemPhoto.objects.create(workspace=ws, item=item, image=SimpleUploadedFile("b.png", l_buf.getvalue(), content_type="image/png"), label="OTHER", sort_order=3)
    assert len(services._collect_item_photo_b64(item, limit=2)) == 2

    assert services._normalize_ai_appraisal({"mid_usd": "bad"}, True) == (None, {})
    _, norm_edge = services._normalize_ai_appraisal(
        {"mid_usd": "50", "low_usd": "bad", "grading_upside_usd": "bad", "raw_condition": "BAD"},
        photo_inspected=False,
        is_raw_gradeable=True,
    )
    assert norm_edge["low_usd"] == "42.50" and norm_edge["raw_condition"] == ""

    cache.delete(services._gemini_cooldown_key(ws))
    with respx.mock(assert_all_called=False) as router2:
        router2.post(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
        ).mock(
            return_value=httpx.Response(
                200,
                json={
                    "candidates": [
                        {
                            "content": {"parts": [{"text": '{"mid_usd": 125.0}'}]},
                            "groundingMetadata": {"groundingChunks": [{"web": {"uri": "https://pcgs.com", "title": "PCGS"}}]},
                        }
                    ]
                },
            )
        )
        v_gem, raw_gem = services.estimate_item_value_with_ai(item, ws)
        assert v_gem == Decimal("125.00") and len(raw_gem["grounded_sources"]) == 1

    # Cascade past Gemini 429 + Groq fail + OpenRouter fail -> Ollama AI appraisal success
    with patch("httpx.Client.post", side_effect=RuntimeError("HTTP 429: quota")), patch(
        "apps.vision.services._call_openai_compat_chat", side_effect=RuntimeError("compat fail")
    ), patch(
        "apps.vision.services._post_ollama_chat", return_value=({"mid_usd": 85.0}, {"ok": True})
    ):
        v_ol, raw_ol = services.estimate_item_value_with_ai(item, ws)
        assert v_ol == Decimal("85.00") and raw_ol["ai_provider"] == "OLLAMA"

    # Remaining vision/services.py branches: 577, 584, 604, 622, 631, 642, 647-648, 766-767, 833-834, 840, 842, 939-940, 983, 1015-1017, 1032-1040, 1080-1082, 1125, 1130, 1233, 1242-1252, 1289, 1297, 1308, 1393-1397, 1419-1422
    # 1) _attempt_ocr_fallback with barcode_hint, deadline=None, OpenRouter/Gemini/Ollama text failures + deadline break
    with patch(
        "apps.vision.services._call_openai_compat_chat", side_effect=RuntimeError("text fail")
    ), patch(
        "apps.vision.services._call_gemini_vision_model", side_effect=RuntimeError("gem text fail")
    ), patch(
        "apps.vision.services._call_ollama_vision", side_effect=RuntimeError("ollama text fail")
    ):
        fb_res = services._attempt_ocr_fallback(
            workspace=ws,
            images=[(prepped[0][0], "image/jpeg")],
            vision_images=[(prepped[0][0], "image/jpeg")],
            barcode_hint="1234567",
            intake_mode="camera",
            gemini_key="gk",
            groq_key="",
            openrouter_key="ork",
            ollama_url="http://ollama.local",
            ollama_model="m",
            provider_errors=["prev err"],
            deadline=None,
            precomputed_ocr_text="1921 MORGAN PCGS MS65 1234567",
            precomputed_hints={"has_usable_hints": True, "title": "1921 Morgan"},
        )
        assert fb_res is not None and fb_res["provider_used"] == "OCR_CATALOG"

    # Deadline break inside text_attempts loop (line 640)
    with patch("apps.vision.services.time.monotonic", side_effect=[100.0, 116.0]):
        fb_break = services._attempt_ocr_fallback(
            workspace=ws,
            images=[(prepped[0][0], "image/jpeg")],
            vision_images=[(prepped[0][0], "image/jpeg")],
            barcode_hint=None,
            intake_mode="camera",
            gemini_key="gk",
            groq_key="",
            openrouter_key="",
            ollama_url="",
            ollama_model="",
            provider_errors=[],
            deadline=120.0,
            precomputed_ocr_text="1921 MORGAN PCGS MS65",
            precomputed_hints={"has_usable_hints": True, "title": "Morgan"},
        )
        assert fb_break is not None

    # 2) store_image_cache failure inside _record_vision_success (766-767) & OCR text flow (939-940)
    with patch("apps.vision.cache.store_image_cache", side_effect=RuntimeError("cache write err")):
        services._record_vision_success(
            ws, "GEMINI", {"parsed": {"title": "Morgan"}}, [(prepped[0][0], "image/jpeg")], None, "camera"
        )
    with patch("apps.vision.cache.lookup_image_cache", return_value=None), patch(
        "apps.vision.services.extract_text_from_images", return_value="1921 MORGAN SILVER DOLLAR 1 OZ SILVER UNITED STATES"
    ), patch(
        "apps.vision.services._call_openai_compat_chat",
        return_value={"parsed": {"title": "1921 Morgan"}, "raw": {}},
    ), patch("apps.vision.cache.store_image_cache", side_effect=RuntimeError("ocr store fail")):
        ocr_ok = services.identify_images([(prepped[0][0], "image/jpeg")], ws)
        assert ocr_ok["provider_used"] == "OCR_TEXT"

    # 3) identify_images: OCR exception (833-834), cert_cache fill title/grade (840, 842), Groq vision success (983)
    with patch("apps.vision.cache.lookup_image_cache", return_value=None), patch(
        "apps.vision.services.extract_text_from_images", return_value="PCGS 9988776"
    ), patch(
        "apps.vision.services.parse_ocr_numismatic_hints",
        return_value={"grading_service": "PCGS", "cert_number": "9988776", "title": "", "grade": "", "has_usable_hints": False},
    ), patch(
        "apps.vision.cache.lookup_cert_cache", return_value={"title": "Cached Coin", "grade": "MS64"}
    ), patch("apps.vision.services._is_gemini_in_cooldown", return_value=False), patch(
        "apps.vision.services._call_gemini_vision", side_effect=RuntimeError("gem fail")
    ), patch(
        "apps.vision.services._call_openai_compat_chat", return_value={"parsed": {"title": "Groq Coin"}, "raw": {}}
    ):
        grq_ok = services.identify_images([(prepped[0][0], "image/jpeg")], ws)
        assert grq_ok["provider_used"] == "GROQ"

    # 4) identify_images: OCR exception + Ollama success + post-Ollama OCR enrichment + post-Ollama OCR error
    with patch("apps.vision.cache.lookup_image_cache", return_value=None), patch(
        "apps.vision.services.extract_text_from_images",
        side_effect=[RuntimeError("pre ocr err"), "1921 MORGAN SILVER DOLLAR UNITED STATES"],
    ), patch("apps.vision.services._is_gemini_in_cooldown", return_value=False), patch(
        "apps.vision.services._call_gemini_vision", side_effect=RuntimeError("gem fail")
    ), patch(
        "apps.vision.services._call_openai_compat_chat", side_effect=RuntimeError("compat fail")
    ), patch(
        "apps.vision.services._call_ollama_vision", return_value={"parsed": {"title": "Ol Coin"}, "raw": {}}
    ):
        ol_ok = services.identify_images([(prepped[0][0], "image/jpeg")], ws)
        assert ol_ok["provider_used"] == "OLLAMA"

    with patch("apps.vision.cache.lookup_image_cache", return_value=None), patch(
        "apps.vision.services.extract_text_from_images",
        side_effect=["", RuntimeError("post ocr err")],
    ), patch("apps.vision.services._is_gemini_in_cooldown", return_value=False), patch(
        "apps.vision.services._call_gemini_vision", side_effect=RuntimeError("gem fail")
    ), patch(
        "apps.vision.services._call_openai_compat_chat", side_effect=RuntimeError("compat fail")
    ), patch(
        "apps.vision.services._call_ollama_vision", return_value={"parsed": {"title": "Ol Coin"}, "raw": {}}
    ):
        assert services.identify_images([(prepped[0][0], "image/jpeg")], ws)["provider_used"] == "OLLAMA"

    # 5) Deadline expired during identify_images skips Ollama (1015-1017) & OCR fallback (1082), AND OCR fallback returning hit (1080)
    with patch("apps.vision.cache.lookup_image_cache", return_value=None), patch(
        "apps.vision.services.extract_text_from_images", return_value=""
    ), patch(
        "apps.vision.services.time.monotonic", side_effect=[0.0, 38.0, 38.0, 38.0, 38.0, 38.0, 38.0]
    ), patch("apps.vision.services._is_gemini_in_cooldown", return_value=True):
        exp_res = services.identify_images([(prepped[0][0], "image/jpeg")], ws)
        assert exp_res["provider_used"] == "MANUAL"

    with patch("apps.vision.cache.lookup_image_cache", return_value=None), patch(
        "apps.vision.services.extract_text_from_images", return_value=""
    ), patch("apps.vision.services._is_gemini_in_cooldown", return_value=True), patch(
        "apps.vision.services._call_openai_compat_chat", side_effect=RuntimeError("down")
    ), patch("apps.vision.services._call_ollama_vision", side_effect=RuntimeError("down")), patch(
        "apps.vision.services._attempt_ocr_fallback", return_value={"provider_used": "OCR_CATALOG", "candidate": {"title": "Hit"}}
    ):
        assert services.identify_images([(prepped[0][0], "image/jpeg")], ws)["provider_used"] == "OCR_CATALOG"

    # 6) _collect_item_photo_b64 empty photo skip (1130), estimate_item_value_with_ai no creds (1233), card schema (1242-1252), deadline breaks (1297, 1308), OpenRouter/Ollama error fallback (1393-1397, 1419-1422)
    ItemPhoto.objects.create(
        workspace=ws, item=item, image=SimpleUploadedFile("empty.png", b"", content_type="image/png"), label="OBVERSE", sort_order=0
    )
    assert len(services._collect_item_photo_b64(item, limit=1)) == 1
    assert len(services._collect_item_photo_b64(item, limit=2)) == 2

    empty_ws = create_default_workspace_for_user(
        User.objects.create_user(email="nocreds@example.com", password="pw"), name="NoCreds"
    )
    assert services.estimate_item_value_with_ai(item, empty_ws) == (None, {})

    import itertools

    card_item = CollectionItem.objects.create(
        workspace=ws, title="Pikachu", category="CARD", grading_service="NONE", attributes={"card_game": "Pokemon"}
    )
    with patch("apps.vision.services._is_gemini_in_cooldown", return_value=False), patch(
        "apps.vision.services.time.monotonic", side_effect=itertools.chain([0.0], itertools.repeat(39.0))
    ):
        assert services.estimate_item_value_with_ai(card_item, ws) == (None, {})

    with patch("apps.vision.services._is_gemini_in_cooldown", return_value=False), patch(
        "apps.vision.services.time.monotonic", side_effect=itertools.chain([0.0, 1.0], itertools.repeat(39.0))
    ):
        services.estimate_item_value_with_ai(card_item, ws)

    services._mark_gemini_cooldown(ws, ttl=60)
    with patch(
        "apps.vision.services._call_openai_compat_chat",
        side_effect=[RuntimeError("groq fail"), {"parsed": {"mid_usd": 45.0}, "raw": {}}],
    ):
        val_or, _ = services.estimate_item_value_with_ai(card_item, ws)
        assert val_or == Decimal("45.00")

    with patch(
        "apps.vision.services._call_openai_compat_chat", side_effect=RuntimeError("all compat fail")
    ), patch(
        "apps.vision.services._post_ollama_chat", side_effect=RuntimeError("ollama fail")
    ):
        v_none, raw_none = services.estimate_item_value_with_ai(card_item, ws)
        assert v_none is None and raw_none["gemini_quota_hit"] is True



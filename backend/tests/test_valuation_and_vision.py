from __future__ import annotations

import json
from decimal import Decimal

import httpx
import pytest
import respx
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts.models import ProviderCredential
from apps.catalog.models import CollectionItem


@pytest.mark.django_db
@respx.mock
def test_spot_refresh_melt_and_analytics(api_client, user_a, user_b):
    _, ws, token = user_a
    _, ws_b, _ = user_b
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    other_vault_coin = CollectionItem.objects.create(
        workspace=ws_b,
        category="COIN",
        title="Vault B Silver Eagle",
        metal_type="SILVER",
        weight_value=Decimal("1"),
        weight_unit="OZ_T",
        purity=Decimal("0.999"),
        melt_value_unit=Decimal("0.00"),
    )

    respx.get("https://api.gold-api.com/price/XAU").mock(
        return_value=httpx.Response(200, json={"price": 2700.00})
    )
    respx.get("https://api.gold-api.com/price/XAG").mock(
        return_value=httpx.Response(200, json={"price": 30.00})
    )
    respx.get("https://api.gold-api.com/price/XPT").mock(
        return_value=httpx.Response(200, json={"price": 950.00})
    )
    respx.get("https://api.gold-api.com/price/XPD").mock(
        return_value=httpx.Response(200, json={"price": 1000.00})
    )
    respx.get("https://api.gold-api.com/price/HG").mock(
        return_value=httpx.Response(200, json={"price": 4.38})
    )

    # Create a 1kg Copper bar and a 1oz Silver Round
    CollectionItem.objects.create(
        workspace=ws,
        category="BAR",
        title="1kg Copper Bar",
        metal_type="COPPER",
        weight_value=Decimal("1"),
        weight_unit="KG",
        purity=Decimal("0.999"),
        purchase_price=Decimal("25.00"),
    )
    CollectionItem.objects.create(
        workspace=ws,
        category="ROUND",
        title="1oz Silver Round",
        metal_type="SILVER",
        weight_value=Decimal("1"),
        weight_unit="OZ_T",
        purity=Decimal("0.999"),
        purchase_price=Decimal("28.00"),
        market_value_unit=Decimal("35.00"),
        valuation_source="MANUAL",
    )

    resp = api_client.post("/api/v1/valuation/spots/refresh", **headers)
    assert resp.status_code == 200
    assert resp.json()["SILVER"] == "30.0000"
    assert resp.json()["COPPER"] == "0.3003"

    # Vault B item was NOT mutated by Vault A's user-triggered spot refresh
    other_vault_coin.refresh_from_db()
    assert other_vault_coin.melt_value_unit == Decimal("0.00")

    # Calling refresh again within the cooldown window reuses cached snapshots without re-hitting gold-api
    resp_cached = api_client.post("/api/v1/valuation/spots/refresh", **headers)
    assert resp_cached.status_code == 200
    assert resp_cached.json()["SILVER"] == "30.0000"

    summary = api_client.get("/api/v1/analytics/summary", **headers).json()
    assert summary["gold_silver_ratio"] == "90.00"
    assert summary["total_items"] == 2
    assert Decimal(summary["total_market_value"]) > Decimal("40.00")
    assert len(summary["top_valuable_items"]) == 2


@pytest.mark.django_db
@respx.mock
def test_vision_gemini_fallback_to_ollama_and_manual(api_client, user_a):
    _, ws, token = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    # 1. No providers configured -> graceful MANUAL fallback
    img = SimpleUploadedFile("bill.jpg", b"fake-jpeg-bytes", content_type="image/jpeg")
    manual_resp = api_client.post(
        "/api/v1/vision/identify",
        data={"files": [img], "barcode_hint": "45678901"},
        **headers,
    )
    assert manual_resp.status_code == 200
    assert manual_resp.json()["provider_used"] == "MANUAL"
    assert manual_resp.json()["candidate"]["cert_number"] == "45678901"

    # 2. Configure Gemini (fails 429) + Ollama (succeeds)
    c1 = ProviderCredential(workspace=ws, provider="GEMINI")
    c1.set_secret("bad-key")
    c1.save()
    c2 = ProviderCredential(workspace=ws, provider="OLLAMA_URL")
    c2.set_secret("http://ollama.local:11434")
    c2.save()

    for m in ("gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"):
        respx.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent"
        ).mock(return_value=httpx.Response(429, json={"error": "rate limit"}))

    respx.post("http://ollama.local:11434/api/chat").mock(
        return_value=httpx.Response(
            200,
            json={
                "message": {
                    "content": json.dumps({
                        "category": "BAR",
                        "title": "Geiger 100g Silver Bar",
                        "mint_or_refiner": "Geiger Edelmetalle",
                        "metal_type": "SILVER",
                        "weight_value": 100,
                        "weight_unit": "G",
                        "purity": 0.999,
                        "cert_number": "",
                        "ai_confidence": 0.92,
                    })
                }
            },
        )
    )

    img2 = SimpleUploadedFile("geiger.jpg", b"fake-jpeg-bytes", content_type="image/jpeg")
    ollama_resp = api_client.post(
        "/api/v1/vision/identify",
        data={"files": [img2]},
        **headers,
    )
    assert ollama_resp.status_code == 200
    body = ollama_resp.json()
    assert body["provider_used"] == "OLLAMA"
    assert body["candidate"]["title"] == "Geiger 100g Silver Bar"
    assert body["candidate"]["cert_number"] == ""


@pytest.mark.django_db
@respx.mock
def test_vision_gemini_thought_part_and_large_image_normalization(api_client, user_a):
    import io

    from PIL import Image

    _, ws, token = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    c1 = ProviderCredential(workspace=ws, provider="GEMINI")
    c1.set_secret("test-gemini-secret-key")
    c1.save()

    # Simulate a large iPhone-sized image (3000x2000 PNG)
    buf = io.BytesIO()
    Image.new("RGB", (3000, 2000), color=(200, 180, 120)).save(buf, format="PNG")
    large_png = SimpleUploadedFile("iphone.png", buf.getvalue(), content_type="application/octet-stream")

    gemini_route = respx.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
    ).mock(
        return_value=httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {"thought": True, "text": "Let me examine the coin..."},
                                {
                                    "text": json.dumps({
                                        "category": "COIN",
                                        "title": "1921 Morgan Silver Dollar",
                                        "metal_type": "SILVER",
                                        "ai_confidence": 0.95,
                                    })
                                },
                            ]
                        }
                    }
                ]
            },
        )
    )

    resp = api_client.post("/api/v1/vision/identify", data={"files": [large_png]}, **headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["provider_used"] == "GEMINI"
    assert body["candidate"]["title"] == "1921 Morgan Silver Dollar"

    # Verify the payload sent to Gemini was normalized to image/jpeg and downscaled
    sent_payload = json.loads(gemini_route.calls[0].request.content)
    inline_data = sent_payload["contents"][0]["parts"][1]["inline_data"]
    assert inline_data["mime_type"] == "image/jpeg"


@pytest.mark.django_db
@respx.mock
def test_vision_reports_sanitized_provider_errors_when_all_fail(api_client, user_a):
    _, ws, token = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    c1 = ProviderCredential(workspace=ws, provider="GEMINI")
    c1.set_secret("super-secret-gemini-key")
    c1.save()
    c2 = ProviderCredential(workspace=ws, provider="OLLAMA_URL")
    c2.set_secret("http://localhost:11434")
    c2.save()

    respx.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
    ).mock(return_value=httpx.Response(400, json={"error": {"message": "API key not valid"}}))
    respx.post("http://localhost:11434/api/chat").mock(
        side_effect=httpx.ConnectError("Connection refused")
    )

    img = SimpleUploadedFile("coin.jpg", b"fake-jpeg-bytes", content_type="image/jpeg")
    resp = api_client.post("/api/v1/vision/identify", data={"files": [img]}, **headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["provider_used"] == "MANUAL"
    assert "super-secret-gemini-key" not in body["warning"]
    assert "Gemini:" in body["warning"]
    assert "Ollama:" in body["warning"]
    assert len(body["provider_errors"]) == 2


@pytest.mark.django_db
@respx.mock
def test_vision_gemini_model_cascade_and_groq_openrouter_fallback(api_client, user_a):
    _, ws, token = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    c1 = ProviderCredential(workspace=ws, provider="GEMINI")
    c1.set_secret("gemini-secret")
    c1.save()

    # 1. Gemini 2.5-flash returns 429 -> cascades to 2.5-flash-lite -> succeeds
    respx.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
    ).mock(return_value=httpx.Response(429, json={"error": "quota"}))
    respx.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent"
    ).mock(
        return_value=httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "text": json.dumps(
                                        {
                                            "category": "PAPER",
                                            "title": "$1 Silver Certificate 1957",
                                            "year": "1957",
                                            "denomination": "$1",
                                            "ai_confidence": 0.91,
                                        }
                                    )
                                }
                            ]
                        }
                    }
                ]
            },
        )
    )

    img = SimpleUploadedFile("note.jpg", b"fake-jpeg-bytes", content_type="image/jpeg")
    resp = api_client.post("/api/v1/vision/identify", data={"files": [img]}, **headers)
    assert resp.status_code == 200
    assert resp.json()["provider_used"] == "GEMINI"
    assert resp.json()["candidate"]["title"] == "$1 Silver Certificate 1957"

    # 2. All Gemini models 429 + Groq 429 -> OpenRouter succeeds
    for m in ("gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"):
        respx.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent"
        ).mock(return_value=httpx.Response(429, json={"error": "quota"}))

    c_groq = ProviderCredential(workspace=ws, provider="GROQ_API_KEY")
    c_groq.set_secret("gsk_secret_token")
    c_groq.save()
    c_or = ProviderCredential(workspace=ws, provider="OPENROUTER_API_KEY")
    c_or.set_secret("sk-or-secret-token")
    c_or.save()

    respx.post("https://api.groq.com/openai/v1/chat/completions").mock(
        return_value=httpx.Response(429, json={"error": "rate limit"})
    )
    respx.post("https://openrouter.ai/api/v1/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "category": "ROUND",
                                    "title": "1 oz Buffalo Silver Round",
                                    "metal_type": "SILVER",
                                    "weight_value": 1,
                                    "weight_unit": "OZ_T",
                                    "ai_confidence": 0.88,
                                }
                            )
                        }
                    }
                ]
            },
        )
    )

    img2 = SimpleUploadedFile("round.jpg", b"fake-jpeg-bytes-2", content_type="image/jpeg")
    resp2 = api_client.post("/api/v1/vision/identify", data={"files": [img2]}, **headers)
    assert resp2.status_code == 200
    assert resp2.json()["provider_used"] == "OPENROUTER"
    assert resp2.json()["candidate"]["title"] == "1 oz Buffalo Silver Round"


@pytest.mark.django_db
@respx.mock
def test_vision_ocr_catalog_and_text_only_fallback(api_client, user_a, monkeypatch):
    _, ws, token = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    # 1. No AI providers configured, but OCR extracts PCGS slab text + PCGS token enriches value
    c_pcgs = ProviderCredential(workspace=ws, provider="PCGS")
    c_pcgs.set_secret("pcgs-token-123")
    c_pcgs.save()

    monkeypatch.setattr(
        "apps.vision.services.extract_text_from_images",
        lambda _imgs: "PCGS\n1921 MORGAN $1\nMS65\nCERT #45678901",
    )
    respx.get("https://api.pcgs.com/publicapi/coindetails/GetCoinFactsByCertNo/45678901").mock(
        return_value=httpx.Response(200, json={"PriceGuideValue": 185.0})
    )

    img = SimpleUploadedFile("slab.jpg", b"fake-jpeg-bytes", content_type="image/jpeg")
    resp = api_client.post("/api/v1/vision/identify", data={"files": [img]}, **headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["provider_used"] in ("OCR_CATALOG", "LOCAL_CATALOG")
    assert body["candidate"]["grading_service"] == "PCGS"
    assert body["candidate"]["cert_number"] == "45678901"
    assert body["candidate"]["grade"] == "MS65"
    assert body["candidate"]["estimated_value_usd"] == 185.0

    # 2. Groq vision fails (429), OCR extracts paper note text -> Groq text-only (no image) succeeds
    c_groq = ProviderCredential(workspace=ws, provider="GROQ_API_KEY")
    c_groq.set_secret("gsk_test_key")
    c_groq.save()

    monkeypatch.setattr(
        "apps.vision.services.extract_text_from_images",
        lambda _imgs: "FEDERAL RESERVE NOTE\nONE DOLLAR\nSERIES 2017A\nB12345678C",
    )

    groq_calls = []

    def groq_handler(request):
        payload = json.loads(request.content)
        groq_calls.append(payload)
        content = payload["messages"][0]["content"]
        # First call is vision (list content with image_url) -> 429; second call is text-only (str content) -> 200
        if isinstance(content, list):
            return httpx.Response(429, json={"error": "vision quota exceeded"})
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "category": "PAPER",
                                    "title": "2017A $1 Federal Reserve Note",
                                    "country": "United States",
                                    "year": "2017A",
                                    "denomination": "$1",
                                    "serial_number": "B12345678C",
                                    "ai_confidence": 0.85,
                                }
                            )
                        }
                    }
                ]
            },
        )

    respx.post("https://api.groq.com/openai/v1/chat/completions").mock(side_effect=groq_handler)

    img2 = SimpleUploadedFile("bill.jpg", b"fake-jpeg-bytes-note", content_type="image/jpeg")
    resp2 = api_client.post("/api/v1/vision/identify", data={"files": [img2]}, **headers)
    assert resp2.status_code == 200
    body2 = resp2.json()
    assert body2["provider_used"] == "OCR_TEXT"
    assert body2["candidate"]["serial_number"] == "B12345678C"
    assert body2["candidate"]["title"] == "2017A $1 Federal Reserve Note"
    # Verify text-only tier sent text only (no image_url)
    assert isinstance(groq_calls[-1]["messages"][0]["content"], str)


def test_merge_enriched_specs_truncates_char_fields():
    from apps.catalog.models import CollectionItem
    from apps.valuation.services import _merge_enriched_specs

    item = CollectionItem(title="2025 W Eagle S$1", category="SLAB")
    _merge_enriched_specs(
        item,
        [
            (
                "AI",
                {
                    "mint_mark": "W (West Point Mint) - Extra Long Description",
                    "variety": "V" * 200,
                },
            )
        ],
    )
    assert len(item.mint_mark) <= 16
    assert item.mint_mark == "W (West Point Mi"
    assert len(item.variety) <= 120


def test_merge_enriched_specs_coerces_float_gross_weight_to_decimal():
    from decimal import Decimal

    from apps.catalog.models import CollectionItem, compute_fine_troy_oz
    from apps.valuation.services import _merge_enriched_specs

    item = CollectionItem(title="1921 Morgan Dollar", category="COIN", metal_type="SILVER", purity=Decimal("0.900000"))
    _merge_enriched_specs(item, [("AI", {"gross_weight_grams": 26.73, "diameter_mm": 38.1})])
    assert isinstance(item.gross_weight_grams, Decimal)
    assert item.gross_weight_grams == Decimal("26.73")
    fine = compute_fine_troy_oz(26.73, "G", 0.9, "SILVER")
    assert fine > Decimal("0.77")


def test_gemini_vision_models_excludes_retired_models():
    from apps.vision.services import GEMINI_VISION_MODELS

    assert "gemini-2.0-flash" not in GEMINI_VISION_MODELS
    assert "gemini-2.5-flash" in GEMINI_VISION_MODELS


def test_parse_ollama_response_handles_json_ndjson_empty_and_non_json():
    from apps.vision.services import _parse_ollama_response

    text, raw = _parse_ollama_response('{"message": {"content": "{\\"title\\": \\"Eagle\\"}"}}')
    assert '"Eagle"' in text
    assert raw["message"]["content"]

    ndjson = (
        '{"message": {"content": "{\\"title\\": "}}\n'
        '{"message": {"content": "\\"Morgan\\"}"}}\n'
    )
    nd_text, nd_raw = _parse_ollama_response(ndjson)
    assert nd_text == '{"title": "Morgan"}'
    assert len(nd_raw["chunks"]) == 2

    with pytest.raises(ValueError, match="empty response body"):
        _parse_ollama_response("   \n")

    with pytest.raises(ValueError, match="non-JSON response"):
        _parse_ollama_response("<html>502 Bad Gateway</html>")

    thinking_text, _ = _parse_ollama_response(
        '{"message": {"content": "", "thinking": "{\\"title\\": \\"Peace Dollar\\"}"}}'
    )
    assert "Peace Dollar" in thinking_text


@pytest.mark.django_db
@respx.mock
def test_identify_images_429_falls_back_to_ollama_and_marks_quota_deferred(user_a):
    from apps.accounts.crypto import encrypt_secret
    from apps.accounts.models import ProviderCredential
    from apps.vision.services import identify_images

    _, workspace, _ = user_a

    ProviderCredential.objects.create(
        workspace=workspace,
        provider=ProviderCredential.Provider.GEMINI,
        encrypted_value=encrypt_secret("gem-key"),
    )
    ProviderCredential.objects.create(
        workspace=workspace,
        provider=ProviderCredential.Provider.OLLAMA_URL,
        encrypted_value=encrypt_secret("http://ollama.local:11434"),
    )

    respx.post(url__startswith="https://generativelanguage.googleapis.com/").mock(
        return_value=httpx.Response(429, json={"error": {"code": 429, "message": "Quota exceeded"}})
    )
    ollama_route = respx.post("http://ollama.local:11434/api/chat").mock(
        return_value=httpx.Response(
            200,
            json={"message": {"content": '{"category": "COIN", "title": "1921 Morgan Dollar"}'}},
        )
    )

    res = identify_images([(b"fake-img", "image/jpeg")], workspace)
    assert res["provider_used"] == "OLLAMA"
    assert res["quota_deferred"] is True
    assert res["candidate"]["title"] == "1921 Morgan Dollar"
    sent_payload = json.loads(ollama_route.calls.last.request.content)
    assert sent_payload["format"] == "json"
    assert sent_payload["think"] is False


@pytest.mark.django_db
def test_process_deferred_ai_enrichment_task_upgrades_pending_item(user_a, monkeypatch):
    from apps.accounts.crypto import encrypt_secret
    from apps.accounts.models import ProviderCredential
    from apps.catalog.models import CollectionItem
    from apps.valuation.tasks import process_deferred_ai_enrichment_task

    _, workspace, _ = user_a

    ProviderCredential.objects.create(
        workspace=workspace,
        provider=ProviderCredential.Provider.GEMINI,
        encrypted_value=encrypt_secret("gem-key"),
    )
    item = CollectionItem.objects.create(
        workspace=workspace,
        title="1921 Morgan Dollar",
        category=CollectionItem.Category.COIN,
        ai_enrichment_pending=True,
    )

    def fake_appraise(target_item, _ws):
        target_item.ai_enrichment_pending = False
        target_item.ai_enrichment_last_error = ""
        target_item.save(update_fields=["ai_enrichment_pending", "ai_enrichment_last_error"])
        return target_item

    monkeypatch.setattr("apps.valuation.tasks.appraise_item", fake_appraise)
    summary = process_deferred_ai_enrichment_task(batch_size=5)
    item.refresh_from_db()
    assert summary == {"checked": 1, "upgraded": 1, "deferred": 0}
    assert item.ai_enrichment_pending is False


@pytest.mark.django_db
def test_goldback_candidate_normalization_and_exchange_rate_valuation(user_a, monkeypatch):
    from decimal import Decimal

    from apps.catalog.auto_sort import classify_item_deterministic
    from apps.catalog.goldback import GOLDBACK_DENOMINATION_WEIGHTS
    from apps.catalog.models import CollectionItem
    from apps.valuation.models import SpotPriceSnapshot
    from apps.valuation.services import appraise_item
    from apps.vision.services import _normalize_candidate

    # 1. All 9 denominations normalize deterministically to exact troy-ounce weights
    expected = {
        "1/4": 0.00025,
        "1/2": 0.0005,
        "1": 0.001,
        "2": 0.002,
        "5": 0.005,
        "10": 0.01,
        "25": 0.025,
        "50": 0.05,
        "100": 0.1,
    }
    assert set(GOLDBACK_DENOMINATION_WEIGHTS.keys()) == set(expected.keys())
    for denom, wt in expected.items():
        norm = _normalize_candidate({
            "category": "OTHER",
            "title": f"2026 Florida {denom} Goldback Aurum Note",
            "denomination": denom,
            "weight_value": 0.25 if denom == "1/4" else 0,
            "metal_type": "NONE",
            "purity": 0.9,
        })
        assert norm["category"] == "PAPER"
        assert norm["country"] == "United States"
        assert norm["metal_type"] == "GOLD"
        assert norm["weight_unit"] == "OZ_T"
        assert norm["purity"] == pytest.approx(0.9999)
        assert norm["weight_value"] == pytest.approx(wt)
        assert norm["denomination"] == f"{denom} Goldback"

    # 2. Auto-sort classifies Goldbacks into PAPER > United States
    _, workspace, _ = user_a
    SpotPriceSnapshot.objects.create(
        metal_type=CollectionItem.MetalType.GOLD,
        price_usd_per_troy_oz=Decimal("3840.00"),
        source="test",
    )
    gb_item = CollectionItem.objects.create(
        workspace=workspace,
        title="2026 Utah 1/4 Goldback Aurum Gold Foil Note",
        category=CollectionItem.Category.PAPER,
        series="Utah",
        denomination="1/4 Goldback",
        metal_type=CollectionItem.MetalType.GOLD,
        weight_value=Decimal("0.000250"),
        weight_unit=CollectionItem.WeightUnit.OZ_T,
        purity=Decimal("0.999900"),
    )
    sort_res = classify_item_deterministic(gb_item)
    assert sort_res.sort_category == "PAPER"
    assert sort_res.sort_subcategory == "United States"

    # 3. Inflated AI estimate ($45.00) on a 1/4 Goldback ($0.96 melt) is grounded to ~2x melt (~$1.94)
    monkeypatch.setattr(
        "apps.vision.services.estimate_item_value_with_ai",
        lambda _item, _ws: (Decimal("45.00"), {"low_usd": 30, "high_usd": 60, "photo_inspected": True}),
    )
    appraised = appraise_item(gb_item, workspace)
    assert appraised.melt_value_unit == Decimal("0.96")
    assert Decimal("1.80") <= appraised.market_value_unit <= Decimal("2.10")
    assert any("Goldback Exchange Rate benchmark" in d for d in (appraised.valuation_drivers or []))


def test_ocr_and_vision_card_normalization():
    from apps.vision.ocr import parse_ocr_numismatic_hints
    from apps.vision.services import _normalize_ai_appraisal, _normalize_candidate

    hints = parse_ocr_numismatic_hints(
        "PSA GEM MT 10\n1999 POKEMON GAME\nCHARIZARD-HOLO\n4/102\nCERT # 12345678"
    )
    assert hints["grading_service"] == "PSA"
    assert hints["grade"] == "10"
    assert hints["cert_number"] == "12345678"
    assert hints["category"] == "SLAB"
    assert hints["card_game"] == "Pokémon"
    assert hints["card_number"] == "4/102"
    assert hints["metal_type"] == "NONE"

    candidate = _normalize_candidate(
        {
            "category": "CARD",
            "title": "Charizard Holo",
            "card_game": "Pokémon",
            "set_name": "Base Set",
            "card_number": "4/102",
            "metal_type": "GOLD",
            "weight_value": 1,
        }
    )
    assert candidate["category"] == "CARD"
    assert candidate["metal_type"] == "NONE"
    assert candidate["weight_value"] == 0
    assert candidate["card_game"] == "Pokémon"

    val, normalized = _normalize_ai_appraisal(
        {
            "low_usd": 220,
            "mid_usd": 260,
            "high_usd": 310,
            "estimated_grade": "8",
            "estimated_grade_range": "7-8.5",
            "raw_condition": "NM",
            "estimated_grade_rationale": "Clean holo, slight back whitening on top-right corner.",
            "grading_upside_usd": 140,
            "valuation_drivers": ["Base Set holo demand"],
        },
        photo_inspected=True,
        is_raw_gradeable=True,
    )
    assert val == Decimal("260.00")
    assert normalized["estimated_grade"] == "8"
    assert normalized["raw_condition"] == "NM"
    assert normalized["grading_upside_usd"] == "140.00"







@pytest.mark.django_db
def test_reappraise_stale_items_preserves_user_locked_value(monkeypatch):
    from datetime import timedelta
    from decimal import Decimal

    from django.contrib.auth import get_user_model
    from django.utils import timezone

    from apps.accounts.models import Workspace
    from apps.catalog.models import CollectionItem
    from apps.valuation.models import SpotPriceSnapshot
    from apps.valuation.tasks import reappraise_stale_items

    owner = get_user_model().objects.create_user(email="stale_owner@example.com")
    ws = Workspace.objects.create(name="Stale Test WS", slug="stale-test-ws", owner=owner)
    SpotPriceSnapshot.objects.create(
        metal_type=CollectionItem.MetalType.SILVER,
        price_usd_per_troy_oz=Decimal("30.00"),
        source="test",
    )
    stale_time = timezone.now() - timedelta(days=10)
    locked_item = CollectionItem.objects.create(
        workspace=ws,
        title="Locked Silver Eagle",
        category=CollectionItem.Category.COIN,
        metal_type=CollectionItem.MetalType.SILVER,
        weight_value=Decimal("1.0000"),
        weight_unit="OZT",
        purity=Decimal("1.0000"),
        market_value_unit=Decimal("99.00"),
        specs_provenance={"market_value_unit": "USER"},
        valued_at=stale_time,
    )
    CollectionItem.objects.filter(id=locked_item.id).update(fine_troy_oz=Decimal("1.0000"))

    result = reappraise_stale_items(stale_days=7, batch_size=10)
    locked_item.refresh_from_db()
    assert result["skipped_locked"] == 1
    assert locked_item.market_value_unit == Decimal("99.00")
    assert locked_item.melt_value_unit == Decimal("30.00")


@pytest.mark.django_db
def test_valuation_api_models_tasks_and_services_edges(api_client, user_a):
    from datetime import timedelta
    from decimal import Decimal
    from types import SimpleNamespace
    from unittest.mock import patch

    from django.utils import timezone
    from ninja.errors import HttpError

    from apps.accounts.models import ProviderCredential
    from apps.catalog.models import CollectionItem
    from apps.valuation.models import SpotPriceSnapshot
    from apps.valuation.services import (
        _clean_item_title,
        _merge_enriched_specs,
        _run_appraisal_job_thread,
        appraise_item,
        compute_portfolio_summary,
        start_appraisal_job,
    )
    from apps.valuation.tasks import (
        process_deferred_ai_enrichment_task,
        reappraise_stale_items,
        reappraise_stale_items_task,
        refresh_spot_prices_task,
    )
    from apps.vision.api import identify_item_from_photos

    owner, ws, token = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    # Vision empty files 400 (apps/vision/api.py line 21)
    with pytest.raises(HttpError) as exc_info:
        identify_item_from_photos(SimpleNamespace(workspace=ws, user=owner, workspace_role="OWNER"), files=[])
    assert exc_info.value.status_code == 400

    # Valuation API spots + cert-url + SpotPriceSnapshot.__str__
    snap = SpotPriceSnapshot.objects.create(
        metal_type="GOLD", price_usd_per_troy_oz=Decimal("2650.00"), source="test"
    )
    assert "GOLD" in str(snap)
    assert api_client.get("/api/v1/valuation/spots", **headers).status_code == 200
    coin = CollectionItem.objects.create(
        workspace=ws,
        title="1921 Morgan Dollar",
        category="SLAB",
        metal_type="SILVER",
        weight_value=Decimal("0.7734"),
        grading_service="PCGS",
        cert_number="44556677",
    )
    cert_resp = api_client.get(f"/api/v1/valuation/items/{coin.id}/cert-url", **headers)
    assert cert_resp.status_code == 200 and "pcgs.com" in cert_resp.json()["url"]

    # Helper checks: _merge_enriched_specs & _clean_item_title
    _merge_enriched_specs(
        coin,
        [("NONE", {}), ("NUMISTA", {"catalog_numbers": {"KM": "110", "empty": ""}})],
    )
    assert coin.catalog_numbers.get("KM") == "110"
    assert _clean_item_title("") == ""
    assert _clean_item_title("RARE!! ms65 1889-o morgan") == "MS65 1889-O Morgan"

    # Full appraise_item exercising BYOK guides + active-ask downgrade + invalid grading_upside_usd
    for prov, val in [
        ("PCGS", "pcgs-t"),
        ("GREYSHEET_KEY", "gs-k"),
        ("GREYSHEET_TOKEN", "gs-t"),
        ("NUMISMEDIA_KEY", "nm-k"),
        ("NUMISTA_KEY", "num-k"),
        ("EBAY_CLIENT_ID", "eb-id"),
        ("EBAY_CLIENT_SECRET", "eb-sec"),
        ("PRICECHARTING_API_KEY", "pc-k"),
        ("TCGPLAYER_CLIENT_ID", "tcg-id"),
        ("TCGPLAYER_CLIENT_SECRET", "tcg-sec"),
        ("COLLECTR_API_KEY", "col-k"),
    ]:
        c, _ = ProviderCredential.objects.get_or_create(workspace=ws, provider=prov, defaults={"encrypted_value": ""})
        c.set_secret(val)
        c.save()

    with patch(
        "apps.valuation.services.lookup_cert_metadata",
        return_value={"source": "PCGS", "market_value": "250.00", "specs": {"mintage": 1000}},
    ), patch(
        "apps.valuation.services.lookup_greysheet",
        return_value={"source": "GREYSHEET", "market_value": "260.00"},
    ), patch(
        "apps.valuation.services.lookup_numismedia",
        return_value={"source": "NUMISMEDIA", "market_value": "255.00"},
    ), patch(
        "apps.valuation.services.lookup_numista_specs",
        return_value={"specs": {"designer": "George T. Morgan"}},
    ), patch(
        "apps.valuation.services.lookup_ebay_sold_comps",
        return_value={
            "source": "EBAY_ACTIVE_ASK",
            "is_ask": True,
            "low": Decimal("240.00"),
            "median": Decimal("275.00"),
            "high": Decimal("300.00"),
            "count": 4,
        },
    ), patch(
        "apps.vision.services.estimate_item_value_with_ai",
        return_value=(
            Decimal("245.00"),
            {
                "ai_provider": "GEMINI",
                "collectibility_tier": "NUMISMATIC",
                "grading_upside_usd": "bad_dec",
                "normalized_title": "1921 Morgan Silver Dollar PCGS",
                "inferred_specs": {"variety": "VAM-1"},
            },
        ),
    ):
        updated = appraise_item(coin, ws)
        assert updated.market_value_unit == Decimal("250.00")
        assert updated.valuation_confidence == CollectionItem.ValuationConfidence.HIGH

    # Appraise MTG card exercising card guides & EBAY_ACTIVE_ASK downgrade branch
    mtg = CollectionItem.objects.create(
        workspace=ws,
        title="Black Lotus",
        category="CARD",
        metal_type="NONE",
        attributes={"card_game": "Magic: The Gathering", "set_code": "LEA"},
    )
    with patch(
        "apps.valuation.services.lookup_scryfall_card",
        return_value={"source": "SCRYFALL", "market_value": "5000.00", "catalog_numbers": {"scryfall_id": "abc"}, "specs": {"rarity": "Rare"}},
    ), patch(
        "apps.valuation.services.lookup_pricecharting_card",
        return_value={"source": "PRICECHARTING", "market_value": "5100.00"},
    ), patch(
        "apps.valuation.services.lookup_tcgplayer_price",
        return_value={"source": "TCGPLAYER", "market_value": "4900.00"},
    ), patch(
        "apps.valuation.services.lookup_collectr_price",
        return_value={"source": "COLLECTR", "market_value": "5050.00"},
    ), patch(
        "apps.valuation.services.lookup_ebay_sold_comps",
        return_value={"source": "EBAY_ACTIVE_ASK", "is_ask": True, "low": Decimal("4800.00"), "median": Decimal("5200.00"), "high": Decimal("5500.00"), "count": 5},
    ), patch(
        "apps.vision.services.estimate_item_value_with_ai",
        return_value=(None, {"gemini_quota_hit": True}),
    ):
        mtg_res = appraise_item(mtg, ws)
        assert mtg_res.ai_enrichment_pending is True
        assert mtg_res.market_value_unit == Decimal("5000.00")

    # Quota-hit card with NO price guides at all saves ai_enrichment_pending (lines 711-719)
    raw_coin = CollectionItem.objects.create(
        workspace=ws, title="Mystery Token", category="OTHER", metal_type="NONE"
    )
    with patch("apps.valuation.services.lookup_ebay_sold_comps", return_value=None), patch(
        "apps.vision.services.estimate_item_value_with_ai",
        return_value=(None, {"gemini_quota_hit": True}),
    ):
        appraise_item(raw_coin, ws)
        raw_coin.refresh_from_db()
        assert raw_coin.ai_enrichment_pending is True

    # Async start_appraisal_job thread launch + _run_appraisal_job_thread failure path
    with patch("threading.Thread.start") as mock_t:
        start_appraisal_job(raw_coin, ws, sync=False)
        assert mock_t.called
    _run_appraisal_job_thread("00000000-0000-0000-0000-000000000099")

    # Portfolio summary includes NONE metal item skip
    summary = compute_portfolio_summary(ws)
    assert summary["unique_entries"] >= 2

    # Tasks coverage: refresh_spot_prices_task, process_deferred_ai_enrichment_task, reappraise_stale_items_task
    with patch("apps.valuation.tasks.refresh_spot_prices", return_value={"GOLD": Decimal("2650.00")}):
        assert refresh_spot_prices_task()["GOLD"] == "2650.00"

    # Pending deferred task skips item without GEMINI, then handles still-pending + error
    assert process_deferred_ai_enrichment_task()["checked"] >= 1
    gem, _ = ProviderCredential.objects.get_or_create(workspace=ws, provider="GEMINI", defaults={"encrypted_value": ""})
    gem.set_secret("AIzaDeferredKey")
    gem.save()
    with patch("apps.valuation.tasks.appraise_item", side_effect=RuntimeError("boom")):
        res_err = process_deferred_ai_enrichment_task(batch_size=5)
        assert res_err["deferred"] >= 1
    with patch("apps.valuation.tasks.appraise_item", return_value=raw_coin):
        res_still = process_deferred_ai_enrichment_task(batch_size=5)
        assert res_still["deferred"] == 1

    # reappraise_stale_items error branches + reappraise_stale_items_task
    CollectionItem.objects.filter(id=raw_coin.id).update(valued_at=timezone.now() - timedelta(days=30))
    CollectionItem.objects.filter(id=mtg.id).update(
        specs_provenance={"market_value_unit": "USER"},
        valued_at=timezone.now() - timedelta(days=30),
    )
    with patch(
        "apps.valuation.tasks.refresh_item_melt_from_latest_spot", side_effect=RuntimeError("melt fail")
    ), patch("apps.valuation.tasks.appraise_item", side_effect=RuntimeError("appraise fail")):
        stale_err = reappraise_stale_items_task(stale_days=7, batch_size=10)
        assert stale_err["failed"] >= 2
    CollectionItem.objects.filter(id=raw_coin.id).update(valued_at=timezone.now() - timedelta(days=30))
    with patch("apps.valuation.tasks.appraise_item", return_value=raw_coin):
        assert reappraise_stale_items(stale_days=7, batch_size=10)["reappraised"] >= 1

    # Remaining valuation/services.py branches: 277, 414, 458, 471, 553-554, 616, 622, 655-656
    # 1) Yu-Gi-Oh card guide returns None (277); LINK_ONLY cert (414); realized comp is_ask=False (458)
    ygo = CollectionItem.objects.create(
        workspace=ws,
        title="Dark Magician",
        category="CARD",
        metal_type="NONE",
        grading_service="PSA",
        cert_number="11223344",
        attributes={"card_game": "Yu-Gi-Oh!"},
    )
    with patch(
        "apps.valuation.services.lookup_cert_metadata",
        return_value={"source": "PSA", "market_value": None, "verification_url": "https://psacard.com/cert/11223344"},
    ), patch("apps.valuation.services.lookup_pricecharting_card", return_value=None), patch(
        "apps.valuation.services.lookup_tcgplayer_price", return_value=None
    ), patch("apps.valuation.services.lookup_collectr_price", return_value=None), patch(
        "apps.valuation.services.lookup_ebay_sold_comps",
        return_value={"source": "COMPS", "is_ask": False, "low": "40.00", "median": "50.00", "high": "60.00", "count": 4},
    ), patch("apps.vision.services.estimate_item_value_with_ai", return_value=(None, {})):
        appraise_item(ygo, ws)

    # 2) Active-ask only quote (471) + fallback 0.90/1.10 low/high range (553-554) + invalid grading_upside_usd on RAW coin (655-656)
    raw_silver = CollectionItem.objects.create(
        workspace=ws,
        title="1921 Peace Dollar",
        category="COIN",
        metal_type="SILVER",
        weight_value=Decimal("0.7734"),
        grading_service="NONE",
    )
    with patch("apps.valuation.services.get_latest_spot_map", return_value={"SILVER": Decimal("30.00")}), patch(
        "apps.valuation.services.lookup_greysheet", return_value=None
    ), patch("apps.valuation.services.lookup_numismedia", return_value=None), patch(
        "apps.valuation.services.lookup_numista_specs", return_value=None
    ), patch("apps.valuation.services.lookup_ebay_sold_comps", return_value=None), patch(
        "apps.vision.services.estimate_item_value_with_ai",
        return_value=(Decimal("25.00"), {"grading_upside_usd": "bad_dec"}),
    ):
        # AI value ($25) <= melt ($23.20*1.15) -> BULLION tier (622), plus SPOT_MELT only test (616)
        raw_silver_res = appraise_item(raw_silver, ws)
        assert raw_silver_res.collectibility_tier == CollectionItem.CollectibilityTier.BULLION

    # Active-ask only with no low/high triggers 471 and 553-554
    ask_only = CollectionItem.objects.create(workspace=ws, title="Bronze Medal", category="OTHER", metal_type="NONE")
    with patch(
        "apps.valuation.services.lookup_ebay_sold_comps",
        return_value={"source": "EBAY_ACTIVE_ASK", "is_ask": True, "low": None, "median": Decimal("40.00"), "high": None, "count": 2},
    ), patch("apps.vision.services.estimate_item_value_with_ai", return_value=(None, {})):
        ask_res = appraise_item(ask_only, ws)
        assert ask_res.market_value_low == Decimal("36.00")
        assert ask_res.market_value_high == Decimal("44.00")

    # SPOT_MELT primary source hits tier=BULLION line 616
    melt_only = CollectionItem.objects.create(
        workspace=ws, title="Silver Bar", category="BAR", metal_type="SILVER", weight_value=Decimal("10.0000")
    )
    with patch("apps.valuation.services.get_latest_spot_map", return_value={"SILVER": Decimal("30.00")}), patch(
        "apps.valuation.services.lookup_greysheet", return_value=None
    ), patch("apps.valuation.services.lookup_numismedia", return_value=None), patch(
        "apps.valuation.services.lookup_numista_specs", return_value=None
    ), patch("apps.valuation.services.lookup_ebay_sold_comps", return_value=None), patch(
        "apps.vision.services.estimate_item_value_with_ai", return_value=(None, {})
    ):
        melt_res = appraise_item(melt_only, ws)
        assert melt_res.valuation_source == CollectionItem.ValuationSource.SPOT_MELT
        assert melt_res.collectibility_tier == CollectionItem.CollectibilityTier.BULLION


@pytest.mark.django_db
@respx.mock
def test_infer_image_mime_and_vision_heic_support(api_client, user_a):
    import io

    from PIL import Image

    from apps.vision.services import _infer_image_mime

    # 1. Test all branches of _infer_image_mime
    assert _infer_image_mime(b"\x00\x00\x00\x18ftypheic", None) == "image/heic"
    assert _infer_image_mime(b"\x00\x00\x00\x18ftypheif", None) == "image/heif"
    assert _infer_image_mime(b"\x00\x00\x00\x18ftypavif", None) == "image/avif"
    assert _infer_image_mime(b"BM\x00\x00\x00", None) == "image/bmp"
    assert _infer_image_mime(b"II*\x00\x00", None) == "image/tiff"
    assert _infer_image_mime(b"MM\x00*\x00", None) == "image/tiff"
    assert _infer_image_mime(b"GIF87a\x00", None) == "image/gif"
    assert _infer_image_mime(b"GIF89a\x00", None) == "image/gif"
    assert _infer_image_mime(b"\x89PNG\r\n\x1a\n", None) == "image/png"
    assert _infer_image_mime(b"RIFF\x00\x00\x00\x00WEBP", None) == "image/webp"
    assert _infer_image_mime(b"\xff\xd8\xff\xe0", None) == "image/jpeg"
    assert _infer_image_mime(b"unknown-data", "image/png") == "image/png"
    assert _infer_image_mime(b"unknown-data", "application/octet-stream") == "image/jpeg"

    # 2. Test identify API with HEIC file
    _, ws, token = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    c = ProviderCredential(workspace=ws, provider="GEMINI")
    c.set_secret("test-gemini-key")
    c.save()

    respx.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
    ).mock(
        return_value=httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "text": json.dumps(
                                        {
                                            "category": "COIN",
                                            "title": "1881-S Morgan Silver Dollar",
                                            "year": "1881",
                                            "country": "United States",
                                            "metal_type": "SILVER",
                                            "weight_value": 0.7734,
                                            "weight_unit": "OZ_T",
                                            "purity": 0.9,
                                            "grading_service": "NONE",
                                            "estimated_grade": "MS-65",
                                            "ai_confidence": 0.95,
                                            "notes": "Sharp strike, frosty luster.",
                                        }
                                    )
                                }
                            ]
                        }
                    }
                ]
            },
        )
    )

    heif_buf = io.BytesIO()
    Image.new("RGB", (100, 100), (200, 100, 50)).save(heif_buf, format="HEIF")
    heif_img = SimpleUploadedFile("slab.heic", heif_buf.getvalue(), content_type="application/octet-stream")

    resp = api_client.post(
        "/api/v1/vision/identify",
        data={"files": [heif_img], "intake_mode": "upload"},
        **headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["provider_used"] == "GEMINI"
    assert data["candidate"]["title"] == "1881-S Morgan Silver Dollar"




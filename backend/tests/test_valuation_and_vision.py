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
def test_spot_refresh_melt_and_analytics(api_client, user_a):
    _, ws, token = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

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

    img2 = SimpleUploadedFile("round.jpg", b"fake-jpeg-bytes", content_type="image/jpeg")
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
    assert body["provider_used"] == "OCR_CATALOG"
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

    img2 = SimpleUploadedFile("bill.jpg", b"fake-jpeg-bytes", content_type="image/jpeg")
    resp2 = api_client.post("/api/v1/vision/identify", data={"files": [img2]}, **headers)
    assert resp2.status_code == 200
    body2 = resp2.json()
    assert body2["provider_used"] == "OCR_TEXT"
    assert body2["candidate"]["serial_number"] == "B12345678C"
    assert body2["candidate"]["title"] == "2017A $1 Federal Reserve Note"
    # Verify second call sent text only (no image_url)
    assert isinstance(groq_calls[1]["messages"][0]["content"], str)


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





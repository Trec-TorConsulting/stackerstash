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

    respx.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
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


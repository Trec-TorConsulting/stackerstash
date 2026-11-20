import json
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts.models import ProviderCredential, Workspace
from apps.catalog.models import CollectionItem, ItemPhoto
from apps.vision.services import estimate_item_value_with_ai, extract_grounding_market_comps


@pytest.mark.django_db
@patch("apps.vision.services.httpx.Client")
def test_estimate_item_value_with_ai_attaches_photos(mock_client_cls):
    user = get_user_model().objects.create_user(email="ai1@example.com", password="pw")
    ws = Workspace.objects.create(name="Test Vault", slug="test-vault-ai-photos", owner=user)
    cred = ProviderCredential(workspace=ws, provider=ProviderCredential.Provider.GEMINI)
    cred.set_secret("fake-gemini-key")
    cred.save()

    item = CollectionItem.objects.create(
        workspace=ws,
        category=CollectionItem.Category.COIN,
        title="1893-S Morgan Dollar",
        year="1893",
        mint_mark="S",
        metal_type=CollectionItem.MetalType.SILVER,
        weight_value=Decimal("0.7734"),
    )
    ItemPhoto.objects.create(
        workspace=ws,
        item=item,
        label=ItemPhoto.Label.OBVERSE,
        image=SimpleUploadedFile("obv.jpg", b"fake-jpeg-bytes", content_type="image/jpeg"),
    )

    mock_resp = MagicMock()
    mock_resp.raise_for_status.return_value = None
    mock_resp.json.return_value = {
        "candidates": [
            {
                "groundingMetadata": {
                    "groundingChunks": [
                        {"web": {"title": "PCGS Price Guide 1893-S", "uri": "https://www.pcgs.com/coinfacts"}}
                    ]
                },
                "content": {
                    "parts": [
                        {
                            "text": json.dumps(
                                {
                                    "low_usd": 3500,
                                    "mid_usd": 4200,
                                    "high_usd": 5000,
                                    "valuation_drivers": ["Key date 1893-S Morgan", "Original surfaces"],
                                    "collectibility_tier": "KEY_DATE_COLLECTIBLE",
                                    "hold_outlook": "Strong long-term hold; consider PCGS grading.",
                                    "inferred_specs": {"mintage": 100000, "diameter_mm": 38.1},
                                    "estimated_grade": "VF25",
                                    "estimated_grade_range": "VF20-VF30",
                                    "estimated_grade_rationale": "Even wear on Liberty cheek and eagle breast.",
                                    "grading_upside_usd": 450,
                                }
                            )
                        }
                    ]
                },
            }
        ]
    }
    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.post.return_value = mock_resp
    mock_client_cls.return_value = mock_client

    val, payload = estimate_item_value_with_ai(item, ws)
    assert val == Decimal("4200.00")
    assert payload["photo_inspected"] is True
    assert payload["collectibility_tier"] == "KEY_DATE_COLLECTIBLE"
    assert payload["low_usd"] == "3500.00"
    assert payload["high_usd"] == "5000.00"
    assert payload["estimated_grade"] == "VF25"
    assert payload["estimated_grade_range"] == "VF20-VF30"
    assert payload["grading_upside_usd"] == "450.00"
    assert len(payload["grounded_sources"]) == 1
    assert "Key date 1893-S Morgan" in payload["valuation_drivers"]
    # Verify inlineData was sent in Gemini payload
    sent_json = mock_client.post.call_args.kwargs["json"]
    parts = sent_json["contents"][0]["parts"]
    assert len(parts) == 2
    assert "inlineData" in parts[1]


@pytest.mark.django_db
@patch("apps.vision.services.httpx.Client")
def test_estimate_item_value_with_ai_text_only_fallback(mock_client_cls):
    user = get_user_model().objects.create_user(email="ai2@example.com", password="pw")
    ws = Workspace.objects.create(name="Test Vault 2", slug="test-vault-ai-text", owner=user)
    cred = ProviderCredential(workspace=ws, provider=ProviderCredential.Provider.GEMINI)
    cred.set_secret("fake-gemini-key")
    cred.save()

    item = CollectionItem.objects.create(
        workspace=ws,
        category=CollectionItem.Category.COIN,
        title="2024 American Silver Eagle",
        year="2024",
        metal_type=CollectionItem.MetalType.SILVER,
        weight_value=Decimal("1.0"),
    )

    mock_resp = MagicMock()
    mock_resp.raise_for_status.return_value = None
    mock_resp.json.return_value = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": json.dumps(
                                {
                                    "low_usd": 33,
                                    "mid_usd": 36,
                                    "high_usd": 40,
                                    "valuation_drivers": ["1 oz .999 fine silver bullion"],
                                    "collectibility_tier": "BULLION",
                                    "hold_outlook": "Tracks spot silver closely.",
                                }
                            )
                        }
                    ]
                }
            }
        ]
    }
    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.post.return_value = mock_resp
    mock_client_cls.return_value = mock_client

    val, payload = estimate_item_value_with_ai(item, ws)
    assert val == Decimal("36.00")
    assert payload["photo_inspected"] is False
    assert any("not visually inspected" in d for d in payload["valuation_drivers"])


@pytest.mark.django_db
def test_estimate_item_value_with_ai_cascades_on_429_and_downscales_photos(respx_mock):
    import base64
    import io

    import httpx
    from PIL import Image

    user = get_user_model().objects.create_user(email="ai3@example.com", password="pw")
    ws = Workspace.objects.create(name="Test Vault 3", slug="test-vault-ai-cascade", owner=user)
    cred = ProviderCredential(workspace=ws, provider=ProviderCredential.Provider.GEMINI)
    cred.set_secret("fake-gemini-key")
    cred.save()

    buf = io.BytesIO()
    Image.new("RGB", (2400, 1800), color=(210, 190, 140)).save(buf, format="PNG")

    item = CollectionItem.objects.create(
        workspace=ws,
        category=CollectionItem.Category.COIN,
        title="1921 Peace Dollar",
        year="1921",
        metal_type=CollectionItem.MetalType.SILVER,
        weight_value=Decimal("0.7734"),
    )
    ItemPhoto.objects.create(
        workspace=ws,
        item=item,
        label=ItemPhoto.Label.OBVERSE,
        image=SimpleUploadedFile("large_obv.png", buf.getvalue(), content_type="image/png"),
    )

    flash_route = respx_mock.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
    ).mock(return_value=httpx.Response(429, json={"error": {"message": "Quota exceeded"}}))

    lite_route = respx_mock.post(
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
                                            "low_usd": 140,
                                            "mid_usd": 175,
                                            "high_usd": 220,
                                            "valuation_drivers": ["High relief 1921 Peace Dollar"],
                                            "collectibility_tier": "KEY_DATE_COLLECTIBLE",
                                            "hold_outlook": "Key first-year issue.",
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

    val, payload = estimate_item_value_with_ai(item, ws)
    assert val == Decimal("175.00")
    assert payload["photo_inspected"] is True
    # Short-circuited ungrounded retry on 429: only 1 call to gemini-2.5-flash, then cascaded to lite
    assert flash_route.call_count == 1
    assert lite_route.call_count == 1

    # Verify sent photo was downscaled <= 1024px and converted to JPEG
    sent_json = json.loads(lite_route.calls[0].request.content)
    inline_data = sent_json["contents"][0]["parts"][1]["inlineData"]
    assert inline_data["mimeType"] == "image/jpeg"
    decoded = Image.open(io.BytesIO(base64.b64decode(inline_data["data"])))
    assert max(decoded.size) <= 1024


@pytest.mark.django_db
def test_estimate_item_value_with_ai_falls_back_to_groq_when_gemini_exhausted(respx_mock):
    import httpx

    user = get_user_model().objects.create_user(email="ai4@example.com", password="pw")
    ws = Workspace.objects.create(name="Test Vault 4", slug="test-vault-ai-groq", owner=user)
    c1 = ProviderCredential(workspace=ws, provider=ProviderCredential.Provider.GEMINI)
    c1.set_secret("fake-gemini-key")
    c1.save()
    c2 = ProviderCredential(workspace=ws, provider=ProviderCredential.Provider.GROQ_API_KEY)
    c2.set_secret("gsk_test_groq_key")
    c2.save()

    item = CollectionItem.objects.create(
        workspace=ws,
        category=CollectionItem.Category.COIN,
        title="2024 American Silver Eagle",
        year="2024",
        metal_type=CollectionItem.MetalType.SILVER,
        weight_value=Decimal("1.0"),
    )

    for m in ("gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"):
        respx_mock.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent"
        ).mock(return_value=httpx.Response(429, json={"error": "quota"}))

    groq_route = respx_mock.post("https://api.groq.com/openai/v1/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "low_usd": 34,
                                    "mid_usd": 38,
                                    "high_usd": 42,
                                    "valuation_drivers": ["1 oz .999 silver"],
                                    "collectibility_tier": "BULLION",
                                    "hold_outlook": "Liquid bullion.",
                                }
                            )
                        }
                    }
                ]
            },
        )
    )

    val, payload = estimate_item_value_with_ai(item, ws)
    assert val == Decimal("38.00")
    assert groq_route.call_count == 1


def test_extract_grounding_market_comps_empty():
    assert extract_grounding_market_comps([]) is None
    assert extract_grounding_market_comps([], "") is None
    assert extract_grounding_market_comps([{"title": "No prices here", "uri": "https://example.com"}]) is None


def test_extract_grounding_market_comps_from_citations():
    citations = [
        {"title": "1881-S Morgan Dollar MS65 - Sold for $185.00 on eBay", "uri": "https://ebay.com/itm/1"},
        {"title": "1881-S Morgan Dollar MS65 - Realized $195.00 at Heritage", "uri": "https://ha.com/itm/2"},
        {"title": "Buy 1881-S Morgan Dollar MS65 PCGS - $210.00 Active Listing", "uri": "https://ebay.com/itm/3"},
    ]
    comps = extract_grounding_market_comps(citations)
    assert comps is not None
    assert comps["source"] == "SEARCH_GROUNDING"
    assert comps["is_blended"] is True
    assert comps["count"] == 3
    assert comps["sold"]["count"] == 2
    assert comps["sold"]["median"] == Decimal("190.00")
    assert comps["active_ask"]["count"] == 1
    assert comps["active_ask"]["mean"] == Decimal("210.00")
    assert comps["median"] == Decimal("195.00")
    assert comps["raw"]["tier"] == "SEARCH_GROUNDING"


def test_extract_grounding_market_comps_from_text_fallback():
    text = """
    Market summary for 1928 $50 Gold Certificate:
    Recent eBay sold comps show $650.00 and $700.00 realized prices.
    Active dealer asking price is $750.00 on Heritage Auctions.
    """
    comps = extract_grounding_market_comps([], text_context=text)
    assert comps is not None
    assert comps["source"] == "SEARCH_GROUNDING"
    assert comps["is_blended"] is True
    assert comps["sold"]["count"] == 2
    assert comps["active_ask"]["count"] == 1
    assert comps["value"] == Decimal("700.00")


@pytest.mark.django_db
@patch("apps.vision.services.httpx.Client")
def test_estimate_item_value_with_ai_extracts_grounded_comps(mock_client_cls):
    user = get_user_model().objects.create_user(email="ai_grounded@example.com", password="pw")
    ws = Workspace.objects.create(name="Test Vault Grounded", slug="test-vault-grounded", owner=user)
    cred = ProviderCredential(workspace=ws, provider=ProviderCredential.Provider.GEMINI)
    cred.set_secret("fake-gemini-key")
    cred.save()

    item = CollectionItem.objects.create(
        workspace=ws,
        category=CollectionItem.Category.COIN,
        title="1881-S Morgan Dollar",
        year="1881",
        mint_mark="S",
        metal_type=CollectionItem.MetalType.SILVER,
        weight_value=Decimal("0.7734"),
    )

    mock_resp = MagicMock()
    mock_resp.raise_for_status.return_value = None
    mock_resp.json.return_value = {
        "candidates": [
            {
                "groundingMetadata": {
                    "groundingChunks": [
                        {"web": {"title": "1881-S Morgan Dollar MS65 - Sold for $180.00", "uri": "https://ebay.com/1"}},
                        {"web": {"title": "1881-S Morgan Dollar MS65 - Realized $190.00", "uri": "https://ha.com/2"}},
                    ]
                },
                "content": {
                    "parts": [
                        {
                            "text": json.dumps(
                                {
                                    "low_usd": 170,
                                    "mid_usd": 185,
                                    "high_usd": 200,
                                    "valuation_drivers": ["Gem BU 1881-S"],
                                    "collectibility_tier": "NUMISMATIC",
                                }
                            )
                        }
                    ]
                },
            }
        ]
    }
    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.post.return_value = mock_resp
    mock_client_cls.return_value = mock_client

    val, payload = estimate_item_value_with_ai(item, ws)
    assert val == Decimal("185.00")
    assert payload["grounded_comps"] is not None
    assert payload["grounded_comps"]["source"] == "SEARCH_GROUNDING"
    assert payload["grounded_comps"]["count"] == 2
    assert payload["grounded_comps"]["median"] == Decimal("185.00")


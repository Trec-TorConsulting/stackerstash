import json
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts.models import ProviderCredential, Workspace
from apps.catalog.models import CollectionItem, ItemPhoto
from apps.vision.services import estimate_item_value_with_ai


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

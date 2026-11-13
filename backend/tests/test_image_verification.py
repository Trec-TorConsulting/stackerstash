import io
import json
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth import get_user_model
from PIL import Image, ImageDraw

from apps.accounts.models import ProviderCredential, Workspace
from apps.catalog.image_processing import analyze_image_quality_and_forensics
from apps.vision.services import identify_images


def _make_sharp_coin_bytes(size: tuple[int, int] = (600, 600)) -> bytes:
    img = Image.new("RGB", size, (220, 220, 220))
    draw = ImageDraw.Draw(img)
    draw.ellipse((120, 120, 480, 480), fill=(180, 140, 60), outline=(40, 30, 10), width=6)
    for r in range(150, 450, 30):
        draw.line((r, 200, r, 400), fill=(60, 45, 15), width=3)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    return buf.getvalue()


def test_analyze_image_flags_low_resolution_and_blur():
    tiny = Image.new("RGB", (200, 200), (120, 120, 120))
    buf = io.BytesIO()
    tiny.save(buf, format="JPEG")
    res = analyze_image_quality_and_forensics(buf.getvalue(), mode="camera")
    assert res["status"] == "FLAGGED"
    assert any("Low resolution" in w for w in res["warnings"])
    assert any("blurry" in w.lower() for w in res["warnings"])


def test_analyze_upload_flags_photoshop_exif_and_moire():
    img = Image.new("RGB", (500, 500), (120, 120, 120))
    px = img.load()
    for y in range(500):
        for x in range(500):
            # High-frequency alternating grid simulating screen moire
            v = 200 if x % 2 == 0 else 80
            px[x, y] = (v, v, v)
    exif = img.getexif()
    exif[0x0131] = "Adobe Photoshop 25.0"
    buf = io.BytesIO()
    img.save(buf, format="PNG", exif=exif.tobytes())
    res = analyze_image_quality_and_forensics(buf.getvalue(), mode="upload")
    assert res["status"] == "FLAGGED"
    assert any("software editing" in w.lower() for w in res["warnings"])
    assert any("moiré" in w.lower() or "screen" in w.lower() for w in res["warnings"])


@pytest.mark.django_db
@patch("apps.vision.services.httpx.Client")
def test_identify_images_returns_verification_status_and_pic_of_pic_flag(mock_client_cls):
    user = get_user_model().objects.create_user(email="verify@example.com", password="pw")
    ws = Workspace.objects.create(name="Verify Vault", slug="verify-vault", owner=user)
    cred = ProviderCredential(workspace=ws, provider=ProviderCredential.Provider.GEMINI)
    cred.set_secret("fake-gemini-key")
    cred.save()

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
                                    "category": "COIN",
                                    "title": "1921 Morgan Dollar",
                                    "authenticity": {
                                        "is_physical_item": False,
                                        "is_pic_of_pic": True,
                                        "is_synthetic_or_edited": False,
                                        "front_back_consistent": True,
                                        "warnings": ["Monitor bezel visible around coin."],
                                    },
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

    res = identify_images(
        [(_make_sharp_coin_bytes(), "image/jpeg")],
        ws,
        intake_mode="upload",
    )
    assert res["verification_status"] == "FLAGGED"
    assert any("screen/print" in w for w in res["verification_warnings"])
    assert any("Monitor bezel" in w for w in res["verification_warnings"])


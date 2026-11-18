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


def test_analyze_image_allows_dark_desk_with_readable_subject_highlights():
    # Dark carbon-fiber desk (luma ~18) with a bright silver coin/card highlights in center (mean < 35, p90 > 60)
    img = Image.new("RGB", (600, 600), (18, 18, 20))
    draw = ImageDraw.Draw(img)
    draw.ellipse((200, 200, 400, 400), fill=(195, 198, 205), outline=(120, 125, 130), width=4)
    for r in range(230, 370, 20):
        draw.line((r, 240, r, 360), fill=(90, 95, 100), width=3)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)

    res = analyze_image_quality_and_forensics(buf.getvalue(), mode="camera")
    assert not any("too dark" in w.lower() for w in res["warnings"])
    assert res["status"] == "VERIFIED"

    # Genuinely pitch-dark image must still flag underexposure
    dark = Image.new("RGB", (600, 600), (20, 20, 20))
    dark_buf = io.BytesIO()
    dark.save(dark_buf, format="JPEG", quality=95)
    dark_res = analyze_image_quality_and_forensics(dark_buf.getvalue(), mode="camera")
    assert any("too dark" in w.lower() for w in dark_res["warnings"])


def test_analyze_image_flags_localized_specular_glare():
    # Dark mat overall (mean brightness well below 235), but bright white glare obscuring center coin
    img = Image.new("RGB", (600, 600), (30, 32, 36))
    draw = ImageDraw.Draw(img)
    draw.ellipse((150, 150, 450, 450), fill=(170, 172, 178), outline=(90, 92, 96), width=4)
    # Large blown-out white glare blob covering >15% of central region
    draw.ellipse((210, 190, 410, 390), fill=(252, 252, 252))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)

    res = analyze_image_quality_and_forensics(buf.getvalue(), mode="upload")
    assert res["status"] == "FLAGGED"
    assert res["metrics"]["central_glare_ratio"] > 0.08
    assert any("glare" in w.lower() for w in res["warnings"])


def test_analyze_image_flags_clipped_subject_edges():
    # Bright subject extending all the way across top and bottom edges (clipped note/coin)
    img = Image.new("RGB", (600, 600), (25, 25, 28))
    draw = ImageDraw.Draw(img)
    draw.rectangle((140, 0, 460, 600), fill=(205, 195, 155), outline=(60, 50, 30), width=6)
    for y in range(20, 580, 40):
        draw.line((180, y, 420, y), fill=(80, 70, 45), width=3)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)

    res = analyze_image_quality_and_forensics(buf.getvalue(), mode="upload")
    assert res["status"] == "FLAGGED"
    assert res["metrics"]["clipped_edges"] >= 2
    assert any("clipped" in w.lower() for w in res["warnings"])



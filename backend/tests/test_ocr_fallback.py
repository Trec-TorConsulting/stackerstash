import io
from unittest.mock import patch

from PIL import Image, ImageDraw

from apps.vision.ocr import extract_text_from_images, parse_ocr_numismatic_hints


def test_parse_ocr_numismatic_hints_slab_label():
    raw = "PCGS\n1921 MORGAN\n$1 MS65\nCERT #45678901"
    parsed = parse_ocr_numismatic_hints(raw)
    assert parsed["has_usable_hints"] is True
    assert parsed["category"] == "SLAB"
    assert parsed["grading_service"] == "PCGS"
    assert parsed["grade"] == "MS65"
    assert parsed["cert_number"] == "45678901"
    assert parsed["year"] == "1921"
    assert parsed["denomination"] == "$1"
    assert parsed["series"] == "Morgan Dollar"


def test_parse_ocr_numismatic_hints_paper_banknote():
    raw = "FEDERAL RESERVE NOTE\nTHE UNITED STATES OF AMERICA\nONE DOLLAR\nSERIES 2017A\nB12345678C"
    parsed = parse_ocr_numismatic_hints(raw)
    assert parsed["has_usable_hints"] is True
    assert parsed["category"] == "PAPER"
    assert parsed["country"] == "United States"
    assert parsed["denomination"] == "$1"
    assert parsed["year"] == "2017A"
    assert parsed["serial_number"] == "B12345678C"
    assert parsed["series"] == "Federal Reserve Note"


def test_parse_ocr_numismatic_hints_stamped_bullion_bar():
    raw = "GEIGER EDELMETALLE\n100 G\nFINE SILVER .999"
    parsed = parse_ocr_numismatic_hints(raw)
    assert parsed["has_usable_hints"] is True
    assert parsed["category"] == "BAR"
    assert parsed["mint_or_refiner"] == "Geiger Edelmetalle"
    assert parsed["metal_type"] == "SILVER"
    assert parsed["weight_value"] == 100.0
    assert parsed["weight_unit"] == "G"
    assert parsed["purity"] == 0.999


def test_parse_ocr_numismatic_hints_empty_text():
    parsed = parse_ocr_numismatic_hints("")
    assert parsed["has_usable_hints"] is False
    assert parsed["title"] == ""


def test_extract_text_from_images_preprocesses_and_filters_confidence():
    img = Image.new("RGB", (400, 200), color=(240, 240, 240))
    ImageDraw.Draw(img).text((20, 40), "PCGS MS65 1921", fill=(10, 10, 10))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")

    def fake_engine(_img_bytes):
        return [
            ([[0, 0], [10, 0], [10, 10], [0, 10]], "PCGS", 0.98),
            ([[0, 0], [10, 0], [10, 10], [0, 10]], "noise", 0.15),
            ([[0, 0], [10, 0], [10, 10], [0, 10]], "1921", 0.91),
        ], None

    with patch("apps.vision.ocr._get_ocr_engine", return_value=fake_engine):
        text = extract_text_from_images([(buf.getvalue(), "image/jpeg")])

    assert text == "PCGS\n1921"


def test_preprocess_image_for_ocr_outputs_downscaled_jpeg():
    from apps.vision.ocr import _preprocess_image_for_ocr

    img = Image.new("RGB", (2400, 1800), color=(200, 200, 200))
    buf = io.BytesIO()
    img.save(buf, format="PNG")

    processed = _preprocess_image_for_ocr(buf.getvalue())
    assert processed is not None
    with Image.open(io.BytesIO(processed)) as out:
        assert out.format == "JPEG"
        assert max(out.size) <= 1200



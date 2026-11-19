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


def test_ocr_module_complete_branches():
    import numpy as np

    import apps.vision.ocr as ocr_mod
    from apps.vision.ocr import (
        _preprocess_image_for_ocr,
        extract_barcode_hint,
        extract_text_from_images,
        parse_ocr_numismatic_hints,
    )

    # _get_ocr_engine cached failure & RapidOCR init paths
    orig_engine, orig_failed = ocr_mod._OCR_ENGINE, ocr_mod._OCR_INIT_FAILED
    try:
        ocr_mod._OCR_ENGINE = None
        ocr_mod._OCR_INIT_FAILED = True
        assert ocr_mod._get_ocr_engine() is None
        assert extract_text_from_images([(b"abc", "image/jpeg")]) == ""

        ocr_mod._OCR_INIT_FAILED = False
        with patch.dict("sys.modules", {"rapidocr_onnxruntime": None}):
            assert ocr_mod._get_ocr_engine() is None
            assert ocr_mod._OCR_INIT_FAILED is True
    finally:
        ocr_mod._OCR_ENGINE, ocr_mod._OCR_INIT_FAILED = orig_engine, orig_failed

    # _preprocess_image_for_ocr corrupt bytes returns None
    assert _preprocess_image_for_ocr(b"not-an-image") is None

    # extract_text_from_images skips corrupt images, engine exception, empty result, invalid entry
    def raising_engine(_b):
        raise RuntimeError("ocr crash")

    img = Image.new("RGB", (100, 100), (240, 240, 240))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    with patch("apps.vision.ocr._get_ocr_engine", return_value=raising_engine):
        assert extract_text_from_images([(b"bad", "image/png"), (buf.getvalue(), "image/png")]) == ""
    with patch("apps.vision.ocr._get_ocr_engine", return_value=lambda _b: ([["bad_entry"], ([0], "OK", 0.9)], None)):
        assert extract_text_from_images([(buf.getvalue(), "image/png")]) == "OK"

    # extract_barcode_hint QR decode hit (digits & non-digit string) + big image + cv2 exception + import fail
    big = Image.new("RGB", (1500, 1500), (240, 240, 240))
    bb = io.BytesIO()
    big.save(bb, format="PNG")
    with patch("cv2.QRCodeDetector.detectAndDecode", return_value=("https://pcgs.com/cert/12345678", np.array([]), None)):
        assert extract_barcode_hint([(bb.getvalue(), "image/png")]) == "12345678"
    with patch("cv2.QRCodeDetector.detectAndDecode", return_value=("RAW-BARCODE-ABC", np.array([]), None)):
        assert extract_barcode_hint([(bb.getvalue(), "image/png")]) == "RAW-BARCODE-ABC"
    with patch("cv2.QRCodeDetector.detectAndDecode", side_effect=RuntimeError("qr err")):
        assert extract_barcode_hint([(bb.getvalue(), "image/png")]) == ""
    with patch.dict("sys.modules", {"cv2": None}):
        assert extract_barcode_hint([(bb.getvalue(), "image/png")]) == ""

    # parse_ocr_numismatic_hints across all grading services, grades, certs, serials, denominations, card games
    for snippet, exp_svc, exp_cat in [
        ("PCGS BANKNOTE 66 EPQ CERT # 12345678", "PCGS_BANKNOTE", "SLAB"),
        ("PMG 65 PPQ 99887766 A12345678B TWENTY DOLLARS SERIES 1934A SILVER CERTIFICATE", "PMG", "SLAB"),
        ("NGC PF69 UCAM 1234567-001", "NGC", "SLAB"),
        ("CACG MS64 7654321", "CACG", "SLAB"),
        ("ANACS AU58 7654321", "ANACS", "SLAB"),
        ("ICG MS62 7654321", "ICG", "SLAB"),
        ("PSA GEM MT 10 CHARIZARD POKEMON 4/102", "PSA", "SLAB"),
        ("BECKETT BGS-9.5 MAGIC: THE GATHERING", "BGS", "SLAB"),
        ("CGC 9 YU-GI-OH", "CGC", "SLAB"),
        ("SGC 8 TOPPS", "SGC", "SLAB"),
        ("TAG 10 PANINI", "TAG", "SLAB"),
    ]:
        h = parse_ocr_numismatic_hints(snippet)
        assert h["grading_service"] == exp_svc
        assert h["category"] == exp_cat

    bar_h = parse_ocr_numismatic_hints("500 GRAM PALLADIUM BAR 9995 MAPLE LEAF", barcode_hint=None)
    assert bar_h["weight_unit"] == "G" and bar_h["metal_type"] == "PALLADIUM"
    kg_h = parse_ocr_numismatic_hints("1 KILO COPPER ROUND LIBERTY")
    assert kg_h["weight_unit"] == "KG" and kg_h["metal_type"] == "COPPER"
    card_h = parse_ocr_numismatic_hints("LORCANA ONE PIECE COLLECTIBLE CARD")
    assert card_h["category"] == "CARD"
    # Platinum + compact alt serial without spaces/suffix (lines 218, 261)
    plat_h = parse_ocr_numismatic_hints("PLATINUM 1 OZ BAR K9876543")
    assert plat_h["metal_type"] == "PLATINUM"
    assert plat_h["serial_number"] == "K9876543"




from __future__ import annotations

import io

from PIL import Image

from apps.vision.ocr import extract_barcode_hint, parse_ocr_numismatic_hints


def test_parse_ocr_numismatic_hints_pcgs_slash_and_goldback():
    pcgs_text = "FIRSTSTRIKE\n2025-P 25C\nPCGS MS65\nJuliette Gordon Low\n979115.65/61829511"
    h1 = parse_ocr_numismatic_hints(pcgs_text)
    assert h1["grading_service"] == "PCGS"
    assert h1["grade"] == "MS65"
    assert h1["cert_number"] == "61829511"
    assert h1["category"] == "SLAB"

    gb_text = "UTAH\nGoldback\n1/4\nNegotiable Instrument\n2023\n24K Gold"
    h2 = parse_ocr_numismatic_hints(gb_text)
    assert h2["category"] == "PAPER"
    assert h2["metal_type"] == "GOLD"
    assert h2["year"] == "2023"


def test_extract_barcode_hint_graceful_on_blank_image():
    img = Image.new("RGB", (120, 120), color=(240, 240, 240))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    assert extract_barcode_hint([(buf.getvalue(), "image/jpeg")]) == ""


def test_parse_ocr_card_hints_without_explicit_franchise_title():
    text = "Charizard\n120 HP\nStage 2\n4/102\n1st Edition\n©1995, 96, 98 Nintendo, Creatures, GAMEFREAK."
    h = parse_ocr_numismatic_hints(text)
    assert h["category"] == "CARD"
    assert h["card_game"] == "Pokémon"
    assert h["card_number"] == "4/102"
    assert h["metal_type"] == "NONE"
    assert h["weight_value"] == 0
    assert h["has_usable_hints"] is True


def test_parse_ocr_sports_card_hints():
    text = "Ken Griffey Jr.\n1989 Upper Deck\nStar Rookie\nRC #1"
    h = parse_ocr_numismatic_hints(text)
    assert h["category"] == "CARD"
    assert "Sports" in h["card_game"]
    assert h["metal_type"] == "NONE"
    assert h["weight_value"] == 0

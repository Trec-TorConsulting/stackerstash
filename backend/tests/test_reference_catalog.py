from __future__ import annotations

from apps.catalog.reference_catalog import match_static_reference


def test_match_static_reference_goldback():
    ocr = "UTAH\nGoldback\n1/4\nNegotiable Instrument\n2023\nThis Goldback Contains 1/4000th Troy Ounce 24K Gold"
    res = match_static_reference(ocr, {"year": "2023"})
    assert res is not None
    assert res["matched"] is True
    c = res["candidate"]
    assert c["category"] == "PAPER"
    assert c["metal_type"] == "GOLD"
    assert c["weight_value"] == "0.00025"
    assert c["purity"] == "0.999900"
    assert "Utah" in c["title"]
    assert "1/4" in c["title"]


def test_match_static_reference_silver_eagle():
    ocr = "UNITED STATES OF AMERICA\nAMERICAN SILVER EAGLE\n1 OZ. FINE SILVER ~ ONE DOLLAR\n2024"
    res = match_static_reference(ocr, {"year": "2024"})
    assert res is not None
    c = res["candidate"]
    assert c["category"] == "COIN"
    assert c["metal_type"] == "SILVER"
    assert c["weight_value"] == "1.0000"
    assert c["title"] == "2024 American Silver Eagle 1 oz"
    assert res["specs"]["diameter_mm"] == "40.6"


def test_match_static_reference_no_match():
    assert match_static_reference("RANDOM BLURRY TEXT", {}) is None
    assert match_static_reference("", {}) is None

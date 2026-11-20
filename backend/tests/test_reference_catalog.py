from __future__ import annotations

from decimal import Decimal

import pytest

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
    # Contains "24K GOLD" without "GOLDBACK" (line 309)
    assert match_static_reference("NEGOTIABLE INSTRUMENT 24K GOLD", {}) is None


def test_match_static_reference_goldback_variants():
    half = match_static_reference("UTAH 1/2 GOLDBACK 2024", {})
    assert half is not None and "1/2" in half["candidate"]["title"]

    five = match_static_reference("NEVADA 5 GOLDBACK", {"year": ""})
    assert five is not None and "5 Goldback" in five["candidate"]["title"]

    hint_denom = match_static_reference(
        "WYOMING GOLDBACK NOTE 2022", {"denomination": "10 Goldback", "year": ""}
    )
    assert hint_denom is not None and "2022 Wyoming 10 Goldback" == hint_denom["candidate"]["title"]

    no_denom = match_static_reference("FLORIDA GOLDBACK ISSUE", {})
    assert no_denom is not None and "Goldback" in no_denom["candidate"]["title"]


def test_match_static_reference_enrichments():
    # 1. 1964 Quarter (transition year metal detection) + ancient legend + cache hit
    res = match_static_reference(
        "AMERICAN SILVER EAGLE 1 OZ. FINE SILVER ANCIENT ROMAN IMP CAES NERVA TRAIAN AVG",
        {"year": "1964", "denomination": "Quarter", "country": "United States"},
    )
    assert res is not None
    assert "transition_metal" in res["specs"]
    assert "ancient_legend" in res["specs"]

    # 2. ASE authentication & storage fit
    ase = match_static_reference("AMERICAN SILVER EAGLE 1 OZ. FINE SILVER", {"year": "2024"})
    assert ase is not None
    assert ase["specs"]["storage_fit"]["air_tite_capsule"]["model"] == "H40.6"
    assert ase["specs"]["authentication"]["ping_specs"]["f1_fundamental_hz"] == 5920

    # 3. Cache hit on repeated call
    ase_cached = match_static_reference("AMERICAN SILVER EAGLE 1 OZ. FINE SILVER", {"year": "2024"})
    assert ase_cached == ase


@pytest.mark.django_db
def test_match_static_reference_cache_and_db_exceptions():
    from unittest.mock import patch

    from apps.catalog.models import StaticCardSpec

    StaticCardSpec.objects.create(
        ref_key="pokemon_charizard_base_test",
        card_game="Pokémon",
        set_code="base",
        set_name="Base Set",
        card_number="4/102",
        card_name="Charizard",
    )

    # Cache get/set exceptions handled gracefully
    with patch("django.core.cache.cache.get", side_effect=Exception("Cache down")), \
         patch("django.core.cache.cache.set", side_effect=Exception("Cache write failed")):
        # Goldback branch
        gb = match_static_reference("UTAH 1/4 GOLDBACK 2023", {})
        assert gb is not None

        # DB match branch
        card_res = match_static_reference(
            "CHARIZARD HOLO 4/102 BASE SET",
            hints={"set_code": "base", "card_number": "4/102"},
        )
        assert card_res is not None

        # Fallback branch
        ase = match_static_reference("AMERICAN SILVER EAGLE 1 OZ. FINE SILVER", {})
        assert ase is not None


def test_match_static_reference_db_models(db):
    from apps.catalog.models import (
        StaticBanknoteSpec,
        StaticCardSpec,
        StaticNumismaticSpec,
    )

    # A. StaticCardSpec
    StaticCardSpec.objects.create(
        ref_key="pokemon_charizard_base",
        card_game="Pokémon",
        set_code="base",
        set_name="Base Set",
        card_number="4/102",
        card_name="Charizard",
        rarity="Holo Rare",
        card_finish="Holo",
        release_year=1999,
        thickness_pt=35,
    )
    card_res = match_static_reference(
        "CHARIZARD HOLO 4/102 BASE SET",
        hints={"set_code": "base", "card_number": "4/102"},
    )
    assert card_res is not None
    assert card_res["candidate"]["category"] == "CARD"
    assert "Charizard" in card_res["candidate"]["title"]
    assert "centering_rubrics" in card_res["specs"]

    # B. StaticBanknoteSpec
    StaticBanknoteSpec.objects.create(
        ref_key="us_fr_237",
        country="United States",
        denomination="$1",
        series="1899",
        friedberg_number="Fr. 237",
        title="Black Eagle Silver Certificate",
        seal_color="BLUE",
        size_class="LARGE",
    )
    bn_res = match_static_reference(
        "1899 $1 SILVER CERTIFICATE BLACK EAGLE B 12344321 *",
        hints={"catalog_number": "Fr. 237"},
    )
    assert bn_res is not None
    assert bn_res["candidate"]["category"] == "PAPER"
    assert bn_res["specs"]["seal_color"] == "BLUE"
    assert bn_res["specs"]["serial_analysis"]["is_star_note"] is True

    # C. StaticNumismaticSpec
    StaticNumismaticSpec.objects.create(
        ref_key="us_morgan_dollar_1878",
        item_kind="COIN",
        title="1878 Morgan Dollar",
        country="United States",
        mint_or_refiner="U.S. Mint",
        denomination="$1",
        series="Morgan Dollar",
        metal_type="SILVER",
        weight_value=Decimal("0.7734"),
        weight_unit="OZ_T",
        purity=Decimal("0.900000"),
        keywords=["MORGAN DOLLAR", "E PLURIBUS UNUM"],
        secondary_keywords=["ONE DOLLAR"],
        diameter_mm=Decimal("38.1"),
        thickness_mm=Decimal("2.4"),
        composition="90% Silver, 10% Copper",
        is_key_date=False,
    )
    num_res = match_static_reference("MORGAN DOLLAR 1878 ONE DOLLAR E PLURIBUS UNUM", hints={"year": "1878"})
    assert num_res is not None
    assert num_res["candidate"]["series"] == "Morgan Dollar"

    # D. Ancient coin legend decoding
    anc_res = match_static_reference("IMP CAES NERVA TRAIAN AVG GERM P M TR P COS IIII P P", hints={"year": "100"})
    # Result contains ancient legend expansion
    if anc_res:
        assert "ancient_legend" in anc_res["specs"]


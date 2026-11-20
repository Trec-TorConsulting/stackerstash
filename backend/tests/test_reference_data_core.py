from __future__ import annotations

from decimal import Decimal

import pytest

from apps.catalog.reference_data.constants import (
    CONSTITUTIONAL_MULTIPLIERS,
    DENSITY_G_PER_CM3,
    SIGMA_CONDUCTIVITY_TABLE,
    TAX_REPORTING_THRESHOLDS_1099B,
    convert_weight,
    detect_transition_year_metal,
)
from apps.catalog.reference_data.grading import (
    BANKNOTE_DESIGNATIONS,
    CARD_CENTERING_RUBRICS,
    CARD_CONDITION_SCALES,
    COIN_STRIKE_DESIGNATIONS,
    SHELDON_SCALE_MAP,
    detect_slab_generation,
    get_cac_eligibility,
    lookup_glossary_term,
)


def test_convert_weight_exact():
    # 1 ozt -> grams
    grams = convert_weight(Decimal("1.0"), "OZ_T", "G")
    assert grams == Decimal("31.103477")

    # 1000 grams -> kg
    kg = convert_weight("1000", "G", "KG")
    assert kg == Decimal("1.000000")

    # 1 oz avdp -> grams
    avdp_g = convert_weight(1, "OZ_AVDP", "G")
    assert avdp_g == Decimal("28.349523")

    # Grains to grams
    gr_g = convert_weight("100", "GRAINS", "G")
    assert gr_g == Decimal("6.479891")

    # Pounds to grams
    lb_g = convert_weight("1", "LB", "G")
    assert lb_g == Decimal("453.592370")

    # Round trip ozt to oz_avdp
    oz_avdp = convert_weight("1", "OZT", "OZ")
    assert oz_avdp > Decimal("1.09")

    # Unsupported unit error
    with pytest.raises(ValueError, match="Unsupported from_unit"):
        convert_weight("1", "STONES", "G")
    with pytest.raises(ValueError, match="Unsupported to_unit"):
        convert_weight("1", "G", "LIGHTYEARS")


def test_densities_and_conductivity():
    assert DENSITY_G_PER_CM3["GOLD_24K"] == Decimal("19.32")
    assert DENSITY_G_PER_CM3["SILVER_FINE"] == Decimal("10.49")
    assert DENSITY_G_PER_CM3["PLATINUM_FINE"] == Decimal("21.45")

    gold_sigma = SIGMA_CONDUCTIVITY_TABLE["GOLD_24K"]
    assert gold_sigma["magnetic_behavior"] == "DIAMAGNETIC"
    assert gold_sigma["iacs_min_pct"] == Decimal("70.0")

    pt_sigma = SIGMA_CONDUCTIVITY_TABLE["PLATINUM_FINE"]
    assert pt_sigma["magnetic_behavior"] == "PARAMAGNETIC"


def test_constitutional_multipliers_and_taxes():
    us_90 = CONSTITUTIONAL_MULTIPLIERS["US_90_CIRCULATED"]
    assert us_90["troy_oz_per_dollar_fv"] == Decimal("0.715000")
    assert us_90["purity"] == Decimal("0.900000")

    can_80 = CONSTITUTIONAL_MULTIPLIERS["CANADA_80"]
    assert can_80["troy_oz_per_dollar_fv"] == Decimal("0.600000")

    uk_sterling = CONSTITUTIONAL_MULTIPLIERS["UK_STERLING_PRE1920"]
    assert uk_sterling["purity"] == Decimal("0.925000")

    krug_tax = TAX_REPORTING_THRESHOLDS_1099B["GOLD_KRUGERRAND"]
    assert "25" in krug_tax["threshold"]

    ase_tax = TAX_REPORTING_THRESHOLDS_1099B["AMERICAN_EAGLES_GOLD_SILVER"]
    assert ase_tax["threshold"] == "EXEMPT"


def test_detect_transition_year_metal():
    # US Dimes & Quarters
    q64 = detect_transition_year_metal("United States", "Quarter", 1964)
    assert q64 is not None and q64["metal_type"] == "SILVER" and q64["purity"] == Decimal("0.900000")

    q65 = detect_transition_year_metal("USA", "Quarter", "1965")
    assert q65 is not None and q65["metal_type"] == "NONE"

    # US Halves
    h64 = detect_transition_year_metal("US", "Half Dollar", 1964)
    assert h64 is not None and h64["purity"] == Decimal("0.900000")

    h67 = detect_transition_year_metal("US", "50 Cent", 1967)
    assert h67 is not None and h67["metal_type"] == "SILVER" and h67["purity"] == Decimal("0.400000")

    h72 = detect_transition_year_metal("US", "Half Dollar", 1972)
    assert h72 is not None and h72["metal_type"] == "NONE"

    # US War Nickels
    wn43 = detect_transition_year_metal("USA", "Nickel", 1943)
    assert wn43 is not None and wn43["metal_type"] == "SILVER" and wn43["purity"] == Decimal("0.350000")

    wn42p = detect_transition_year_metal("USA", "5c", 1942, mint_mark="P")
    assert wn42p is not None and wn42p["metal_type"] == "SILVER"

    wn42d = detect_transition_year_metal("USA", "5c", 1942, mint_mark="D")
    assert wn42d is not None and wn42d["metal_type"] == "NONE"

    # Lincoln Cent 1982 transition
    c81 = detect_transition_year_metal("US", "1 Cent", 1981)
    assert c81 is not None and c81["metal_type"] == "COPPER" and c81["purity"] == Decimal("0.950000")

    c82 = detect_transition_year_metal("US", "Penny", 1982)
    assert c82 is not None and c82.get("requires_scale_verification") is True

    c83 = detect_transition_year_metal("US", "Cent", 1983)
    assert c83 is not None and c83["metal_type"] == "NONE"

    # Canada
    can65 = detect_transition_year_metal("Canada", "10 Cents", 1965)
    assert can65 is not None and can65["purity"] == Decimal("0.800000")

    can67 = detect_transition_year_metal("Canada", "Quarter", 1967)
    assert can67 is not None and can67["purity"] == Decimal("0.650000")

    can68 = detect_transition_year_metal("Canada", "Dime", 1968)
    assert can68 is not None and can68.get("requires_magnet_check") is True

    # Fallbacks and non-matches
    assert detect_transition_year_metal("France", "Franc", 1960) is None
    assert detect_transition_year_metal("US", "Dollar", "invalid_year") is None


def test_sheldon_and_grading_constants():
    assert SHELDON_SCALE_MAP[70]["code"] == "MS-70"
    assert SHELDON_SCALE_MAP[65]["code"] == "MS-65"
    assert SHELDON_SCALE_MAP[1]["code"] == "PO-1"

    assert COIN_STRIKE_DESIGNATIONS["DMPL"]["code"] == "DMPL"
    assert COIN_STRIKE_DESIGNATIONS["FS"]["code"] == "FS"
    assert BANKNOTE_DESIGNATIONS["EPQ"]["code"] == "EPQ"
    assert BANKNOTE_DESIGNATIONS["STAR"]["code"] == "STAR"

    assert "10" in CARD_CONDITION_SCALES["10_GEM_MINT"]
    assert CARD_CENTERING_RUBRICS["PSA_10"]["front_tolerance"] == "55/45 to 60/40"
    assert CARD_CENTERING_RUBRICS["BGS_BLACK_LABEL"]["front_tolerance"] == "50/50"


def test_detect_slab_generation():
    rattler = detect_slab_generation("PCGS MS64 Morgan Dollar in original Rattler holder")
    assert rattler is not None and "Rattler" in rattler["generation"]

    doily = detect_slab_generation("Super rare 1881-S Doily holder PCGS")
    assert doily is not None and "Doily" in doily["generation"]

    ogh = detect_slab_generation("1921 Morgan PCGS MS63 OGH Old Green Holder")
    assert ogh is not None and "Old Green Holder" in ogh["generation"]

    fatty = detect_slab_generation("1885-O NGC MS65 Old Fatty no line")
    assert fatty is not None and "Fatty" in fatty["generation"]

    old_flip = detect_slab_generation("1999 Charizard PSA Old Flip red border")
    assert old_flip is not None and "Old Flip" in old_flip["generation"]

    assert detect_slab_generation("Modern PCGS Gold Shield Slab") is None
    assert detect_slab_generation("") is None


def test_cac_eligibility_and_glossary():
    pcgs_cac = get_cac_eligibility("PCGS", "MS65")
    assert pcgs_cac["eligible_for_cac_sticker"] is True

    ngc_cac = get_cac_eligibility("NGC", "PF69")
    assert ngc_cac["eligible_for_cac_sticker"] is True

    anacs_cac = get_cac_eligibility("ANACS", "MS63")
    assert anacs_cac["eligible_for_cac_sticker"] is False

    # Glossary lookup
    vam = lookup_glossary_term("VAM")
    assert vam is not None and "Van Allen-Mallis" in vam["full_name"]

    ddo = lookup_glossary_term("D.D.O.")
    assert ddo is not None and "Doubled Die Obverse" in ddo["full_name"]

    rpa = lookup_glossary_term("rpa")
    assert rpa is not None and "Rookie Patch Auto" in rpa["full_name"]

    dmpl = lookup_glossary_term("DMPL")
    assert dmpl is not None and dmpl["category"] == "COIN" and dmpl["term"] == "DMPL"

    specimen = lookup_glossary_term("SPECIMEN")
    assert specimen is not None and specimen["category"] == "PAPER" and specimen["term"] == "SPECIMEN"

    assert lookup_glossary_term("UNKNOWN_JARGON_123") is None

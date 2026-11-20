from __future__ import annotations

from apps.catalog.reference_data.ancient import (
    ANCIENT_DENOMINATIONS,
    CATALOG_PREFIXES,
    decode_ancient_legend,
)
from apps.catalog.reference_data.authentication import (
    get_authentication_profile,
)
from apps.catalog.reference_data.banknote_guru import (
    analyze_us_serial,
)
from apps.catalog.reference_data.cert_patterns import (
    build_cert_verification_url,
    parse_slab_barcode,
)
from apps.catalog.reference_data.storage_fit import (
    recommend_storage_fit,
)
from apps.valuation.providers import build_cert_verification_url as providers_build_cert_url


def test_cert_patterns_and_providers_parity():
    # PCGS
    url = build_cert_verification_url("PCGS", "12345678")
    assert url == "https://www.pcgs.com/cert/12345678"
    assert providers_build_cert_url("PCGS", "12345678") == url

    # CAC & CACG
    cac_url = build_cert_verification_url("CAC", "98765432")
    assert "caccoin.com" in cac_url
    cacg_url = build_cert_verification_url("CACG", "98765432")
    assert "cacgrading.com" in cacg_url

    # Invalid / empty
    assert build_cert_verification_url("UNKNOWN", "123") is None
    assert build_cert_verification_url("PCGS", "") is None


def test_parse_slab_barcode():
    # Direct URLs
    p1 = parse_slab_barcode("https://www.pcgs.com/cert/12345678")
    assert p1 is not None and p1["grading_service"] == "PCGS" and p1["cert_number"] == "12345678"

    p2 = parse_slab_barcode("https://www.ngccoin.com/certlookup/1234567-001/")
    assert p2 is not None and p2["grading_service"] == "NGC" and p2["cert_number"] == "1234567-001"

    p3 = parse_slab_barcode("https://my.taggrading.com/card/A1B2C3D4")
    assert p3 is not None and p3["grading_service"] == "TAG" and p3["cert_number"] == "A1B2C3D4"

    # Hyphenated NGC / PMG barcode
    p4 = parse_slab_barcode("9876543-002")
    assert p4 is not None and p4["grading_service"] == "NGC" and p4["cert_number"] == "9876543-002"

    # PCGS composite slash
    p5 = parse_slab_barcode("7226.64/12345678")
    assert p5 is not None and p5["grading_service"] == "PCGS" and p5["cert_number"] == "12345678"

    # TAG alphanumeric
    p6 = parse_slab_barcode("N1234567")
    assert p6 is not None and p6["grading_service"] == "TAG" and p6["cert_number"] == "N1234567"

    # Standard numeric barcode (PSA default)
    p7 = parse_slab_barcode("87654321")
    assert p7 is not None and p7["grading_service"] == "PSA" and p7["cert_number"] == "87654321"

    assert parse_slab_barcode("") is None
    assert parse_slab_barcode("AB") is None


def test_banknote_guru_fancy_serials():
    # Solid
    s_solid = analyze_us_serial("B 77777777 A")
    assert "SOLID" in s_solid["patterns"]
    assert s_solid["rarity_tier"] == "GRAIL"
    assert s_solid["frb_district"] == "B2"
    assert s_solid["frb_bank"] == "New York"

    # Near Solid
    s_ns = analyze_us_serial("A 77777770 B")
    assert "NEAR_SOLID" in s_ns["patterns"]

    # Low serial
    s_low = analyze_us_serial("E 00000007 *")
    assert "LOW_SERIAL" in s_low["patterns"]
    assert s_low["is_star_note"] is True
    assert s_low["rarity_tier"] == "GRAIL"

    # Radar
    s_radar = analyze_us_serial("C 12344321 D")
    assert "RADAR" in s_radar["patterns"]

    # Super radar
    s_sradar = analyze_us_serial("F 10000001 G")
    assert "SUPER_RADAR" in s_sradar["patterns"]

    # Repeater
    s_rep = analyze_us_serial("G 12341234 H")
    assert "REPEATER" in s_rep["patterns"]

    # Super repeater
    s_srep = analyze_us_serial("H 12121212 I")
    assert "SUPER_REPEATER" in s_srep["patterns"]

    # True binary
    s_bin = analyze_us_serial("J 01010101 K")
    assert "TRUE_BINARY" in s_bin["patterns"]
    assert "SUPER_REPEATER" in s_bin["patterns"]

    # True binary that hits ULTRA_RARE upgrade
    s_bin_upgrade = analyze_us_serial("A 00110011 B")
    assert "TRUE_BINARY" in s_bin_upgrade["patterns"]
    assert s_bin_upgrade["rarity_tier"] == "ULTRA_RARE"

    # Regular Binary (e.g. 2s and 3s) with COMMON -> SCARCE
    s_bin_reg = analyze_us_serial("A 22232333 B")
    assert "BINARY" in s_bin_reg["patterns"]
    assert s_bin_reg["rarity_tier"] == "SCARCE"

    # Rotator that is NOT palindromic (COMMON -> RARE)
    s_rot_pure = analyze_us_serial("A 60811809 B")
    assert "ROTATOR" in s_rot_pure["patterns"]
    assert s_rot_pure["rarity_tier"] == "RARE"

    # Bookends with COMMON -> MINOR
    s_book_minor = analyze_us_serial("A 23456723 B")
    assert "BOOKENDS" in s_book_minor["patterns"]
    assert s_book_minor["rarity_tier"] == "MINOR"

    # Ladder (grail vs ultra-rare)
    s_lad = analyze_us_serial("L 12345678 A")
    assert "LADDER" in s_lad["patterns"]
    assert s_lad["rarity_tier"] == "GRAIL"

    s_lad2 = analyze_us_serial("L 01234567 A")
    assert "LADDER" in s_lad2["patterns"]
    assert s_lad2["rarity_tier"] == "ULTRA_RARE"

    # Rotator
    s_rot_valid = analyze_us_serial("A 80811808 B")
    assert "ROTATOR" in s_rot_valid["patterns"]

    # Birthday serial MMDDYYYY and YYYYMMDD
    s_bday = analyze_us_serial("A 07041776 B")
    assert "BIRTHDAY" in s_bday["patterns"]

    s_bday_iso = analyze_us_serial("A 19991231 B")
    assert "BIRTHDAY" in s_bday_iso["patterns"]

    # Fort worth marker
    s_fw = analyze_us_serial("FW B 12345678 A")
    assert s_fw["is_fort_worth"] is True

    # High serial
    s_high = analyze_us_serial("C 99999950 D")
    assert "HIGH_SERIAL" in s_high["patterns"]

    s_high_rare = analyze_us_serial("C 99999050 D")
    assert s_high_rare["rarity_tier"] == "RARE"

    s_high_ultra = analyze_us_serial("C 99999910 D")
    assert s_high_ultra["rarity_tier"] == "ULTRA_RARE"

    # Low serial tiers
    s_low_ultra = analyze_us_serial("A 00000042 B")
    assert s_low_ultra["rarity_tier"] == "ULTRA_RARE"

    s_low_rare = analyze_us_serial("A 00000542 B")
    assert s_low_rare["rarity_tier"] == "RARE"

    # Repeater and Super Repeater when already rare (e.g. Low serial + Repeater)
    s_low_rep = analyze_us_serial("A 00050005 B")
    assert "REPEATER" in s_low_rep["patterns"]

    s_low_srep = analyze_us_serial("A 00000000 B")
    assert "SOLID" in s_low_srep["patterns"]

    # Descending ladders
    s_lad_desc = analyze_us_serial("A 87654321 B")
    assert s_lad_desc["rarity_tier"] == "GRAIL"

    s_lad_desc2 = analyze_us_serial("A 76543210 B")
    assert s_lad_desc2["rarity_tier"] == "ULTRA_RARE"

    # Star note with already rare pattern
    s_star_radar = analyze_us_serial("A 12344321 *")
    assert s_star_radar["is_star_note"] is True
    assert "STAR_NOTE" in s_star_radar["patterns"]

    # Plain standard serial (no fancy patterns)
    s_plain = analyze_us_serial("A 38291504 B")
    assert s_plain["is_valid_us_serial"] is True
    assert s_plain["patterns"] == []
    assert s_plain["rarity_tier"] == "COMMON"
    assert "Standard Serial" in s_plain["summary"]

    # Pure numeric without prefix/suffix
    s_num_only = analyze_us_serial("23456789")
    assert s_num_only["is_valid_us_serial"] is True

    # Star note in fallback
    s_star_fallback = analyze_us_serial("12345*")
    assert s_star_fallback["is_star_note"] is True

    # Rotator with already high rarity (e.g. Low Serial + Rotator)
    s_low_rot = analyze_us_serial("A 00000008 B")
    assert "LOW_SERIAL" in s_low_rot["patterns"]

    # Fallbacks and invalid
    assert analyze_us_serial("")["is_valid_us_serial"] is False
    assert analyze_us_serial("ABCDEFG")["is_valid_us_serial"] is False

    from apps.catalog.reference_data.banknote_guru import _is_date_serial
    assert _is_date_serial("123") is False
    assert _is_date_serial("99999999") is False

    # Short digits fallback
    s_short = analyze_us_serial("A12345B")
    assert s_short["is_valid_us_serial"] is True


def test_ancient_legend_and_rulers():
    res = decode_ancient_legend("IMP CAES NERVA TRAIAN AVG GERM P M TR P COS III P P")
    assert res["matched_ruler"] is not None
    assert res["matched_ruler"]["ruler"] == "Trajan"
    assert len(res["abbreviations"]) >= 5
    assert any(a["abbreviation"] == "IMP" for a in res["abbreviations"])
    assert any(a["abbreviation"] == "COS" for a in res["abbreviations"])

    assert ANCIENT_DENOMINATIONS["DENARIUS"]["metal"] == "SILVER"
    assert "RIC" in CATALOG_PREFIXES


def test_authentication_and_counterfeits():
    # ASE ping specs
    ase = get_authentication_profile("American Silver Eagle 1 oz")
    assert ase["ping_specs"] is not None
    assert ase["ping_specs"]["f1_fundamental_hz"] == 5920

    # 1909-S VDB alert
    fake_alert = get_authentication_profile("1909-S VDB Lincoln Cent Raw")
    assert fake_alert["has_counterfeit_alert"] is True
    assert fake_alert["counterfeit_alert"]["risk_level"] == "CRITICAL"

    # 1893-S Morgan alert
    morgan_alert = get_authentication_profile("1893-S Morgan Silver Dollar VF")
    assert morgan_alert["has_counterfeit_alert"] is True

    # 1943 Copper Cent
    copper_alert = get_authentication_profile("1943 Copper Bronze Cent")
    assert copper_alert["has_counterfeit_alert"] is True

    # Charizard 1st Edition
    zard_alert = get_authentication_profile("Charizard 1st Edition Base Set")
    assert zard_alert["has_counterfeit_alert"] is True

    # Normal item with no alert
    norm = get_authentication_profile("2024 Silver Round Generic")
    assert norm["has_counterfeit_alert"] is False


def test_storage_fit():
    # Coin capsule & tube
    ase_fit = recommend_storage_fit(category="COIN", diameter_mm=40.6, series="American Silver Eagle")
    assert ase_fit["recommended_capsule_code"] == "H40.6"
    assert ase_fit["mint_tube_fit"] is not None
    assert ase_fit["mint_tube_fit"]["coins_per_tube"] == 20

    # Morgan capsule
    morgan_fit = recommend_storage_fit(category="COIN", diameter_mm=38.1)
    assert morgan_fit["recommended_capsule_code"] == "H38"

    # Card point size fit
    card_fit = recommend_storage_fit(category="CARD", thickness_pt=35)
    assert card_fit["card_point_size"] == 35
    assert "35pt Toploader" in card_fit["holder_recommendation"]

    patch_fit = recommend_storage_fit(category="CARD", thickness_pt=130)
    assert patch_fit["card_point_size"] == 130
    assert "130pt Toploader" in patch_fit["holder_recommendation"]

    # Graded slab dimension fit
    psa_slab = recommend_storage_fit(grading_service="PSA")
    assert psa_slab["is_graded_slab"] is True
    assert psa_slab["slab_dimensions"]["width_mm"] == 80.0

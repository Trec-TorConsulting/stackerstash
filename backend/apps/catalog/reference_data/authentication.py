from __future__ import annotations

import re
from typing import Any

# ---------------------------------------------------------------------------
# Acoustic Ping Resonance Frequencies (Fundamental and Harmonics in Hz)
# ---------------------------------------------------------------------------
PING_FREQUENCIES_HZ: dict[str, dict[str, Any]] = {
    "AMERICAN_SILVER_EAGLE_1OZ": {
        "title": "American Silver Eagle 1 oz",
        "diameter_mm": 40.6,
        "f1_fundamental_hz": 5920,
        "f2_harmonic_hz": 11850,
        "f3_harmonic_hz": 16400,
        "tolerance_pct": 2.5,
    },
    "CANADIAN_SILVER_MAPLE_1OZ": {
        "title": "Canadian Silver Maple Leaf 1 oz",
        "diameter_mm": 38.0,
        "f1_fundamental_hz": 6450,
        "f2_harmonic_hz": 12900,
        "f3_harmonic_hz": 17800,
        "tolerance_pct": 2.5,
    },
    "AMERICAN_GOLD_EAGLE_1OZ": {
        "title": "American Gold Eagle 1 oz (22K)",
        "diameter_mm": 32.7,
        "f1_fundamental_hz": 7820,
        "f2_harmonic_hz": 15640,
        "f3_harmonic_hz": 21600,
        "tolerance_pct": 2.5,
    },
    "SOUTH_AFRICAN_KRUGERRAND_1OZ": {
        "title": "South African Gold Krugerrand 1 oz (22K)",
        "diameter_mm": 32.77,
        "f1_fundamental_hz": 7780,
        "f2_harmonic_hz": 15560,
        "f3_harmonic_hz": 21500,
        "tolerance_pct": 2.5,
    },
    "MORGAN_SILVER_DOLLAR": {
        "title": "Morgan Silver Dollar (90% Silver)",
        "diameter_mm": 38.1,
        "f1_fundamental_hz": 6220,
        "f2_harmonic_hz": 12440,
        "f3_harmonic_hz": 17200,
        "tolerance_pct": 3.0,
    },
}

# ---------------------------------------------------------------------------
# Sovereign Mint Anti-Counterfeit Security Features Registry
# ---------------------------------------------------------------------------
MINT_SECURITY_FEATURES: dict[str, list[dict[str, str]]] = {
    "ROYAL_CANADIAN_MINT": [
        {"feature": "Bullion DNA Micro-Maple", "introduced_year": "2014", "desc": "Laser-micro-engraved maple leaf with two-digit year viewable under magnification."},
        {"feature": "Radial Lines", "introduced_year": "2014", "desc": "Sub-millimeter radial lines diffracted light pattern machined into master die."},
    ],
    "ROYAL_MINT_UK": [
        {"feature": "Surface Animation / Latent Image", "introduced_year": "2021", "desc": "Trident morphs into padlock as viewing angle changes."},
        {"feature": "Tincture Lines", "introduced_year": "2021", "desc": "Micro-groove alternating radial lines and micro-text border 'DECUS ET TUTAMEN'."},
    ],
    "US_MINT": [
        {"feature": "Type 2 Missing-Reed Security Notch", "introduced_year": "2021", "desc": "Interrupted reed notch at a specific position along the coin perimeter edge."},
        {"feature": "AW / AW Monogram", "introduced_year": "2021", "desc": "Adolph A. Weinman designer monogram on reverse of Type 2 Silver Eagle."},
    ],
    "GEIGER_EDELMETALLE": [
        {"feature": "UV Light Blue Schloss Guldengossa", "introduced_year": "2017", "desc": "Fluorescent blue LEV emblem visible strictly under 365nm UV blacklight."},
        {"feature": "Ribbed Textured Coin Edge", "introduced_year": "2017", "desc": "Reeded bullion security border on minted square bars."},
    ],
    "PAMP_SUISSE": [
        {"feature": "PAMP Veriscan Surface Fingerprint", "introduced_year": "2015", "desc": "Microscopic surface topography scanning matched against PAMP cloud database."},
        {"feature": "CertiPAMP Assay Card", "introduced_year": "Classic", "desc": "Tamper-evident sealed blister pack with matching serialized bar numbers."},
    ],
}

# ---------------------------------------------------------------------------
# High-Risk Counterfeit Alert Registry
# ---------------------------------------------------------------------------
HIGH_RISK_COUNTERFEITS: list[tuple[re.Pattern[str], dict[str, Any]]] = [
    (
        re.compile(r"\b1909[-\s]?S\s*VDB\b", re.I),
        {
            "target": "1909-S VDB Lincoln Cent",
            "risk_level": "CRITICAL",
            "common_fakes": ["Added 'S' mint mark", "Added 'V.D.B.' initials", "Altered 1909 plain cents"],
            "diagnostics": [
                "Genuine 'S' mint mark has parallel serifs with notch in upper serif.",
                "Genuine V.D.B. initials on reverse have slanted crossbar on 'B'.",
                "Weight must be exactly 3.11g ±0.13g bronze.",
            ],
        },
    ),
    (
        re.compile(r"\b1893[-\s]?S\b.*\bMORGAN\b", re.I),
        {
            "target": "1893-S Morgan Silver Dollar",
            "risk_level": "CRITICAL",
            "common_fakes": ["Added 'S' to 1893-P", "Removed mint mark from 1893-CC/O", "Cast and struck counterfeits"],
            "diagnostics": [
                "Genuine 1893-S obverse date has slight upward tilt, 1 rests slightly above denticle.",
                "Mint mark 'S' is slightly filled in top loop and tilted.",
                "Weight must be 26.73g ±0.15g (90% silver ping test).",
            ],
        },
    ),
    (
        re.compile(r"\b1916[-\s]?D\b.*\b(?:MERCURY|DIME)\b", re.I),
        {
            "target": "1916-D Mercury Dime",
            "risk_level": "CRITICAL",
            "common_fakes": ["Embossed mint mark from 1916-P", "Soldered 'D' mint mark"],
            "diagnostics": [
                "Genuine 'D' mint mark has triangular inner opening and distinct serifs.",
                "Only four obverse/reverse die pairs exist for genuine 1916-D.",
            ],
        },
    ),
    (
        re.compile(r"\b1943\b.*\b(?:COPPER|BRONZE)\b.*\bCENT\b", re.I),
        {
            "target": "1943 Copper Lincoln Cent (Wrong Planchet Error)",
            "risk_level": "GRAIL_ALERT",
            "common_fakes": ["Copper-plated 1943 steel cents", "Altered 1948 cents"],
            "diagnostics": [
                "Magnet check: Genuine copper cent is completely NON-MAGNETIC (steel cent sticks immediately).",
                "Weight check: Must weigh 3.11g, not 2.70g steel.",
            ],
        },
    ),
    (
        re.compile(r"\bCHARIZARD\b.*\b1ST\s+EDITION\b", re.I),
        {
            "target": "1999 Pokémon Base Set 1st Edition Charizard #4/102",
            "risk_level": "CRITICAL",
            "common_fakes": ["Fake 1st Edition stamp on Unlimited card", "Counterfeit proxy cards", "Acetone border alterations"],
            "diagnostics": [
                "Must be Shadowless (no drop shadow on right border of character portrait frame).",
                "Copyright date line must read: '©1995, 96, 98, 99 Nintendo, Creatures, GAMEFREAK. ©1999 Wizards.'",
                "Holo foil must feature authentic starburst pattern, not modern vertical foil.",
            ],
        },
    ),
]


def get_authentication_profile(ref_key_or_text: str) -> dict[str, Any]:
    """Look up acoustic ping, mint security features, and counterfeit alert flags."""
    text = (ref_key_or_text or "").strip()
    upper = text.upper()

    # Ping specs
    ping_data = None
    for key, data in PING_FREQUENCIES_HZ.items():
        clean_key = key.replace("_", " ")
        d_title = data["title"].upper()
        if key in upper or clean_key in upper or d_title in upper or (len(upper) >= 6 and upper in d_title):
            ping_data = data
            break

    # High risk counterfeit checks
    counterfeit_alert = None
    for pattern, alert in HIGH_RISK_COUNTERFEITS:
        if pattern.search(upper):
            counterfeit_alert = alert
            break

    return {
        "has_counterfeit_alert": counterfeit_alert is not None,
        "counterfeit_alert": counterfeit_alert,
        "ping_specs": ping_data,
        "ping_frequencies_hz": ping_data,
        "security_features": MINT_SECURITY_FEATURES.get("ROYAL_CANADIAN_MINT" if "MAPLE" in upper else ("US_MINT" if "EAGLE" in upper else "")) or [],
    }

from __future__ import annotations

import re
from typing import Any

# ---------------------------------------------------------------------------
# Sheldon 1–70 Scale (Coins) and PMG 1–70 Scale (Paper)
# ---------------------------------------------------------------------------
SHELDON_SCALE_MAP: dict[int, dict[str, str]] = {
    1: {"code": "PO-1", "name": "Poor", "description": "Identifiable type and date, heavily worn"},
    2: {"code": "FR-2", "name": "Fair", "description": "Mostly worn smooth but major details outlined"},
    3: {"code": "AG-3", "name": "About Good", "description": "Heavily worn with portions of lettering blending into rim"},
    4: {"code": "G-4", "name": "Good", "description": "Heavily worn, major designs visible in outline"},
    6: {"code": "G-6", "name": "Good Plus", "description": "Fully distinct rim and complete outer devices"},
    8: {"code": "VG-8", "name": "Very Good", "description": "Well worn with design details beginning to show"},
    10: {"code": "VG-10", "name": "Very Good Plus", "description": "Slightly clearer inner design elements"},
    12: {"code": "F-12", "name": "Fine", "description": "Moderate wear on higher points, all letters sharp"},
    15: {"code": "F-15", "name": "Fine Plus", "description": "Recessed areas sharp, higher points moderately flattened"},
    20: {"code": "VF-20", "name": "Very Fine", "description": "Moderate wear on high relief areas, clear lines"},
    25: {"code": "VF-25", "name": "Very Fine Plus", "description": "All major features sharp with light-to-moderate wear"},
    30: {"code": "VF-30", "name": "Choice Very Fine", "description": "Light wear on high points, crisp legends"},
    35: {"code": "VF-35", "name": "Choice Very Fine Plus", "description": "Light wear, traces of mint luster in protected areas"},
    40: {"code": "EF-40", "name": "Extremely Fine", "description": "Light wear on highest points, luster in protected areas"},
    45: {"code": "EF-45", "name": "Choice Extremely Fine", "description": "Very light wear, substantial remaining mint luster"},
    50: {"code": "AU-50", "name": "About Uncirculated", "description": "Traces of wear or friction on high points, half luster remains"},
    53: {"code": "AU-53", "name": "About Uncirculated Plus", "description": "Light friction on high points, more than half luster"},
    55: {"code": "AU-55", "name": "Choice About Uncirculated", "description": "Slight friction on high points, 75%+ luster present"},
    58: {"code": "AU-58", "name": "Choice About Uncirculated Plus", "description": "Virtually uncirculated with slight cabinet friction"},
    60: {"code": "MS-60", "name": "Mint State 60", "description": "Uncirculated with heavy bag marks or dull luster"},
    61: {"code": "MS-61", "name": "Mint State 61", "description": "Uncirculated, multiple contact marks and scuffs"},
    62: {"code": "MS-62", "name": "Mint State 62", "description": "Uncirculated with noticeable contact marks"},
    63: {"code": "MS-63", "name": "Mint State 63 (Choice)", "description": "Moderate contact marks, attractive luster"},
    64: {"code": "MS-64", "name": "Mint State 64 (Near Gem)", "description": "Few scattered contact marks, very pleasing luster"},
    65: {"code": "MS-65", "name": "Mint State 65 (Gem)", "description": "High quality luster and strike, minimal minor marks"},
    66: {"code": "MS-66", "name": "Mint State 66 (Premium Gem)", "description": "Exceptional strike and luster, few minor distractions"},
    67: {"code": "MS-67", "name": "Mint State 67 (Superb Gem)", "description": "Sharp strike, pristine luster, virtually mark-free"},
    68: {"code": "MS-68", "name": "Mint State 68", "description": "Near perfection, microscopic imperfections only"},
    69: {"code": "MS-69", "name": "Mint State 69 (Near Perfect)", "description": "Virtually flawless with extraordinary eye appeal"},
    70: {"code": "MS-70", "name": "Mint State 70 (Perfect)", "description": "Flawless coin under 5x magnification, full strike and luster"},
}

# ---------------------------------------------------------------------------
# Strike & Paper Designations
# ---------------------------------------------------------------------------
COIN_STRIKE_DESIGNATIONS: dict[str, dict[str, str]] = {
    "DMPL": {"code": "DMPL", "name": "Deep Mirror Prooflike", "service": "PCGS", "desc": "6+ inch mirror reflection both sides (Morgan Dollars)"},
    "DPL": {"code": "DPL", "name": "Deep Prooflike", "service": "NGC", "desc": "NGC equivalent of DMPL"},
    "PL": {"code": "PL", "name": "Prooflike", "service": "PCGS/NGC", "desc": "2 to 4 inch mirror reflection in fields"},
    "CAM": {"code": "CAM", "name": "Cameo", "service": "PCGS/NGC", "desc": "Frosted devices contrasting with mirror fields on proofs"},
    "DCAM": {"code": "DCAM", "name": "Deep Cameo", "service": "PCGS", "desc": "Heavy frost on all devices with deep reflective fields"},
    "UC": {"code": "UC", "name": "Ultra Cameo", "service": "NGC", "desc": "NGC equivalent to Deep Cameo (DCAM)"},
    "FB": {"code": "FB", "name": "Full Bands", "service": "PCGS", "desc": "Completely split horizontal crossbands on Mercury Dimes or Roosevelts"},
    "FSB": {"code": "FSB", "name": "Full Split Bands", "service": "NGC", "desc": "NGC designation for split bands on Mercury Dimes"},
    "FS": {"code": "FS", "name": "Full Steps", "service": "PCGS/NGC", "desc": "5 or 6 complete uninterrupted steps on Monticello (Jefferson Nickels)"},
    "FBL": {"code": "FBL", "name": "Full Bell Lines", "service": "PCGS/NGC", "desc": "Complete horizontal lower bell lines on Franklin Halves"},
    "FH": {"code": "FH", "name": "Full Head", "service": "PCGS/NGC", "desc": "Complete hair line and ear hole on Standing Liberty Quarters"},
    "RD": {"code": "RD", "name": "Red", "service": "PCGS/NGC", "desc": "95%+ original red mint luster on copper coinage"},
    "RB": {"code": "RB", "name": "Red-Brown", "service": "PCGS/NGC", "desc": "Between 5% and 95% red mint color on copper"},
    "BN": {"code": "BN", "name": "Brown", "service": "PCGS/NGC", "desc": "Less than 5% red color; toned brown copper"},
}

BANKNOTE_DESIGNATIONS: dict[str, dict[str, str]] = {
    "EPQ": {"code": "EPQ", "name": "Exceptional Paper Quality", "service": "PMG", "desc": "Original paper without chemical, physical, or optical alterations"},
    "PPQ": {"code": "PPQ", "name": "Premium Paper Quality", "service": "PCGS_BANKNOTE", "desc": "Completely original paper surfaces and embossing"},
    "STAR": {"code": "STAR", "name": "Star Note (Replacement)", "service": "BEP", "desc": "Official replacement note printed with star symbol in serial"},
    "SPECIMEN": {"code": "SPECIMEN", "name": "Specimen Note", "service": "ALL", "desc": "Official archival or sample note with specimen overprint/perforation"},
}

# ---------------------------------------------------------------------------
# Card Grading Scales & Official Centering Rubrics
# ---------------------------------------------------------------------------
CARD_CONDITION_SCALES: dict[str, str] = {
    "10_GEM_MINT": "10 (Gem Mint / Pristine)",
    "9.5_MINT_PLUS": "9.5 (Mint+ / Gem Mint BGS)",
    "9_MINT": "9 (Mint)",
    "8.5_NM_MINT_PLUS": "8.5 (NM-MT+)",
    "8_NM_MINT": "8 (Near Mint-Mint)",
    "7.5_NM_PLUS": "7.5 (Near Mint+)",
    "7_NEAR_MINT": "7 (Near Mint)",
    "6_EX_MINT": "6 (Excellent-Mint)",
    "5_EXCELLENT": "5 (Excellent)",
    "4_VERY_GOOD_EX": "4 (Very Good-Excellent)",
    "3_VERY_GOOD": "3 (Very Good)",
    "2_GOOD": "2 (Good)",
    "1_POOR": "1 (Poor)",
}

CARD_CENTERING_RUBRICS: dict[str, dict[str, Any]] = {
    "PSA_10": {"service": "PSA", "grade": "10", "front_tolerance": "55/45 to 60/40", "back_tolerance": "75/25", "desc": "Gem Mint standard"},
    "PSA_9": {"service": "PSA", "grade": "9", "front_tolerance": "65/35", "back_tolerance": "90/10", "desc": "Mint standard"},
    "PSA_8": {"service": "PSA", "grade": "8", "front_tolerance": "70/30", "back_tolerance": "90/10", "desc": "Near Mint-Mint standard"},
    "BGS_BLACK_LABEL": {"service": "BGS", "grade": "10 Black Label", "front_tolerance": "50/50", "back_tolerance": "50/50", "desc": "Perfect subgrades 10/10/10/10"},
    "BGS_PRISTINE_10": {"service": "BGS", "grade": "10 Pristine", "front_tolerance": "50/50 to 55/45", "back_tolerance": "60/40", "desc": "Three 10s and one 9.5 subgrade minimum"},
    "BGS_GEM_9.5": {"service": "BGS", "grade": "9.5 Gem Mint", "front_tolerance": "50/50 to 55/45", "back_tolerance": "60/40", "desc": "Three 9.5s and one 9.0 subgrade minimum"},
    "CGC_PRISTINE_10": {"service": "CGC", "grade": "10 Pristine", "front_tolerance": "50/50", "back_tolerance": "55/45", "desc": "Flawless under 10x magnification"},
    "TAG_1000": {"service": "TAG", "grade": "1000", "front_tolerance": "Sub-millimeter algorithmic measurement", "back_tolerance": "DIG verification report", "desc": "Algorithmic 1000-point photogrammetry score"},
}

# ---------------------------------------------------------------------------
# Vintage Slab Generation Detector & Old Holder Premiums
# ---------------------------------------------------------------------------
_SLAB_GENERATION_PATTERNS: list[tuple[re.Pattern[str], dict[str, str]]] = [
    (
        re.compile(r"\b(?:RATTLER|GEN\s*1(?:\.2)?)\b", re.I),
        {
            "service": "PCGS",
            "generation": "Gen 1.2 (Rattler)",
            "era": "1986–1989",
            "premium_tier": "HIGH",
            "notes": "Small white two-piece holder where coin rattles inside; highly collected with strong green label premium.",
        },
    ),
    (
        re.compile(r"\b(?:DOILY|GEN\s*2(?:\.1)?)\b", re.I),
        {
            "service": "PCGS",
            "generation": "Gen 2.1 (Doily)",
            "era": "1989",
            "premium_tier": "VERY_HIGH",
            "notes": "Intricate lace-like doily background print; in use for only ~6 months; exceptionally scarce collector holder.",
        },
    ),
    (
        re.compile(r"\b(?:OGH|OLD\s+GREEN\s+HOLDER|GEN\s*3)\b", re.I),
        {
            "service": "PCGS",
            "generation": "Gen 3 (Old Green Holder / OGH)",
            "era": "1990–1998",
            "premium_tier": "MEDIUM_HIGH",
            "notes": "Classic dark green label; renowned for conservative grading standards and CAC bean stickering candidates.",
        },
    ),
    (
        re.compile(r"\b(?:FATTY|OLD\s+FATTY|NGC\s+NO\s+LINE)\b", re.I),
        {
            "service": "NGC",
            "generation": "NGC Fatty (Gen 1–3)",
            "era": "1987–1997",
            "premium_tier": "MEDIUM_HIGH",
            "notes": "Thick two-piece NGC holder without top rim line; conservative early NGC grading standard.",
        },
    ),
    (
        re.compile(r"\b(?:PSA\s+OLD\s+FLIP|PSA\s+RED\s+BORDER|PSA\s+GEN\s*1)\b", re.I),
        {
            "service": "PSA",
            "generation": "PSA Gen 1 / Old Flip",
            "era": "1991–1999",
            "premium_tier": "MEDIUM",
            "notes": "Early PSA label without hologram or modern security features.",
        },
    ),
]


def detect_slab_generation(text: str) -> dict[str, str] | None:
    """Detect whether slab text or cert description indicates a vintage holder generation."""
    if not text:
        return None
    for pattern, info in _SLAB_GENERATION_PATTERNS:
        if pattern.search(text):
            return dict(info)
    return None


def get_cac_eligibility(grading_service: str, grade: str) -> dict[str, Any]:
    """
    Return CAC (Certified Acceptance Corp) Green/Gold sticker eligibility.
    CAC evaluates PCGS and NGC slabs only; CACG is their own grading service.
    """
    srv = (grading_service or "").strip().upper()
    is_eligible = srv in ("PCGS", "NGC")
    return {
        "eligible_for_cac_sticker": is_eligible,
        "eligible_services": ["PCGS", "NGC"],
        "verification_url": "https://www.caccoin.com",
        "description": "CAC awards Green Bean for solid/high-end for the grade, Gold Bean for undergraded items.",
        "note": "CACG is CAC's standalone grading service; CAC stickering applies to PCGS and NGC holders.",
    }


# ---------------------------------------------------------------------------
# Collector Glossary & Hobby Jargon Lookup
# ---------------------------------------------------------------------------
COLLECTOR_GLOSSARY: dict[str, dict[str, str]] = {
    "VAM": {"term": "VAM", "category": "COIN", "full_name": "Van Allen-Mallis", "desc": "Comprehensive variety reference system for Morgan and Peace silver dollars by Leroy Van Allen and A. George Mallis."},
    "DDO": {"term": "DDO", "category": "COIN", "full_name": "Doubled Die Obverse", "desc": "Minting error where the obverse die received multiple misaligned impressions from the hub."},
    "DDR": {"term": "DDR", "category": "COIN", "full_name": "Doubled Die Reverse", "desc": "Minting error where the reverse die received multiple misaligned impressions from the hub."},
    "RPM": {"term": "RPM", "category": "COIN", "full_name": "Repunched Mint Mark", "desc": "Mint mark punched into the working die more than once in slightly different positions."},
    "OMM": {"term": "OMM", "category": "COIN", "full_name": "Over Mint Mark", "desc": "One mint mark punched over a different mint mark on the same die (e.g. 1938-D/S)."},
    "OGH": {"term": "OGH", "category": "COIN", "full_name": "Old Green Holder", "desc": "PCGS slab generation (1990–1998) featuring a green label, often commanding a market premium."},
    "CAC": {"term": "CAC", "category": "COIN", "full_name": "Certified Acceptance Corporation", "desc": "Independent third-party verification that affixes Green (solid for grade) or Gold (undergraded) stickers."},
    "EPQ": {"term": "EPQ", "category": "PAPER", "full_name": "Exceptional Paper Quality", "desc": "PMG paper designation denoting completely original, unpressed, chemically unaltered banknote paper."},
    "PPQ": {"term": "PPQ", "category": "PAPER", "full_name": "Premium Paper Quality", "desc": "PCGS Banknote designation for unaltered, original paper surfaces with crisp embossing."},
    "RPA": {"term": "RPA", "category": "CARD", "full_name": "Rookie Patch Auto", "desc": "High-end modern sports card featuring a rookie player, authentic game-worn patch swatch, and on-card or sticker autograph."},
    "SSP": {"term": "SSP", "category": "CARD", "full_name": "Super Short Print", "desc": "Trading card inserted into packs at an extremely low print run / high rarity ratio."},
    "SIR": {"term": "SIR", "category": "CARD", "full_name": "Special Illustration Rare", "desc": "Modern Pokémon TCG top-tier rarity card featuring textured full-card artwork."},
    "SAR": {"term": "SAR", "category": "CARD", "full_name": "Special Art Rare", "desc": "Japanese Pokémon TCG equivalent of Special Illustration Rare."},
    "TG": {"term": "TG", "category": "CARD", "full_name": "Trainer Gallery", "desc": "Subset of Pokémon cards highlighting Pokémon paired with their iconic trainer."},
    "REFRACTOR": {"term": "REFRACTOR", "category": "CARD", "full_name": "Refractor / Rainbow Parallel", "desc": "Metallic foil card treatment introduced by Topps Chrome that reflects rainbow light spectrums."},
}


def lookup_glossary_term(term: str) -> dict[str, str] | None:
    """Return dictionary definition and metadata for a collector abbreviation or slang term."""
    key = re.sub(r"[^A-Za-z0-9]", "", term or "").upper()
    if key in COLLECTOR_GLOSSARY:
        return COLLECTOR_GLOSSARY[key]
    if key in COIN_STRIKE_DESIGNATIONS:
        c = COIN_STRIKE_DESIGNATIONS[key]
        return {"term": c["code"], "category": "COIN", "full_name": c["name"], "desc": c["desc"]}
    if key in BANKNOTE_DESIGNATIONS:
        b = BANKNOTE_DESIGNATIONS[key]
        return {"term": b["code"], "category": "PAPER", "full_name": b["name"], "desc": b["desc"]}
    return None

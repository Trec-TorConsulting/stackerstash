from __future__ import annotations

import re
from typing import Any

# ---------------------------------------------------------------------------
# Federal Reserve Bank Districts (12 Districts: A1 to L12)
# ---------------------------------------------------------------------------
FRB_DISTRICTS: dict[str, dict[str, str]] = {
    "A": {"number": "1", "code": "A1", "bank": "Boston", "letter": "A"},
    "B": {"number": "2", "code": "B2", "bank": "New York", "letter": "B"},
    "C": {"number": "3", "code": "C3", "bank": "Philadelphia", "letter": "C"},
    "D": {"number": "4", "code": "D4", "bank": "Cleveland", "letter": "D"},
    "E": {"number": "5", "code": "E5", "bank": "Richmond", "letter": "E"},
    "F": {"number": "6", "code": "F6", "bank": "Atlanta", "letter": "F"},
    "G": {"number": "7", "code": "G7", "bank": "Chicago", "letter": "G"},
    "H": {"number": "8", "code": "H8", "bank": "St. Louis", "letter": "H"},
    "I": {"number": "9", "code": "I9", "bank": "Minneapolis", "letter": "I"},
    "J": {"number": "10", "code": "J10", "bank": "Kansas City", "letter": "J"},
    "K": {"number": "11", "code": "K11", "bank": "Dallas", "letter": "K"},
    "L": {"number": "12", "code": "L12", "bank": "San Francisco", "letter": "L"},
}

# ---------------------------------------------------------------------------
# Goldback Complete State Matrix & Alpha / First-Year Registry
# ---------------------------------------------------------------------------
GOLDBACK_STATE_MATRIX: dict[str, dict[str, Any]] = {
    "UTAH": {"state": "Utah", "first_year": 2019, "has_alpha": True, "series_active": True},
    "NEVADA": {"state": "Nevada", "first_year": 2020, "has_alpha": True, "series_active": True},
    "NEW HAMPSHIRE": {"state": "New Hampshire", "first_year": 2021, "has_alpha": True, "series_active": True},
    "WYOMING": {"state": "Wyoming", "first_year": 2022, "has_alpha": True, "series_active": True},
    "SOUTH DAKOTA": {"state": "South Dakota", "first_year": 2023, "has_alpha": True, "series_active": True},
    "FLORIDA": {"state": "Florida", "first_year": 2024, "has_alpha": True, "series_active": True},
    "OKLAHOMA": {"state": "Oklahoma", "first_year": 2025, "has_alpha": True, "series_active": True},
    "ARIZONA": {"state": "Arizona", "first_year": 2025, "has_alpha": True, "series_active": True},
}


# ---------------------------------------------------------------------------
# Deterministic Fancy Serial Number Detector & Scorer
# ---------------------------------------------------------------------------
def _is_date_serial(digits: str) -> bool:
    """Check if 8 digits match MMDDYYYY or YYYYMMDD date format."""
    if len(digits) != 8:
        return False
    # MMDDYYYY
    mm = int(digits[:2])
    dd = int(digits[2:4])
    yyyy = int(digits[4:])
    if 1 <= mm <= 12 and 1 <= dd <= 31 and 1776 <= yyyy <= 2030:
        return True
    # YYYYMMDD
    yyyy2 = int(digits[:4])
    mm2 = int(digits[4:6])
    dd2 = int(digits[6:])
    if 1776 <= yyyy2 <= 2030 and 1 <= mm2 <= 12 and 1 <= dd2 <= 31:
        return True
    return False


def analyze_us_serial(serial_number: str) -> dict[str, Any]:
    """
    Deterministically analyze a US currency serial number for fancy patterns,
    rarity tiers, Federal Reserve Bank district, and replacement/facility markers.
    """
    raw = (serial_number or "").strip().upper()
    if not raw:
        return {
            "cleaned": "",
            "is_valid_us_serial": False,
            "patterns": [],
            "rarity_tier": "COMMON",
            "summary": "Empty serial number",
        }

    is_star = "*" in raw or raw.endswith("STAR")
    is_fw = "FW" in raw or "FORT WORTH" in raw

    # Extract leading letter, digits, trailing letter/star
    # Standard modern US serial: 1-2 prefix letters, 8 digits, 1 suffix letter or star
    m = re.search(r"([A-Z]{1,2})\s*(\d{8})\s*([A-Z\*])", raw)
    if m:
        prefix, digits, suffix = m.group(1), m.group(2), m.group(3)
    else:
        # Fallback to extracting just digits
        m_dig = re.search(r"(\d{4,8})", raw)
        if not m_dig:
            return {
                "cleaned": raw,
                "is_valid_us_serial": False,
                "patterns": [],
                "rarity_tier": "COMMON",
                "summary": "Could not extract digits from serial",
            }
        digits = m_dig.group(1).zfill(8)
        prefix = raw[0] if raw and raw[0].isalpha() else ""
        suffix = "*" if is_star else (raw[-1] if raw and raw[-1].isalpha() else "")

    # Resolve FRB district from first letter of prefix (or second on modern 1996+ series)
    frb_letter = prefix[-1] if len(prefix) >= 2 else (prefix[0] if prefix else "")
    district_info = FRB_DISTRICTS.get(frb_letter, {})

    patterns: list[str] = []
    rarity = "COMMON"

    # Analyze digits
    unique_digits = set(digits)
    num_unique = len(unique_digits)
    numeric_val = int(digits)

    # 1. Solid (all 8 identical)
    if num_unique == 1:
        patterns.append("SOLID")
        rarity = "GRAIL"
    # 2. Near Solid (7 identical)
    elif max(digits.count(d) for d in unique_digits) == 7:
        patterns.append("NEAR_SOLID")
        rarity = "ULTRA_RARE"
    # 3. Low Serial (< 1000)
    if numeric_val < 1000:
        patterns.append("LOW_SERIAL")
        if numeric_val <= 10:
            rarity = "GRAIL"
        elif numeric_val <= 100 and rarity != "GRAIL":
            rarity = "ULTRA_RARE"
        elif rarity == "COMMON":
            rarity = "RARE"
    # 4. High Serial (> 99999000)
    elif numeric_val > 99999000:
        patterns.append("HIGH_SERIAL")
        rarity = "ULTRA_RARE" if numeric_val >= 99999900 else "RARE"
    # 5. Radar (palindromic e.g. 12344321)
    if digits == digits[::-1] and num_unique > 1:
        patterns.append("RADAR")
        if num_unique == 2:
            patterns.append("SUPER_RADAR")
            rarity = "ULTRA_RARE"
        elif rarity == "COMMON":
            rarity = "RARE"
    # 6. Repeater (e.g. 12341234 or 12121212)
    if digits[:4] == digits[4:] and num_unique > 1:
        patterns.append("REPEATER")
        if digits[:2] * 4 == digits:
            patterns.append("SUPER_REPEATER")
            rarity = "ULTRA_RARE"
        elif rarity == "COMMON":
            rarity = "RARE"
    # 7. Binary (exactly 2 unique digits)
    if num_unique == 2:
        patterns.append("BINARY")
        if set(unique_digits).issubset({"0", "1"}):
            patterns.append("TRUE_BINARY")
            if rarity in ("COMMON", "RARE"):
                rarity = "ULTRA_RARE"
        elif rarity == "COMMON":
            rarity = "SCARCE"
    # 8. Ladder (ascending or descending)
    if digits in ("01234567", "12345678", "23456789", "98765432", "87654321", "76543210"):
        patterns.append("LADDER")
        rarity = "GRAIL" if digits in ("12345678", "87654321") else "ULTRA_RARE"
    # 9. Rotator / Flipper (reads upside down using 0, 1, 6, 8, 9)
    rotator_map = {"0": "0", "1": "1", "6": "9", "8": "8", "9": "6"}
    if all(d in rotator_map for d in digits):
        rotated = "".join(rotator_map[d] for d in reversed(digits))
        if rotated == digits:
            patterns.append("ROTATOR")
            if rarity in ("COMMON", "SCARCE"):
                rarity = "RARE"
    # 10. Bookends (first 2-3 match last 2-3)
    if digits[:2] == digits[-2:] and "REPEATER" not in patterns:
        patterns.append("BOOKENDS")
        if rarity == "COMMON":
            rarity = "MINOR"
    # 11. Birthday / Date Serial
    if _is_date_serial(digits) and num_unique >= 4:
        patterns.append("BIRTHDAY")
        if rarity == "COMMON":
            rarity = "SCARCE"
    # 12. Star note
    if is_star:
        patterns.append("STAR_NOTE")
        if rarity == "COMMON":
            rarity = "SCARCE"

    summary_parts = []
    if is_star:
        summary_parts.append("Star Note")
    if patterns:
        summary_parts.append(" / ".join(p.replace("_", " ").title() for p in patterns))
    else:
        summary_parts.append("Standard Serial")

    return {
        "cleaned": f"{prefix}{digits}{suffix}".strip(),
        "digits": digits,
        "is_valid_us_serial": True,
        "prefix": prefix,
        "suffix": suffix,
        "is_star_note": is_star,
        "is_fort_worth": is_fw,
        "frb_district": district_info.get("code", ""),
        "frb_bank": district_info.get("bank", ""),
        "patterns": patterns,
        "rarity_tier": rarity,
        "summary": " — ".join(summary_parts),
    }

from __future__ import annotations

import re
from decimal import Decimal
from typing import Any

# All official Goldback denominations (1 Goldback = 1/1,000 ozt 24K .9999 gold)
GOLDBACK_DENOMINATION_WEIGHTS: dict[str, Decimal] = {
    "1/4": Decimal("0.000250"),
    "1/2": Decimal("0.000500"),
    "1": Decimal("0.001000"),
    "2": Decimal("0.002000"),
    "5": Decimal("0.005000"),
    "10": Decimal("0.010000"),
    "25": Decimal("0.025000"),
    "50": Decimal("0.050000"),
    "100": Decimal("0.100000"),
}

GOLDBACK_STATES: tuple[str, ...] = (
    "Utah",
    "Nevada",
    "New Hampshire",
    "Wyoming",
    "South Dakota",
    "Florida",
    "Oklahoma",
    "Arizona",
    "Idaho",
    "California",
    "Washington D.C.",
    "Texas",
)

GOLDBACK_PURITY = Decimal("0.999900")

_WORD_TO_DENOM: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\b(?:1/4|0\.25|one[\s-]+fourth|quarter)\s*(?:gb|goldback)?\b", re.I), "1/4"),
    (re.compile(r"\b(?:1/2|0\.5|one[\s-]+half|half)\s*(?:gb|goldback)?\b", re.I), "1/2"),
    (re.compile(r"\b(?:1/4000|1/4,000)\b", re.I), "1/4"),
    (re.compile(r"\b(?:1/2000|1/2,000)\b", re.I), "1/2"),
    (re.compile(r"\b(?:1/1000|1/1,000)\b", re.I), "1"),
    (re.compile(r"\b(?:1/500)\b", re.I), "2"),
    (re.compile(r"\b(?:1/200)\b", re.I), "5"),
    (re.compile(r"\b(?:1/100)\b", re.I), "10"),
    (re.compile(r"\b(?:1/40)\b", re.I), "25"),
    (re.compile(r"\b(?:1/20)\b", re.I), "50"),
    (re.compile(r"\b(?:1/10)\b", re.I), "100"),
)

_NUM_BEFORE_GOLDBACK_RE = re.compile(
    r"\b(1/4|1/2|100|50|25|10|5|2|1)\s*[-]?\s*goldbacks?\b", re.I
)
_EXACT_DENOM_RE = re.compile(r"^\s*(1/4|1/2|100|50|25|10|5|2|1)(?:\s+goldbacks?)?\s*$", re.I)


def is_goldback_text(*parts: str | None) -> bool:
    """Return True if any text field identifies a Goldback Aurum gold foil note."""
    combined = " ".join(p for p in parts if p).lower()
    return "goldback" in combined


def parse_goldback_denomination(
    denomination: str = "",
    title: str = "",
    notes: str = "",
) -> str | None:
    """Extract canonical Goldback denomination ('1/4' .. '100') from item fields."""
    if denomination:
        m = _EXACT_DENOM_RE.match(denomination)
        if m:
            return m.group(1)

    for text in (denomination, title, notes):
        if not text:
            continue
        m = _NUM_BEFORE_GOLDBACK_RE.search(text)
        if m:
            return m.group(1)

    for text in (denomination, title, notes):
        if not text:
            continue
        for pat, canon in _WORD_TO_DENOM:
            if pat.search(text):
                return canon
    return None


def get_goldback_weight_ozt(denom: str | None) -> Decimal | None:
    """Return exact 24K gold troy-ounce weight for a canonical Goldback denomination."""
    if not denom:
        return None
    return GOLDBACK_DENOMINATION_WEIGHTS.get(denom)


def normalize_goldback_candidate(candidate: dict[str, Any]) -> dict[str, Any]:
    """
    Deterministically enforce Goldback taxonomy, 24K (.9999) gold purity, and exact
    fractional troy-ounce weight when Vision AI or OCR identifies a Goldback note.
    """
    if not is_goldback_text(
        str(candidate.get("title") or ""),
        str(candidate.get("series") or ""),
        str(candidate.get("denomination") or ""),
        str(candidate.get("mint_or_refiner") or ""),
        str(candidate.get("notes") or ""),
    ):
        return candidate

    denom = parse_goldback_denomination(
        str(candidate.get("denomination") or ""),
        str(candidate.get("title") or ""),
        str(candidate.get("notes") or ""),
    )
    weight_ozt = get_goldback_weight_ozt(denom)

    candidate["category"] = "PAPER"
    if not str(candidate.get("country") or "").strip():
        candidate["country"] = "United States"
    candidate["metal_type"] = "GOLD"
    candidate["weight_unit"] = "OZ_T"
    candidate["purity"] = float(GOLDBACK_PURITY)
    if not str(candidate.get("mint_or_refiner") or "").strip():
        candidate["mint_or_refiner"] = "Goldback Inc. / Aurum"

    if denom and weight_ozt is not None:
        candidate["denomination"] = f"{denom} Goldback"
        candidate["weight_value"] = float(weight_ozt)
    return candidate

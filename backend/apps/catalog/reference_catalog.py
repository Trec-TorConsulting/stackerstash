from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

# Goldback fractional denominations -> fine troy ounces of 24K (.9999) gold
GOLDBACK_DENOM_OZT: dict[str, str] = {
    "1/4": "0.00025",
    "1/2": "0.0005",
    "1": "0.001",
    "2": "0.002",
    "5": "0.005",
    "10": "0.01",
    "25": "0.025",
    "50": "0.05",
    "100": "0.1",
}

GOLDBACK_STATES: tuple[str, ...] = (
    "UTAH",
    "NEVADA",
    "NEW HAMPSHIRE",
    "WYOMING",
    "SOUTH DAKOTA",
    "FLORIDA",
    "OKLAHOMA",
    "ARIZONA",
)


@dataclass(frozen=True)
class ReferenceItem:
    key: str
    title: str
    category: str
    country: str
    mint_or_refiner: str
    denomination: str
    series: str
    metal_type: str
    weight_value: str
    weight_unit: str
    purity: str
    keywords: tuple[str, ...]
    secondary_keywords: tuple[str, ...] = ()
    diameter_mm: str | None = None
    thickness_mm: str | None = None
    gross_weight_grams: str | None = None
    composition: str = ""
    edge_type: str = ""
    confidence: float = 0.88


STATIC_REFERENCE_CATALOG: tuple[ReferenceItem, ...] = (
    ReferenceItem(
        key="us_ase_1oz",
        title="American Silver Eagle 1 oz",
        category="COIN",
        country="United States",
        mint_or_refiner="U.S. Mint",
        denomination="$1",
        series="American Silver Eagle",
        metal_type="SILVER",
        weight_value="1.0000",
        weight_unit="OZ_T",
        purity="0.999000",
        keywords=("AMERICAN SILVER EAGLE", "WALKING LIBERTY", "1 OZ. FINE SILVER"),
        secondary_keywords=("ONE DOLLAR", "E PLURIBUS UNUM", "IN GOD WE TRUST", "UNITED STATES OF AMERICA"),
        diameter_mm="40.6",
        thickness_mm="2.98",
        gross_weight_grams="31.103",
        composition="99.9% Silver",
        edge_type="Reeded",
        confidence=0.90,
    ),
    ReferenceItem(
        key="us_age_1oz",
        title="American Gold Eagle 1 oz",
        category="COIN",
        country="United States",
        mint_or_refiner="U.S. Mint",
        denomination="$50",
        series="American Gold Eagle",
        metal_type="GOLD",
        weight_value="1.0000",
        weight_unit="OZ_T",
        purity="0.916700",
        keywords=("50 DOLLARS", "1 OZ. FINE GOLD", "AMERICAN GOLD EAGLE"),
        secondary_keywords=("UNITED STATES OF AMERICA", "IN GOD WE TRUST"),
        diameter_mm="32.7",
        thickness_mm="2.87",
        gross_weight_grams="33.93",
        composition="91.67% Gold, 3% Silver, 5.33% Copper",
        edge_type="Reeded",
        confidence=0.90,
    ),
    ReferenceItem(
        key="us_gold_buffalo_1oz",
        title="American Gold Buffalo 1 oz",
        category="COIN",
        country="United States",
        mint_or_refiner="U.S. Mint",
        denomination="$50",
        series="American Gold Buffalo",
        metal_type="GOLD",
        weight_value="1.0000",
        weight_unit="OZ_T",
        purity="0.999900",
        keywords=("1 OZ. .9999 FINE GOLD", "GOLD BUFFALO"),
        secondary_keywords=("UNITED STATES OF AMERICA", "$50"),
        diameter_mm="32.7",
        thickness_mm="2.95",
        gross_weight_grams="31.103",
        composition="99.99% Gold",
        edge_type="Reeded",
        confidence=0.90,
    ),
    ReferenceItem(
        key="ca_silver_maple_1oz",
        title="Canadian Silver Maple Leaf 1 oz",
        category="COIN",
        country="Canada",
        mint_or_refiner="Royal Canadian Mint",
        denomination="$5",
        series="Silver Maple Leaf",
        metal_type="SILVER",
        weight_value="1.0000",
        weight_unit="OZ_T",
        purity="0.999900",
        keywords=("FINE SILVER 1 OZ ARGENT PUR", "CANADA 9999", "MAPLE LEAF"),
        secondary_keywords=("5 DOLLARS", "ELIZABETH II", "CHARLES III"),
        diameter_mm="38.0",
        thickness_mm="3.29",
        gross_weight_grams="31.103",
        composition="99.99% Silver",
        edge_type="Reeded",
        confidence=0.90,
    ),
    ReferenceItem(
        key="ca_gold_maple_1oz",
        title="Canadian Gold Maple Leaf 1 oz",
        category="COIN",
        country="Canada",
        mint_or_refiner="Royal Canadian Mint",
        denomination="$50",
        series="Gold Maple Leaf",
        metal_type="GOLD",
        weight_value="1.0000",
        weight_unit="OZ_T",
        purity="0.999900",
        keywords=("FINE GOLD 1 OZ OR PUR", "50 DOLLARS"),
        secondary_keywords=("CANADA", "9999"),
        diameter_mm="30.0",
        thickness_mm="2.80",
        gross_weight_grams="31.103",
        composition="99.99% Gold",
        edge_type="Reeded",
        confidence=0.90,
    ),
    ReferenceItem(
        key="gb_silver_britannia_1oz",
        title="British Silver Britannia 1 oz",
        category="COIN",
        country="United Kingdom",
        mint_or_refiner="Royal Mint",
        denomination="£2",
        series="Britannia",
        metal_type="SILVER",
        weight_value="1.0000",
        weight_unit="OZ_T",
        purity="0.999000",
        keywords=("BRITANNIA", "999 FINE SILVER", "2 POUNDS"),
        secondary_keywords=("1 OZ", "ELIZABETH II", "CHARLES III"),
        diameter_mm="38.61",
        thickness_mm="3.0",
        gross_weight_grams="31.103",
        composition="99.9% Silver",
        edge_type="Reeded",
        confidence=0.89,
    ),
    ReferenceItem(
        key="za_krugerrand_1oz_gold",
        title="South African Gold Krugerrand 1 oz",
        category="COIN",
        country="South Africa",
        mint_or_refiner="Rand Refinery",
        denomination="1 oz",
        series="Krugerrand",
        metal_type="GOLD",
        weight_value="1.0000",
        weight_unit="OZ_T",
        purity="0.916700",
        keywords=("KRUGERRAND", "FYNGOUD 1 OZ FINE GOLD"),
        secondary_keywords=("SUID-AFRIKA", "SOUTH AFRICA"),
        diameter_mm="32.77",
        thickness_mm="2.84",
        gross_weight_grams="33.93",
        composition="91.67% Gold, 8.33% Copper",
        edge_type="Reeded",
        confidence=0.90,
    ),
    ReferenceItem(
        key="mx_silver_libertad_1oz",
        title="Mexican Silver Libertad 1 oz",
        category="COIN",
        country="Mexico",
        mint_or_refiner="Casa de Moneda de Mexico",
        denomination="1 Onza",
        series="Libertad",
        metal_type="SILVER",
        weight_value="1.0000",
        weight_unit="OZ_T",
        purity="0.999000",
        keywords=("1 ONZA PLATA PURA", "LEY .999", "LIBERTAD"),
        secondary_keywords=("ESTADOS UNIDOS MEXICANOS", "MEXICO"),
        diameter_mm="40.0",
        thickness_mm="3.0",
        gross_weight_grams="31.103",
        composition="99.9% Silver",
        edge_type="Reeded",
        confidence=0.89,
    ),
    ReferenceItem(
        key="us_morgan_dollar",
        title="Morgan Silver Dollar",
        category="COIN",
        country="United States",
        mint_or_refiner="U.S. Mint",
        denomination="$1",
        series="Morgan Dollar",
        metal_type="SILVER",
        weight_value="0.7734",
        weight_unit="OZ_T",
        purity="0.900000",
        keywords=("MORGAN", "MORGAN DOLLAR"),
        secondary_keywords=("ONE DOLLAR", "UNITED STATES OF AMERICA", "E PLURIBUS UNUM"),
        diameter_mm="38.1",
        thickness_mm="2.4",
        gross_weight_grams="26.73",
        composition="90% Silver, 10% Copper",
        edge_type="Reeded",
        confidence=0.87,
    ),
    ReferenceItem(
        key="us_peace_dollar",
        title="Peace Silver Dollar",
        category="COIN",
        country="United States",
        mint_or_refiner="U.S. Mint",
        denomination="$1",
        series="Peace Dollar",
        metal_type="SILVER",
        weight_value="0.7734",
        weight_unit="OZ_T",
        purity="0.900000",
        keywords=("PEACE", "PEACE DOLLAR"),
        secondary_keywords=("ONE DOLLAR", "TRVST", "LIBERTY"),
        diameter_mm="38.1",
        thickness_mm="2.4",
        gross_weight_grams="26.73",
        composition="90% Silver, 10% Copper",
        edge_type="Reeded",
        confidence=0.87,
    ),
    ReferenceItem(
        key="geiger_silver_bar_1oz",
        title="Geiger Edelmetalle 1 oz Silver Bar",
        category="BAR",
        country="Germany",
        mint_or_refiner="Geiger Edelmetalle",
        denomination="",
        series="Geiger Original",
        metal_type="SILVER",
        weight_value="1.0000",
        weight_unit="OZ_T",
        purity="0.999000",
        keywords=("GEIGER", "EDELMETALLE", "FEINSILBER"),
        secondary_keywords=("999", "1 OZ", "31.1"),
        gross_weight_grams="31.103",
        composition="99.9% Silver",
        confidence=0.88,
    ),
    ReferenceItem(
        key="pamp_gold_bar_1oz",
        title="PAMP Suisse 1 oz Gold Bar",
        category="BAR",
        country="Switzerland",
        mint_or_refiner="PAMP Suisse",
        denomination="",
        series="Fortuna",
        metal_type="GOLD",
        weight_value="1.0000",
        weight_unit="OZ_T",
        purity="0.999900",
        keywords=("PAMP", "SUISSE", "ESSAYEUR FONDEUR"),
        secondary_keywords=("999.9", "FINE GOLD", "1 OZ"),
        gross_weight_grams="31.103",
        composition="99.99% Gold",
        confidence=0.89,
    ),
)


def _match_goldback(upper: str, hints: dict[str, Any]) -> dict[str, Any] | None:
    if "GOLDBACK" not in upper and "NEGOTIABLE INSTRUMENT" not in upper and "24K GOLD" not in upper:
        return None
    if "GOLDBACK" not in upper:
        return None

    state = ""
    for st in GOLDBACK_STATES:
        if st in upper:
            state = st.title()
            break

    denom = ""
    # Check fractional Goldbacks first (e.g. "1/4", "1/2", "1/4000th", "1/2000th")
    if re.search(r"\b1\s*/\s*4\b", upper) or "ONE FOURTH" in upper or "1/4000" in upper:
        denom = "1/4"
    elif re.search(r"\b1\s*/\s*2\b", upper) or "ONE HALF" in upper or "1/2000" in upper:
        denom = "1/2"
    else:
        for d in ("100", "50", "25", "10", "5", "2", "1"):
            if re.search(rf"\b{d}\s+GOLDBACK", upper) or re.search(rf"\bGOLDBACK\b.*\b{d}\b", upper):
                denom = d
                break
        if not denom and hints.get("denomination"):
            cleaned = str(hints["denomination"]).replace("Goldback", "").strip()
            if cleaned in GOLDBACK_DENOM_OZT:
                denom = cleaned

    weight_ozt = GOLDBACK_DENOM_OZT.get(denom, "0.001")
    year = str(hints.get("year") or "")
    if not year:
        ym = re.search(r"\b(2019|202\d)\b", upper)
        if ym:
            year = ym.group(1)

    # Avoid duplicating "Goldback"
    if denom:
        title = " ".join(p for p in (year, state, denom, "Goldback") if p)
    else:
        title = " ".join(p for p in (year, state, "Goldback") if p)

    return {
        "matched": True,
        "key": f"goldback_{state.lower().replace(' ', '_') or 'us'}_{denom or '1'}",
        "confidence": 0.92 if (state and denom) else 0.82,
        "source": "STATIC_CATALOG",
        "candidate": {
            "category": "PAPER",
            "title": title,
            "country": "United States",
            "year": year,
            "mint_or_refiner": "Goldback Inc.",
            "denomination": f"{denom} Goldback" if denom else "Goldback",
            "series": f"{state} Goldback" if state else "Goldback",
            "metal_type": "GOLD",
            "weight_value": weight_ozt,
            "weight_unit": "OZ_T",
            "purity": "0.999900",
            "grading_service": hints.get("grading_service") or "NONE",
            "cert_number": hints.get("cert_number") or "",
            "grade": hints.get("grade") or "",
            "serial_number": hints.get("serial_number") or "",
            "ai_confidence": 0.92 if (state and denom) else 0.82,
            "notes": "Matched locally from static Goldback reference catalog.",
        },
        "specs": {
            "composition": "99.99% 24K Gold (Polymer Foil)",
        },
    }


def match_static_reference(
    ocr_text: str,
    hints: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """
    Match OCR text and parsed numismatic hints against the server-hosted static
    reference catalog. Returns a structured match dict with candidate + specs,
    or None when no confident match exists.
    """
    text = (ocr_text or "").strip()
    if not text:
        return None
    upper = text.upper()
    hints = hints or {}

    # 1. Goldbacks (very high precision via state + fractional denominator)
    gb = _match_goldback(upper, hints)
    if gb is not None:
        return gb

    # 2. Classic & bullion reference catalog entries
    best_item: ReferenceItem | None = None
    best_score = 0
    for item in STATIC_REFERENCE_CATALOG:
        primary_hits = sum(1 for kw in item.keywords if kw in upper)
        secondary_hits = sum(1 for kw in item.secondary_keywords if kw in upper)
        if primary_hits == 0:
            continue
        score = primary_hits * 3 + secondary_hits
        # Require either a very specific primary phrase or corroborating context
        if score >= 3 and score > best_score:
            best_score = score
            best_item = item

    if best_item is None:
        return None

    year = str(hints.get("year") or "")
    grading_service = str(hints.get("grading_service") or "NONE")
    category = "SLAB" if grading_service != "NONE" else best_item.category
    title = f"{year} {best_item.title}".strip() if year else best_item.title

    return {
        "matched": True,
        "key": best_item.key,
        "confidence": best_item.confidence,
        "source": "STATIC_CATALOG",
        "candidate": {
            "category": category,
            "title": title,
            "country": best_item.country,
            "year": year,
            "mint_or_refiner": best_item.mint_or_refiner,
            "denomination": best_item.denomination,
            "series": best_item.series,
            "metal_type": best_item.metal_type,
            "weight_value": best_item.weight_value,
            "weight_unit": best_item.weight_unit,
            "purity": best_item.purity,
            "grading_service": grading_service,
            "cert_number": str(hints.get("cert_number") or ""),
            "grade": str(hints.get("grade") or ""),
            "serial_number": str(hints.get("serial_number") or ""),
            "ai_confidence": best_item.confidence,
            "notes": "Matched locally from static collectible reference catalog.",
        },
        "specs": {
            "diameter_mm": best_item.diameter_mm,
            "thickness_mm": best_item.thickness_mm,
            "gross_weight_grams": best_item.gross_weight_grams,
            "composition": best_item.composition,
            "edge_type": best_item.edge_type,
        },
    }

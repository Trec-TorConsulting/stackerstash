from __future__ import annotations

from decimal import Decimal
from typing import Any

# ---------------------------------------------------------------------------
# Coin Diameter to Air-Tite & Lighthouse Capsule Mapping
# ---------------------------------------------------------------------------
AIR_TITE_CAPSULE_TABLE: list[dict[str, Any]] = [
    {"min_mm": 13.0, "max_mm": 16.5, "direct_fit": "A16", "ring_model": "A-Ring", "examples": "US 1/10 oz Gold Eagle, Dime, 1/10 oz Maple"},
    {"min_mm": 16.6, "max_mm": 19.5, "direct_fit": "A19", "ring_model": "A-Ring", "examples": "US Penny, US 1/4 oz Gold Eagle"},
    {"min_mm": 19.6, "max_mm": 21.5, "direct_fit": "T21", "ring_model": "T-Ring", "examples": "US Nickel, US $5 Half Eagle"},
    {"min_mm": 21.6, "max_mm": 24.5, "direct_fit": "T24", "ring_model": "T-Ring", "examples": "US Quarter, British Sovereign"},
    {"min_mm": 24.6, "max_mm": 27.5, "direct_fit": "H27", "ring_model": "H-Ring", "examples": "US 1/2 oz Gold Eagle, US $10 Gold Eagle"},
    {"min_mm": 27.6, "max_mm": 30.6, "direct_fit": "H30", "ring_model": "H-Ring", "examples": "US Half Dollar (30.6mm), 1 oz Gold Maple (30.0mm)"},
    {"min_mm": 30.7, "max_mm": 32.7, "direct_fit": "H32.7", "ring_model": "H-Ring", "examples": "US 1 oz Gold Eagle (32.7mm), Krugerrand (32.77mm)"},
    {"min_mm": 37.0, "max_mm": 38.1, "direct_fit": "H38", "ring_model": "H-Ring", "examples": "US Morgan & Peace Dollar (38.1mm), 1 oz Silver Maple (38.0mm)"},
    {"min_mm": 38.2, "max_mm": 39.0, "direct_fit": "H39", "ring_model": "H-Ring", "examples": "Standard 1 oz Generic Silver Rounds (39.0mm)"},
    {"min_mm": 39.1, "max_mm": 40.6, "direct_fit": "H40.6", "ring_model": "H-Ring", "examples": "American Silver Eagle (40.6mm)"},
]

# ---------------------------------------------------------------------------
# Standard Sovereign Mint Tubes & Monster Boxes
# ---------------------------------------------------------------------------
MINT_TUBE_CAPACITIES: dict[str, dict[str, Any]] = {
    "AMERICAN_SILVER_EAGLE": {"coins_per_tube": 20, "tubes_per_monster_box": 25, "total_box_coins": 500, "tube_color": "Green Top"},
    "CANADIAN_SILVER_MAPLE": {"coins_per_tube": 25, "tubes_per_monster_box": 20, "total_box_coins": 500, "tube_color": "Yellow Top"},
    "BRITISH_SILVER_BRITANNIA": {"coins_per_tube": 25, "tubes_per_monster_box": 20, "total_box_coins": 500, "tube_color": "Grey / Black Top"},
    "AUSTRIAN_SILVER_PHILHARMONIC": {"coins_per_tube": 20, "tubes_per_monster_box": 25, "total_box_coins": 500, "tube_color": "Red Top"},
    "SOUTH_AFRICAN_SILVER_KRUGERRAND": {"coins_per_tube": 25, "tubes_per_monster_box": 20, "total_box_coins": 500, "tube_color": "Red Top"},
    "AMERICAN_GOLD_EAGLE_1OZ": {"coins_per_tube": 20, "tubes_per_monster_box": 25, "total_box_coins": 500, "tube_color": "Brown Top"},
}

US_ROLL_CAPACITIES: dict[str, dict[str, Any]] = {
    "CENT": {"coins_per_roll": 50, "face_value_usd": Decimal("0.50")},
    "NICKEL": {"coins_per_roll": 40, "face_value_usd": Decimal("2.00")},
    "DIME": {"coins_per_roll": 50, "face_value_usd": Decimal("5.00"), "silver_90_net_ozt": Decimal("3.575")},
    "QUARTER": {"coins_per_roll": 40, "face_value_usd": Decimal("10.00"), "silver_90_net_ozt": Decimal("7.150")},
    "HALF_DOLLAR": {"coins_per_roll": 20, "face_value_usd": Decimal("10.00"), "silver_90_net_ozt": Decimal("7.150"), "silver_40_net_ozt": Decimal("2.950")},
    "LARGE_DOLLAR": {"coins_per_roll": 20, "face_value_usd": Decimal("20.00"), "silver_90_net_ozt": Decimal("15.468")},
}

# ---------------------------------------------------------------------------
# Trading Card Point-Thickness Protection Compatibility
# ---------------------------------------------------------------------------
CARD_THICKNESS_PT_TABLE: list[dict[str, Any]] = [
    {"point_size": 35, "thickness_mm": 0.89, "sleeve_type": "Standard Penny Sleeve", "toploader": "35pt Toploader / 35pt One-Touch", "card_types": "Standard TCG (Pokémon, MTG, Yugioh, Lorcana), standard sports base cards"},
    {"point_size": 55, "thickness_mm": 1.40, "sleeve_type": "Thick Card Sleeve", "toploader": "55pt Toploader / 55pt One-Touch", "card_types": "Topps Chrome, Panini Prizm, Optic, thick foil cards"},
    {"point_size": 75, "thickness_mm": 1.90, "sleeve_type": "Thick Card Sleeve", "toploader": "75pt Toploader / 75pt One-Touch", "card_types": "Light jersey swatch cards, vintage thick cardboard"},
    {"point_size": 100, "thickness_mm": 2.54, "sleeve_type": "Thick Card Sleeve", "toploader": "100pt Toploader / 100pt One-Touch", "card_types": "Standard game-used jersey swatch memorabilia cards"},
    {"point_size": 130, "thickness_mm": 3.30, "sleeve_type": "Extra Thick Sleeve", "toploader": "130pt Toploader / 130pt One-Touch", "card_types": "National Treasures, Immaculate RPA patches, shoe swatches"},
    {"point_size": 180, "thickness_mm": 4.57, "sleeve_type": "Super Thick Sleeve", "toploader": "180pt Toploader / 180pt One-Touch", "card_types": "Jumbo patch cards, helmet relics, encased premium autos"},
    {"point_size": 260, "thickness_mm": 6.60, "sleeve_type": "Jumbo Relic Sleeve", "toploader": "260pt One-Touch", "card_types": "Triple relic / bat barrel / oversized patch cards"},
    {"point_size": 360, "thickness_mm": 9.14, "sleeve_type": "Booklet / Ultra Relic", "toploader": "360pt One-Touch / Booklet Holder", "card_types": "Booklet cards, quad patch booklets, sneaker relics"},
]

GRADED_SLAB_DIMENSIONS: dict[str, dict[str, Any]] = {
    "PSA": {"width_mm": 80.0, "height_mm": 136.0, "thickness_mm": 6.0, "description": "Standard PSA Card Slab"},
    "BGS": {"width_mm": 82.5, "height_mm": 131.0, "thickness_mm": 8.0, "description": "Beckett Grading Services Thick Slab"},
    "CGC": {"width_mm": 81.0, "height_mm": 137.0, "thickness_mm": 7.0, "description": "CGC Cards Slab"},
    "SGC": {"width_mm": 84.0, "height_mm": 137.0, "thickness_mm": 7.0, "description": "SGC 'Tuxedo' Black Insert Slab"},
    "TAG": {"width_mm": 80.0, "height_mm": 136.0, "thickness_mm": 6.5, "description": "TAG Clear Acrylic Slab"},
    "PCGS": {"width_mm": 64.0, "height_mm": 85.0, "thickness_mm": 9.5, "description": "PCGS Standard Coin Slab"},
    "NGC": {"width_mm": 63.5, "height_mm": 85.0, "thickness_mm": 9.5, "description": "NGC Standard Coin Slab"},
    "PMG": {"width_mm": 204.0, "height_mm": 118.0, "thickness_mm": 4.0, "description": "PMG Large Banknote Holder"},
}


def recommend_storage_fit(
    category: str = "COIN",
    diameter_mm: float | Decimal | None = None,
    series: str = "",
    thickness_pt: int | None = None,
    grading_service: str = "NONE",
    item_type: str | None = None,
    point_thickness: int | None = None,
    thickness_mm: float | None = None,
) -> dict[str, Any]:
    """Provide deterministic capsule, tube, toploader, and slab fit suggestions."""
    cat = (item_type or category or "COIN").upper()
    srv = (grading_service or "NONE").upper()
    pt = point_thickness if point_thickness is not None else thickness_pt

    # Graded slab dimension lookup
    if srv != "NONE" and srv in GRADED_SLAB_DIMENSIONS:
        return {
            "is_graded_slab": True,
            "slab_dimensions": GRADED_SLAB_DIMENSIONS[srv],
            "storage_recommendation": f"Store in standard {srv} slab storage box or vault safe slot.",
        }

    # Banknote / Paper recommendations
    if cat == "PAPER":
        return {
            "item_type": "PAPER",
            "sleeve_recommendation": "Mylar / PVC-Free Currency Sleeve (Semi-Rigid)",
            "holder_recommendation": "Semi-Rigid Currency Holder (Large or Modern US size)",
            "currency_sleeve": {"size": "Modern / Large US Currency Sleeve"},
        }

    # Trading Card recommendations
    if cat == "CARD":
        pt_val = pt or 35
        matched_pt = None
        for row in CARD_THICKNESS_PT_TABLE:
            if pt_val <= row["point_size"]:
                matched_pt = row
                break
        matched_pt = matched_pt or CARD_THICKNESS_PT_TABLE[-1]
        return {
            "card_point_size": matched_pt["point_size"],
            "sleeve_recommendation": matched_pt["sleeve_type"],
            "holder_recommendation": matched_pt["toploader"],
            "card_types": matched_pt["card_types"],
            "standard_card_dimensions": "2.5 in x 3.5 in (63.5 mm x 88.9 mm)",
            "protection": {
                "toploader_size": f"{matched_pt['point_size']}pt",
                "sleeve_type": matched_pt["sleeve_type"],
                "holder_type": matched_pt["toploader"],
            },
        }

    # Coin / Bullion recommendations
    d_val = float(diameter_mm) if diameter_mm is not None else None
    matched_capsule = None
    if d_val is not None:
        for cap in AIR_TITE_CAPSULE_TABLE:
            if cap["min_mm"] <= d_val <= cap["max_mm"]:
                matched_capsule = cap
                break

    # Mint tube recommendations
    s_upper = (series or "").upper()
    matched_tube = None
    for tube_key, tube_data in MINT_TUBE_CAPACITIES.items():
        if tube_key.replace("_", " ") in s_upper or any(w in s_upper for w in tube_key.split("_")[:2]):
            matched_tube = tube_data
            break

    air_tite = (
        {
            "model": matched_capsule["direct_fit"],
            "ring_model": matched_capsule["ring_model"],
            "examples": matched_capsule["examples"],
        }
        if matched_capsule
        else None
    )

    return {
        "diameter_mm": d_val,
        "capsule_fit": matched_capsule,
        "air_tite_capsule": air_tite,
        "mint_tube_fit": matched_tube,
        "recommended_capsule_code": matched_capsule["direct_fit"] if matched_capsule else "Custom Ring",
    }

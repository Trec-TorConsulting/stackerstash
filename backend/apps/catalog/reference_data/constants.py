from __future__ import annotations

import re
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

# ---------------------------------------------------------------------------
# High-precision Unit Conversion Constants
# ---------------------------------------------------------------------------
TROY_OZ_TO_GRAMS = Decimal("31.1034768")
AVDP_OZ_TO_GRAMS = Decimal("28.349523125")
KG_TO_GRAMS = Decimal("1000")
GRAIN_TO_GRAMS = Decimal("0.06479891")
LB_TO_GRAMS = Decimal("453.59237")

_TO_GRAMS_FACTORS: dict[str, Decimal] = {
    "OZ_T": TROY_OZ_TO_GRAMS,
    "OZT": TROY_OZ_TO_GRAMS,
    "G": Decimal("1"),
    "GRAMS": Decimal("1"),
    "KG": KG_TO_GRAMS,
    "KILOGRAMS": KG_TO_GRAMS,
    "OZ_AVDP": AVDP_OZ_TO_GRAMS,
    "OZ": AVDP_OZ_TO_GRAMS,
    "AVDP": AVDP_OZ_TO_GRAMS,
    "GRAINS": GRAIN_TO_GRAMS,
    "GR": GRAIN_TO_GRAMS,
    "LB": LB_TO_GRAMS,
    "LBS": LB_TO_GRAMS,
}


def convert_weight(
    value: Decimal | float | int | str,
    from_unit: str,
    to_unit: str,
    places: int = 6,
) -> Decimal:
    """Convert any supported mass/weight unit to another with high precision."""
    dec_val = value if isinstance(value, Decimal) else Decimal(str(value))
    f_unit = from_unit.strip().upper()
    t_unit = to_unit.strip().upper()

    if f_unit not in _TO_GRAMS_FACTORS:
        raise ValueError(f"Unsupported from_unit: {from_unit}")
    if t_unit not in _TO_GRAMS_FACTORS:
        raise ValueError(f"Unsupported to_unit: {to_unit}")

    grams = dec_val * _TO_GRAMS_FACTORS[f_unit]
    result = grams / _TO_GRAMS_FACTORS[t_unit]
    return result.quantize(Decimal(10) ** -places, rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# Specific Gravity / Density Standards (g/cm³ at 20°C)
# ---------------------------------------------------------------------------
DENSITY_G_PER_CM3: dict[str, Decimal] = {
    "GOLD_24K": Decimal("19.32"),
    "GOLD_22K": Decimal("17.77"),
    "GOLD_14K": Decimal("13.07"),
    "GOLD_10K": Decimal("11.57"),
    "SILVER_FINE": Decimal("10.49"),
    "SILVER_STERLING": Decimal("10.36"),
    "SILVER_COIN_90": Decimal("10.31"),
    "SILVER_COIN_80": Decimal("10.15"),
    "SILVER_COIN_40": Decimal("9.53"),
    "PLATINUM_FINE": Decimal("21.45"),
    "PALLADIUM_FINE": Decimal("12.02"),
    "COPPER_FINE": Decimal("8.96"),
    "BRASS": Decimal("8.50"),
    "ZINC": Decimal("7.14"),
    "LEAD_COUNTERFEIT": Decimal("11.34"),
    "TUNGSTEN_COUNTERFEIT": Decimal("19.25"),
}


# ---------------------------------------------------------------------------
# Sigma Metalytics Electrical Conductivity & Magnetic Responses
# ---------------------------------------------------------------------------
SIGMA_CONDUCTIVITY_TABLE: dict[str, dict[str, Any]] = {
    "GOLD_24K": {
        "iacs_min_pct": Decimal("70.0"),
        "iacs_max_pct": Decimal("74.0"),
        "ms_per_m_min": Decimal("40.5"),
        "ms_per_m_max": Decimal("43.0"),
        "magnetic_behavior": "DIAMAGNETIC",
        "description": "Pure 24K Gold (.9999 / .999)",
    },
    "GOLD_22K_EAGLE": {
        "iacs_min_pct": Decimal("42.0"),
        "iacs_max_pct": Decimal("46.0"),
        "ms_per_m_min": Decimal("24.4"),
        "ms_per_m_max": Decimal("26.7"),
        "magnetic_behavior": "DIAMAGNETIC",
        "description": "US Gold Eagle 22K (91.67% Au, 3% Ag, 5.33% Cu)",
    },
    "GOLD_22K_KRUGERRAND": {
        "iacs_min_pct": Decimal("16.0"),
        "iacs_max_pct": Decimal("19.0"),
        "ms_per_m_min": Decimal("9.3"),
        "ms_per_m_max": Decimal("11.0"),
        "magnetic_behavior": "DIAMAGNETIC",
        "description": "Krugerrand / Sovereign 22K Crown Gold (91.67% Au, 8.33% Cu)",
    },
    "SILVER_FINE": {
        "iacs_min_pct": Decimal("104.0"),
        "iacs_max_pct": Decimal("108.0"),
        "ms_per_m_min": Decimal("60.3"),
        "ms_per_m_max": Decimal("62.6"),
        "magnetic_behavior": "DIAMAGNETIC",
        "description": "Fine Silver (.999 / .9999)",
    },
    "SILVER_STERLING": {
        "iacs_min_pct": Decimal("88.0"),
        "iacs_max_pct": Decimal("92.0"),
        "ms_per_m_min": Decimal("51.0"),
        "ms_per_m_max": Decimal("53.4"),
        "magnetic_behavior": "DIAMAGNETIC",
        "description": "Sterling Silver (.925)",
    },
    "SILVER_COIN_90": {
        "iacs_min_pct": Decimal("80.0"),
        "iacs_max_pct": Decimal("85.0"),
        "ms_per_m_min": Decimal("46.4"),
        "ms_per_m_max": Decimal("49.3"),
        "magnetic_behavior": "DIAMAGNETIC",
        "description": "US 90% Coin Silver (90% Ag, 10% Cu)",
    },
    "PLATINUM_FINE": {
        "iacs_min_pct": Decimal("15.0"),
        "iacs_max_pct": Decimal("17.0"),
        "ms_per_m_min": Decimal("8.7"),
        "ms_per_m_max": Decimal("9.9"),
        "magnetic_behavior": "PARAMAGNETIC",
        "description": "Pure Platinum (.9995)",
    },
    "PALLADIUM_FINE": {
        "iacs_min_pct": Decimal("15.0"),
        "iacs_max_pct": Decimal("17.0"),
        "ms_per_m_min": Decimal("8.7"),
        "ms_per_m_max": Decimal("9.9"),
        "magnetic_behavior": "PARAMAGNETIC",
        "description": "Pure Palladium (.9995)",
    },
    "COPPER_FINE": {
        "iacs_min_pct": Decimal("98.0"),
        "iacs_max_pct": Decimal("101.5"),
        "ms_per_m_min": Decimal("56.8"),
        "ms_per_m_max": Decimal("58.9"),
        "magnetic_behavior": "DIAMAGNETIC",
        "description": "Pure Copper (.999)",
    },
}


# ---------------------------------------------------------------------------
# Constitutional & World Circulating Silver Face Value Multipliers
# ---------------------------------------------------------------------------
CONSTITUTIONAL_MULTIPLIERS: dict[str, dict[str, Any]] = {
    "US_90_CIRCULATED": {
        "description": "US 90% Silver Dimes, Quarters, Halves (circulated wear avg)",
        "troy_oz_per_dollar_fv": Decimal("0.715000"),
        "purity": Decimal("0.900000"),
        "gross_grams_per_dollar_fv": Decimal("24.70"),
    },
    "US_90_UNCIRCULATED": {
        "description": "US 90% Silver Dimes, Quarters, Halves (mint weight standard)",
        "troy_oz_per_dollar_fv": Decimal("0.723400"),
        "purity": Decimal("0.900000"),
        "gross_grams_per_dollar_fv": Decimal("25.00"),
    },
    "US_40_KENNEDY": {
        "description": "US 40% Silver Kennedy Halves (1965–1970)",
        "troy_oz_per_dollar_fv": Decimal("0.295000"),
        "purity": Decimal("0.400000"),
        "gross_grams_per_dollar_fv": Decimal("23.00"),
    },
    "US_WAR_NICKELS": {
        "description": "US 35% Silver War Nickels (1942–1945)",
        "troy_oz_per_dollar_fv": Decimal("1.125200"),
        "purity": Decimal("0.350000"),
        "per_coin_troy_oz": Decimal("0.056260"),
        "gross_grams_per_dollar_fv": Decimal("100.00"),
    },
    "CANADA_80": {
        "description": "Canadian 80% Silver Coinage (pre-1967)",
        "troy_oz_per_dollar_fv": Decimal("0.600000"),
        "purity": Decimal("0.800000"),
        "gross_grams_per_dollar_fv": Decimal("23.33"),
    },
    "CANADA_50": {
        "description": "Canadian 50% Silver Coinage (1967–1968)",
        "troy_oz_per_dollar_fv": Decimal("0.375000"),
        "purity": Decimal("0.500000"),
        "gross_grams_per_dollar_fv": Decimal("23.33"),
    },
    "UK_STERLING_PRE1920": {
        "description": "British .925 Sterling Pre-1920 Coinage (per £1 FV)",
        "troy_oz_per_dollar_fv": Decimal("3.363600"),
        "purity": Decimal("0.925000"),
    },
    "UK_500_1920_1946": {
        "description": "British .500 Silver 1920–1946 Coinage (per £1 FV)",
        "troy_oz_per_dollar_fv": Decimal("1.818200"),
        "purity": Decimal("0.500000"),
    },
}


# ---------------------------------------------------------------------------
# Transition-Year Metal Rules
# ---------------------------------------------------------------------------
def detect_transition_year_metal(
    country: str,
    denomination: str,
    year: int | str,
    mint_mark: str = "",
) -> dict[str, Any] | None:
    """
    Deterministically resolve composition, purity, and precious metal flags
    for transition-sensitive coinage without invoking AI or external APIs.
    """
    try:
        yr = int(re.sub(r"\D", "", str(year)))
    except (ValueError, TypeError):
        return None

    c_norm = (country or "").strip().lower()
    d_norm = (denomination or "").strip().lower()
    mm_norm = (mint_mark or "").strip().upper()

    # United States
    if any(k in c_norm for k in ("united states", "usa", "us", "america")):
        # Dimes, Quarters
        if any(d in d_norm for d in ("dime", "10c", "quarter", "25c")):
            if yr <= 1964:
                return {
                    "metal_type": "SILVER",
                    "purity": Decimal("0.900000"),
                    "composition": "90% Silver, 10% Copper",
                    "transition_note": "Pre-1965 90% Constitutional Silver",
                    "is_precious_metal": True,
                }
            return {
                "metal_type": "NONE",
                "purity": Decimal("0.000000"),
                "composition": "75% Copper, 25% Nickel over Copper core",
                "transition_note": "Modern Cupronickel Clad",
                "is_precious_metal": False,
            }

        # Half Dollars
        if any(d in d_norm for d in ("half", "50c", "50 cent")):
            if yr <= 1964:
                return {
                    "metal_type": "SILVER",
                    "purity": Decimal("0.900000"),
                    "composition": "90% Silver, 10% Copper",
                    "transition_note": "1964 and earlier 90% Silver Kennedy/Franklin/Walking Liberty",
                    "is_precious_metal": True,
                }
            if 1965 <= yr <= 1970:
                return {
                    "metal_type": "SILVER",
                    "purity": Decimal("0.400000"),
                    "composition": "40% Silver Clad (80% Ag outer layer, 21% Ag core)",
                    "transition_note": "1965-1970 40% Silver Kennedy Half Dollar",
                    "is_precious_metal": True,
                }
            return {
                "metal_type": "NONE",
                "purity": Decimal("0.000000"),
                "composition": "Cupronickel Clad",
                "transition_note": "Post-1970 Clad Kennedy Half Dollar",
                "is_precious_metal": False,
            }

        # War Nickels (1942-1945)
        if any(d in d_norm for d in ("nickel", "5c")):
            is_war_nickel = False
            if 1943 <= yr <= 1945:
                is_war_nickel = True
            elif yr == 1942 and mm_norm in ("P", "S"):
                is_war_nickel = True

            if is_war_nickel:
                return {
                    "metal_type": "SILVER",
                    "purity": Decimal("0.350000"),
                    "composition": "56% Copper, 35% Silver, 9% Manganese",
                    "transition_note": "1942-1945 35% Silver War Nickel (Large mint mark over Monticello)",
                    "is_precious_metal": True,
                }
            return {
                "metal_type": "NONE",
                "purity": Decimal("0.000000"),
                "composition": "75% Copper, 25% Nickel",
                "transition_note": "Standard Cupronickel Jefferson Nickel",
                "is_precious_metal": False,
            }

        # Lincoln Cents (1982 copper vs zinc transition)
        if any(d in d_norm for d in ("cent", "penny", "1c")):
            if yr <= 1981:
                return {
                    "metal_type": "COPPER",
                    "purity": Decimal("0.950000"),
                    "composition": "95% Copper, 5% Zinc (3.11 grams)",
                    "transition_note": "Pre-1982 95% Bronze/Copper Cent",
                    "is_precious_metal": True,
                }
            if yr == 1982:
                return {
                    "metal_type": "COPPER",
                    "purity": Decimal("0.950000"),
                    "composition": "1982 Transition: 95% Copper (3.11g) or Zinc core (2.50g)",
                    "transition_note": "1982 Transition year (scale check required: 3.11g copper vs 2.50g zinc)",
                    "is_precious_metal": True,
                    "requires_scale_verification": True,
                }
            return {
                "metal_type": "NONE",
                "purity": Decimal("0.000000"),
                "composition": "97.5% Zinc, 2.5% Copper plating (2.50 grams)",
                "transition_note": "Post-1982 Copper-Plated Zinc Cent",
                "is_precious_metal": False,
            }

    # Canada
    if "canada" in c_norm:
        if yr <= 1966:
            return {
                "metal_type": "SILVER",
                "purity": Decimal("0.800000"),
                "composition": "80% Silver, 20% Copper",
                "transition_note": "Pre-1967 Canadian 80% Silver",
                "is_precious_metal": True,
            }
        if yr == 1967:
            return {
                "metal_type": "SILVER",
                "purity": Decimal("0.650000"),
                "composition": "1967 Centennial Transition (80% or 50% Silver)",
                "transition_note": "1967 Centennial issue (minted in both 80% and 50% silver)",
                "is_precious_metal": True,
            }
        if yr == 1968:
            return {
                "metal_type": "SILVER",
                "purity": Decimal("0.500000"),
                "composition": "1968 Transition: 50% Silver or 100% Pure Nickel",
                "transition_note": "1968 Transition (magnet check: pure nickel sticks strongly, 50% silver does not)",
                "is_precious_metal": True,
                "requires_magnet_check": True,
            }

    return None


# ---------------------------------------------------------------------------
# IRS Form 1099-B Dealer Reporting Thresholds (Informational Reference Only)
# ---------------------------------------------------------------------------
TAX_REPORTING_THRESHOLDS_1099B: dict[str, dict[str, Any]] = {
    "GOLD_MAPLE_LEAF": {
        "threshold": "25 or more 1 oz coins",
        "minimum_fineness": "0.999",
        "rule": "25 one-ounce coins in a single transaction",
    },
    "GOLD_KRUGERRAND": {
        "threshold": "25 or more 1 oz coins",
        "minimum_fineness": "0.9167",
        "rule": "25 one-ounce coins in a single transaction",
    },
    "GOLD_MEXICAN_ONZA": {
        "threshold": "25 or more 1 oz coins",
        "minimum_fineness": "0.900",
        "rule": "25 one-ounce coins in a single transaction",
    },
    "US_90_SILVER": {
        "threshold": "$1,000 Total Face Value",
        "minimum_fineness": "0.900",
        "rule": "$1,000+ face value in US 90% silver coinage",
    },
    "GOLD_BARS": {
        "threshold": "1 Kilo (32.15 ozt) or more",
        "minimum_fineness": "0.995",
        "rule": "Total gold bar weight of 1 kg or greater",
    },
    "SILVER_BARS": {
        "threshold": "1,000 Troy Ounces or more",
        "minimum_fineness": "0.999",
        "rule": "Total silver bar weight of 1,000 ozt or greater",
    },
    "PLATINUM_BARS": {
        "threshold": "25 Troy Ounces or more",
        "minimum_fineness": "0.9995",
        "rule": "Total platinum bar weight of 25 ozt or greater",
    },
    "PALLADIUM_BARS": {
        "threshold": "100 Troy Ounces or more",
        "minimum_fineness": "0.9995",
        "rule": "Total palladium bar weight of 100 ozt or greater",
    },
    "AMERICAN_EAGLES_GOLD_SILVER": {
        "threshold": "EXEMPT",
        "rule": "US Mint American Gold and Silver Eagles are specifically exempt from dealer 1099-B reporting under IRS rules.",
    },
}

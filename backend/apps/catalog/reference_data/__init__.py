"""Collector Guru Reference Data package: deterministic rules, constants, and utilities."""

from .constants import (
    AVDP_OZ_TO_GRAMS,
    CONSTITUTIONAL_MULTIPLIERS,
    DENSITY_G_PER_CM3,
    GRAIN_TO_GRAMS,
    KG_TO_GRAMS,
    LB_TO_GRAMS,
    SIGMA_CONDUCTIVITY_TABLE,
    TAX_REPORTING_THRESHOLDS_1099B,
    TROY_OZ_TO_GRAMS,
    convert_weight,
    detect_transition_year_metal,
)

__all__ = [
    "TROY_OZ_TO_GRAMS",
    "AVDP_OZ_TO_GRAMS",
    "KG_TO_GRAMS",
    "GRAIN_TO_GRAMS",
    "LB_TO_GRAMS",
    "convert_weight",
    "DENSITY_G_PER_CM3",
    "SIGMA_CONDUCTIVITY_TABLE",
    "CONSTITUTIONAL_MULTIPLIERS",
    "detect_transition_year_metal",
    "TAX_REPORTING_THRESHOLDS_1099B",
]

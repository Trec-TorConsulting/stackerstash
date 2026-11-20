from __future__ import annotations

import re
from typing import Any

# ---------------------------------------------------------------------------
# Roman & Byzantine Imperial Rulers & Reign Dates
# ---------------------------------------------------------------------------
ANCIENT_RULERS: dict[str, dict[str, Any]] = {
    "AUGUSTUS": {"ruler": "Augustus", "dynasty": "Julio-Claudian", "reign": "27 BC – AD 14", "era": "Roman Imperial", "aliases": ("AVGVSTVS", "AUGUSTUS")},
    "TIBERIUS": {"ruler": "Tiberius", "dynasty": "Julio-Claudian", "reign": "AD 14–37", "era": "Roman Imperial", "aliases": ("TIBERIVS", "TIBERIUS")},
    "CALIGULA": {"ruler": "Caligula (Gaius)", "dynasty": "Julio-Claudian", "reign": "AD 37–41", "era": "Roman Imperial", "aliases": ("CALIGVLA", "GAIVS")},
    "CLAUDIUS": {"ruler": "Claudius", "dynasty": "Julio-Claudian", "reign": "AD 41–54", "era": "Roman Imperial", "aliases": ("CLAVDIVS", "CLAUDIUS")},
    "NERO": {"ruler": "Nero", "dynasty": "Julio-Claudian", "reign": "AD 54–68", "era": "Roman Imperial", "aliases": ("NERO", "NERONI")},
    "VESPASIAN": {"ruler": "Vespasian", "dynasty": "Flavian", "reign": "AD 69–79", "era": "Roman Imperial", "aliases": ("VESPASIANVS", "VESPASIAN")},
    "TITUS": {"ruler": "Titus", "dynasty": "Flavian", "reign": "AD 79–81", "era": "Roman Imperial", "aliases": ("TITVS", "TITUS")},
    "DOMITIAN": {"ruler": "Domitian", "dynasty": "Flavian", "reign": "AD 81–96", "era": "Roman Imperial", "aliases": ("DOMITIANVS", "DOMITIAN")},
    "TRAJAN": {"ruler": "Trajan", "dynasty": "Nerva-Antonine", "reign": "AD 98–117", "era": "Roman Imperial", "aliases": ("TRAIANVS", "TRAIAN", "TRAJAN")},
    "HADRIAN": {"ruler": "Hadrian", "dynasty": "Nerva-Antonine", "reign": "AD 117–138", "era": "Roman Imperial", "aliases": ("HADRIANVS", "HADRIAN")},
    "ANTONINUS_PIUS": {"ruler": "Antoninus Pius", "dynasty": "Nerva-Antonine", "reign": "AD 138–161", "era": "Roman Imperial", "aliases": ("ANTONINVS", "ANTONINUS PIUS")},
    "MARCUS_AURELIUS": {"ruler": "Marcus Aurelius", "dynasty": "Nerva-Antonine", "reign": "AD 161–180", "era": "Roman Imperial", "aliases": ("AVRELIVS", "MARCUS AURELIUS")},
    "COMMODUS": {"ruler": "Commodus", "dynasty": "Nerva-Antonine", "reign": "AD 177–192", "era": "Roman Imperial", "aliases": ("COMMODVS", "COMMODUS")},
    "SEPTIMIUS_SEVERUS": {"ruler": "Septimius Severus", "dynasty": "Severan", "reign": "AD 193–211", "era": "Roman Imperial", "aliases": ("SEVERVS", "SEPTIMIUS SEVERUS")},
    "CARACALLA": {"ruler": "Caracalla", "dynasty": "Severan", "reign": "AD 198–217", "era": "Roman Imperial", "aliases": ("CARACALLA", "ANTONINVS")},
    "CONSTANTINE_I": {"ruler": "Constantine I (The Great)", "dynasty": "Constantinian", "reign": "AD 306–337", "era": "Late Roman", "aliases": ("CONSTANTINVS", "CONSTANTINE")},
    "JUSTINIAN_I": {"ruler": "Justinian I", "dynasty": "Justinian", "reign": "AD 527–565", "era": "Byzantine", "aliases": ("IVSTINIANVS", "JUSTINIAN")},
}

# ---------------------------------------------------------------------------
# Latin Obverse Legend Abbreviations
# ---------------------------------------------------------------------------
LEGEND_ABBREVIATIONS: dict[str, dict[str, str]] = {
    "IMP": {"latin": "Imperator", "english": "Supreme Commander / Emperor"},
    "CAES": {"latin": "Caesar", "english": "Title of the Emperor / Heir apparent"},
    "AVG": {"latin": "Augustus", "english": "Venerable / Imperial Title"},
    "P M": {"latin": "Pontifex Maximus", "english": "High Priest of Rome"},
    "TR P": {"latin": "Tribunicia Potestate", "english": "Holder of Tribunician Power (year dated)"},
    "COS": {"latin": "Consul", "english": "Consul of the Roman Republic/Empire"},
    "P P": {"latin": "Pater Patriae", "english": "Father of the Country"},
    "S C": {"latin": "Senatus Consulto", "english": "By Decree of the Senate (standard on bronze coins)"},
    "D N": {"latin": "Dominus Noster", "english": "Our Lord (standard on Late Roman & Byzantine coins)"},
    "DIVVS": {"latin": "Divus", "english": "Deified (Consecration issue struck after death)"},
    "FIL": {"latin": "Filius / Filia", "english": "Son / Daughter of"},
}

# ---------------------------------------------------------------------------
# Standard Ancient Denominations & Catalog Reference Prefixes
# ---------------------------------------------------------------------------
ANCIENT_DENOMINATIONS: dict[str, dict[str, Any]] = {
    "DENARIUS": {"metal": "SILVER", "era": "Roman Republic & Early Empire", "standard_weight_grams": "3.85", "purity": "0.950000", "purity_debased": "0.500000"},
    "ANTONINIANUS": {"metal": "SILVER", "era": "Roman Empire (Double Denarius with radiate crown)", "standard_weight_grams": "5.10", "purity": "0.500000"},
    "AUREUS": {"metal": "GOLD", "era": "Roman Republic & Imperial", "standard_weight_grams": "7.30", "purity": "0.990000"},
    "SOLIDUS": {"metal": "GOLD", "era": "Late Roman & Byzantine Empire (Diocletian/Constantine standard)", "standard_weight_grams": "4.50", "purity": "0.990000"},
    "SESTERTIUS": {"metal": "BRONZE", "era": "Roman Imperial large bronze coin", "standard_weight_grams": "25.00"},
    "TETRADRACHM_ATTIC": {"metal": "SILVER", "era": "Classical Greek / Alexander the Great standard", "standard_weight_grams": "17.20", "purity": "0.980000"},
    "STATER": {"metal": "GOLD", "era": "Greek & Celtic gold coin standard", "standard_weight_grams": "8.60", "purity": "0.950000"},
    "PRUTAH": {"metal": "BRONZE", "era": "Judaean / Biblical bronze lepton/prutah", "standard_weight_grams": "2.00"},
    "SHEKEL_TYRIAN": {"metal": "SILVER", "era": "Phoenician / Tyrian Shekel (Biblical 30 pieces of silver)", "standard_weight_grams": "14.20", "purity": "0.940000"},
}

CATALOG_PREFIXES: dict[str, str] = {
    "RIC": "Roman Imperial Coinage (Vols I–X)",
    "CRAWFORD": "Roman Republican Coinage by Michael Crawford",
    "SEAR": "Roman Coins and Their Values by David R. Sear",
    "RPC": "Roman Provincial Coinage",
    "SNG": "Sylloge Nummorum Graecorum",
    "DOC": "Dumbarton Oaks Collection (Byzantine)",
}


def decode_ancient_legend(text: str) -> dict[str, Any]:
    """Extract and decode known Latin/Greek legend abbreviations and matching rulers."""
    upper = (text or "").upper()
    found_abbrevs: list[dict[str, str]] = []
    for abbr, data in LEGEND_ABBREVIATIONS.items():
        if re.search(rf"\b{re.escape(abbr)}\b", upper):
            found_abbrevs.append({"abbreviation": abbr, **data})

    matched_ruler = None
    for ruler_key, ruler_data in ANCIENT_RULERS.items():
        aliases = ruler_data.get("aliases", (ruler_key, ruler_data["ruler"].upper()))
        if any(re.search(rf"\b{re.escape(alias)}\b", upper) for alias in aliases):
            matched_ruler = ruler_data
            break

    return {
        "matched_ruler": matched_ruler,
        "abbreviations": found_abbrevs,
        "legend_summary": ", ".join(f"{a['abbreviation']} ({a['english']})" for a in found_abbrevs),
    }

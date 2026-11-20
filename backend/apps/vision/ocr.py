from __future__ import annotations

import io
import logging
import re
from typing import Any

from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

_OCR_ENGINE: Any = None
_OCR_INIT_FAILED = False


def _get_ocr_engine() -> Any:
    """Lazy-load and cache RapidOCR engine so startup is unaffected when vision APIs succeed."""
    global _OCR_ENGINE, _OCR_INIT_FAILED
    if _OCR_ENGINE is not None:
        return _OCR_ENGINE
    if _OCR_INIT_FAILED:
        return None
    try:
        from rapidocr_onnxruntime import RapidOCR

        _OCR_ENGINE = RapidOCR(intra_op_num_threads=1, inter_op_num_threads=1)
        return _OCR_ENGINE
    except Exception as exc:
        _OCR_INIT_FAILED = True
        logger.warning("Failed to initialize RapidOCR engine: %s", exc)
        return None


def _preprocess_image_for_ocr(img_bytes: bytes, max_dimension: int = 800) -> bytes | None:
    """Normalize EXIF orientation, enhance contrast, and resize for local OCR."""
    try:
        with Image.open(io.BytesIO(img_bytes)) as opened:
            img = ImageOps.exif_transpose(opened)
            if max(img.size) > max_dimension:
                img.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
            gray = ImageOps.grayscale(img)
            enhanced = ImageOps.autocontrast(gray, cutoff=1).convert("RGB")
            out = io.BytesIO()
            enhanced.save(out, format="JPEG", quality=85)
            return out.getvalue()
    except Exception:
        return None


def extract_text_from_images(images: list[tuple[bytes, str]]) -> str:
    """Run local in-process OCR across uploaded images and return extracted text lines."""
    engine = _get_ocr_engine()
    if engine is None:
        return ""

    lines: list[str] = []
    seen: set[str] = set()
    for img_bytes, _ in images:
        preprocessed = _preprocess_image_for_ocr(img_bytes)
        if not preprocessed:
            continue
        try:
            result, _ = engine(preprocessed)
        except Exception as exc:
            logger.debug("RapidOCR failed on image: %s", exc)
            continue
        if not result:
            continue
        for entry in result:
            if not isinstance(entry, (list, tuple)) or len(entry) < 2:
                continue
            text = str(entry[1]).strip()
            conf = float(entry[2]) if len(entry) > 2 and entry[2] is not None else 1.0
            if text and conf >= 0.4 and text not in seen:
                seen.add(text)
                lines.append(text)
    return "\n".join(lines)


def extract_barcode_hint(images: list[tuple[bytes, str]]) -> str:
    """
    Decode QR codes from uploaded images (e.g. PCGS/NGC/PMG slab QR codes)
    and extract any embedded certification number. Returns empty string if none found.
    """
    try:
        import cv2
        import numpy as np
    except Exception:
        return ""

    detector = cv2.QRCodeDetector()
    for img_bytes, _ in images:
        try:
            with Image.open(io.BytesIO(img_bytes)) as opened:
                img = ImageOps.exif_transpose(opened).convert("RGB")
                if max(img.size) > 1200:
                    img.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
                arr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
            data, _, _ = detector.detectAndDecode(arr)
            if not data:
                continue
            m = re.search(r"(\d{7,10}(?:-\d{3})?)", data)
            if m:
                return m.group(1)
            return data.strip()[:64]
        except Exception as exc:
            logger.debug("QR barcode rotation variant decode failed: %s", exc)
            continue
    return ""


_WORD_DENOM_MAP: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bONE\s+HUNDRED\s+DOLLARS?\b", re.I), "$100"),
    (re.compile(r"\bFIFTY\s+DOLLARS?\b", re.I), "$50"),
    (re.compile(r"\bTWENTY\s+DOLLARS?\b", re.I), "$20"),
    (re.compile(r"\bTEN\s+DOLLARS?\b", re.I), "$10"),
    (re.compile(r"\bFIVE\s+DOLLARS?\b", re.I), "$5"),
    (re.compile(r"\bTWO\s+DOLLARS?\b", re.I), "$2"),
    (re.compile(r"\bONE\s+DOLLAR\b", re.I), "$1"),
    (re.compile(r"\bHALF\s+DOLLAR\b", re.I), "50 Cents"),
    (re.compile(r"\bQUARTER\s+DOLLAR\b", re.I), "25 Cents"),
    (re.compile(r"\bONE\s+DIME\b", re.I), "10 Cents"),
    (re.compile(r"\bFIVE\s+CENTS\b", re.I), "5 Cents"),
    (re.compile(r"\bONE\s+CENT\b", re.I), "1 Cent"),
]


def parse_ocr_numismatic_hints(
    ocr_text: str, barcode_hint: str | None = None
) -> dict[str, Any]:
    """Parse structured numismatic, paper-currency, slab, and bullion hints from OCR text."""
    text = (ocr_text or "").strip()
    upper = text.upper()

    # 1. Grading service
    grading_service = "NONE"
    if "PCGS" in upper and "BANKNOTE" in upper:
        grading_service = "PCGS_BANKNOTE"
    elif "PCGS" in upper:
        grading_service = "PCGS"
    elif "PMG" in upper:
        grading_service = "PMG"
    elif "NGC" in upper:
        grading_service = "NGC"
    elif "CACG" in upper:
        grading_service = "CACG"
    elif "ANACS" in upper:
        grading_service = "ANACS"
    elif "ICG" in upper:
        grading_service = "ICG"
    elif re.search(r"\bPSA\b", upper):
        grading_service = "PSA"
    elif re.search(r"\b(?:BGS|BECKETT)\b", upper):
        grading_service = "BGS"
    elif re.search(r"\bCGC\b", upper):
        grading_service = "CGC"
    elif re.search(r"\bSGC\b", upper):
        grading_service = "SGC"
    elif re.search(r"\bTAG\b", upper):
        grading_service = "TAG"

    # 2. Grade
    grade = ""
    if grading_service in {"PSA", "BGS", "CGC", "SGC", "TAG"}:
        card_grade_match = re.search(
            r"\b(?:GEM\s*MT|GEM\s*MINT|PRISTINE|MINT|NM-MT|NM|EX-MT|EX|VG-EX|VG|GOOD|PR)\s*(10|9\.5|9|8\.5|8|7\.5|7|6\.5|6|5|4|3|2|1)\b",
            upper,
        )
        if card_grade_match:
            grade = card_grade_match.group(1)
        else:
            svc_grade_match = re.search(
                rf"\b{grading_service}\s*[-]?\s*(10|9\.5|9|8\.5|8|7\.5|7|6|5|4|3|2|1)\b",
                upper,
            )
            if svc_grade_match:
                grade = svc_grade_match.group(1)
    elif grading_service != "NONE":
        grade_match = re.search(
            r"\b((?:MS|PR|PF|AU|XF|EF|VF|VG|F|G|AG|FR|PO)\s*-?\s*\d{1,2}(?:\s*(?:UC|UCAM|DCAM|CAM|PL|DMPL|EPQ|PPQ|\+|★))?)\b",
            upper,
        )
        if grade_match:
            grade = re.sub(r"\s+", " ", grade_match.group(1)).strip()
        else:
            note_grade = re.search(r"\b([1-7]\d\s*(?:EPQ|PPQ))\b", upper)
            if note_grade:
                grade = re.sub(r"\s+", " ", note_grade.group(1)).strip()

    # 3. Cert number
    cert_number = (barcode_hint or "").strip()
    if not cert_number and grading_service != "NONE":
        pcgs_slash = re.search(r"\b\d{4,7}\.\d{1,2}/(\d{7,10})\b", upper)
        ngc_dash = re.search(r"\b(\d{7,10}-\d{3})\b", upper)
        cert_match = re.search(r"(?:CERT(?:\s*#|\s*NO\.?)?|#)\s*:?\s*(\d{7,10})\b", upper)
        if pcgs_slash:
            cert_number = pcgs_slash.group(1)
        elif ngc_dash:
            cert_number = ngc_dash.group(1)
        elif cert_match:
            cert_number = cert_match.group(1)
        else:
            # Look for standalone 7-10 digit slab registry number
            digits_match = re.search(r"\b(\d{7,10})\b", upper)
            if digits_match:
                cert_number = digits_match.group(1)

    # 4. Banknote serial number & paper indicators
    serial_number = ""
    serial_match = re.search(r"\b([A-Z]{1,2}\s?\d{8}\s?[A-Z\*])\b", upper)
    if serial_match:
        candidate_sn = re.sub(r"\s+", "", serial_match.group(1))
        if not candidate_sn.startswith(("MS", "PR", "PF", "AU", "VF", "XF")):
            serial_number = candidate_sn
    if not serial_number:
        alt_serial = re.search(r"\b([A-Z]{1,2}\d{7,9}[A-Z\*]?)\b", upper)
        if alt_serial and not alt_serial.group(1).startswith(("MS", "PR", "PF", "AU", "VF", "XF")):
            serial_number = alt_serial.group(1)

    is_paper = any(
        kw in upper
        for kw in (
            "FEDERAL RESERVE",
            "SILVER CERTIFICATE",
            "UNITED STATES NOTE",
            "TREASURY",
            "SERIES",
            "LEGAL TENDER",
            "BANKNOTE",
            "PMG",
            "PCGS BANKNOTE",
            "GOLDBACK",
            "NEGOTIABLE INSTRUMENT",
        )
    ) or bool(serial_number)

    # 5. Year / Series
    year = ""
    series_match = re.search(r"\bSERIES\s+(1[7-9]\d{2}|20[0-2]\d)\s*([A-Z])?\b", upper)
    if series_match:
        year = f"{series_match.group(1)}{series_match.group(2) or ''}"
    else:
        year_matches = re.findall(r"\b(1[7-9]\d{2}|20[0-2]\d)\b", upper)
        if year_matches:
            year = year_matches[0]

    # 6. Denomination
    denomination = ""
    dollar_match = re.search(r"\$\s?(100|50|20|10|5|2|1)\b", upper)
    if dollar_match:
        denomination = f"${dollar_match.group(1)}"
    else:
        for pat, label in _WORD_DENOM_MAP:
            if pat.search(text):
                denomination = label
                break

    # 7. Metal, purity, weight
    metal_type = "NONE"
    if "PLATINUM" in upper:
        metal_type = "PLATINUM"
    elif "PALLADIUM" in upper:
        metal_type = "PALLADIUM"
    elif "GOLD" in upper and "CERTIFICATE" not in upper:
        metal_type = "GOLD"
    elif "SILVER" in upper and "CERTIFICATE" not in upper:
        metal_type = "SILVER"
    elif "COPPER" in upper:
        metal_type = "COPPER"

    purity = 0.999
    purity_match = re.search(r"(?:^|\s|\.)(9999|999|995|925|900)\b", upper)
    if purity_match:
        raw_p = purity_match.group(1)
        purity = float(f"0.{raw_p}")

    weight_value = 0.0
    weight_unit = "OZ_T"
    wt_match = re.search(r"\b(\d+(?:\.\d+)?)\s*(TROY\s*OZ|OZ\s*T|OZ|OUNCE|G|GRAMS?|KG|KILO)\b", upper)
    if wt_match:
        weight_value = float(wt_match.group(1))
        unit_tok = wt_match.group(2)
        if unit_tok.startswith("K"):
            weight_unit = "KG"
        elif unit_tok.startswith("G"):
            weight_unit = "G"
        else:
            weight_unit = "OZ_T"

    # 8. Country & series hints
    country = ""
    if any(kw in upper for kw in ("UNITED STATES", "E PLURIBUS UNUM", "FEDERAL RESERVE", "LIBERTY", "IN GOD WE TRUST")):
        country = "United States"
    elif "CANADA" in upper or "MAPLE LEAF" in upper:
        country = "Canada"

    series = ""
    for kw, label in (
        ("MORGAN", "Morgan Dollar"),
        ("PEACE", "Peace Dollar"),
        ("SILVER CERTIFICATE", "Silver Certificate"),
        ("FEDERAL RESERVE", "Federal Reserve Note"),
        ("AMERICAN EAGLE", "American Eagle"),
        ("GEIGER", "Geiger Edelmetalle"),
        ("KRUGERRAND", "Krugerrand"),
        ("BRITANNIA", "Britannia"),
        ("MAPLE LEAF", "Maple Leaf"),
    ):
        if kw in upper:
            series = label
            break

    # 8b. Trading card hints
    card_game = ""
    for kw, canonical_game in (
        ("POKÉMON", "Pokémon"),
        ("POKEMON", "Pokémon"),
        ("MAGIC: THE GATHERING", "Magic: The Gathering"),
        ("MAGIC THE GATHERING", "Magic: The Gathering"),
        ("YU-GI-OH", "Yu-Gi-Oh!"),
        ("YUGIOH", "Yu-Gi-Oh!"),
        ("LORCANA", "Disney Lorcana"),
        ("ONE PIECE", "One Piece"),
        ("TOPPS", "Sports — Baseball"),
        ("PANINI", "Sports — Basketball"),
        ("BOWMAN", "Sports — Baseball"),
        ("UPPER DECK", "Sports — Hockey"),
        ("DONRUSS", "Sports — Football"),
        ("FLEER", "Sports — Basketball"),
        ("SCORE", "Sports — Football"),
        ("LEAF", "Sports"),
    ):
        if kw in upper:
            if kw == "LEAF" and "MAPLE LEAF" in upper:
                continue
            card_game = canonical_game
            break

    card_stat_match = bool(
        re.search(
            r"\b(?:\d{2,3}\s*HP|STAGE\s*[12]|BASIC\s*POK[EÉ]MON|TRAINER|ENERGY|1ST\s*EDITION|ROOKIE\s*CARD|\bRC\b|\bATK\b|\bDEF\b)\b",
            upper,
        )
        or any(
            m in upper
            for m in (
                "NINTENDO",
                "CREATURES",
                "GAMEFREAK",
                "WIZARDS OF THE COAST",
                "WIZARDS",
                "KONAMI",
                "BANDAI",
            )
        )
    )
    if not card_game and card_stat_match:
        if any(pk in upper for pk in ("HP", "POKEMON", "POKÉMON", "NINTENDO", "GAMEFREAK")):
            card_game = "Pokémon"
        elif any(mtg in upper for mtg in ("WIZARDS", "MAGIC")):
            card_game = "Magic: The Gathering"
        elif "KONAMI" in upper:
            card_game = "Yu-Gi-Oh!"
        elif any(sp in upper for sp in ("ROOKIE", "RC", "PANINI", "TOPPS", "BOWMAN", "UPPER DECK", "DONRUSS", "FLEER")):
            card_game = "Sports"
        else:
            card_game = "Trading Card"

    card_number = ""
    card_num_match = re.search(r"\b(\d{1,3}/\d{1,3})\b", upper)
    if card_num_match and (card_game or card_stat_match or grading_service in {"PSA", "BGS", "CGC", "SGC", "TAG"}):
        card_number = card_num_match.group(1)
    is_card = bool(card_game) or card_stat_match or grading_service in {"PSA", "BGS", "CGC", "SGC", "TAG"}

    # 9. Category
    if grading_service != "NONE":
        category = "SLAB"
    elif is_card:
        category = "CARD"
    elif is_paper:
        category = "PAPER"
    elif any(kw in upper for kw in ("BAR", "INGOT", "GEIGER", "FINE SILVER", "FINE GOLD")) and weight_value > 0:
        category = "BAR"
    elif "ROUND" in upper:
        category = "ROUND"
    else:
        category = "COIN"

    # 10. Construct title
    title_parts: list[str] = []
    if year:
        title_parts.append(year)
    if country == "United States" and is_paper:
        title_parts.append("US")
    if denomination:
        title_parts.append(denomination)
    if series:
        title_parts.append(series)
    elif weight_value > 0 and metal_type != "NONE":
        title_parts.append(f"{weight_value:g} {weight_unit.lower().replace('_t', ' oz')} {metal_type.title()}")
    elif metal_type != "NONE":
        title_parts.append(metal_type.title())
    if grading_service != "NONE":
        svc_label = grading_service.replace("_", " ")
        title_parts.append(f"({svc_label} {grade})".strip())

    title = " ".join(p for p in title_parts if p).strip()
    has_usable_hints = bool(
        title or cert_number or serial_number or year or denomination or grading_service != "NONE" or metal_type != "NONE" or is_card
    )

    return {
        "category": category,
        "title": title,
        "country": country,
        "year": year,
        "mint_or_refiner": "Geiger Edelmetalle" if "GEIGER" in upper else "",
        "denomination": denomination,
        "series": series,
        "metal_type": "NONE" if is_card else metal_type,
        "weight_value": 0 if is_card else weight_value,
        "weight_unit": weight_unit,
        "purity": purity,
        "grading_service": grading_service,
        "cert_number": cert_number,
        "grade": grade,
        "slab_designation": "",
        "estimated_grade": "",
        "serial_number": serial_number,
        "card_game": card_game,
        "card_number": card_number,
        "estimated_value_usd": 0,
        "ai_confidence": 0.45 if has_usable_hints else 0.0,
        "notes": f"Extracted via local OCR: {text[:240]}" if text else "",
        "has_usable_hints": has_usable_hints,
    }


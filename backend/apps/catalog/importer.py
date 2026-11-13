from __future__ import annotations

import csv
import io
import logging
import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx
from django.core.files.base import ContentFile
from PIL import Image

from apps.accounts.models import Workspace
from apps.valuation.services import refresh_item_melt_from_latest_spot

from .models import CollectionItem, ItemPhoto

logger = logging.getLogger(__name__)

MAX_PHOTO_BYTES = 5 * 1024 * 1024
PHOTO_FETCH_TIMEOUT = 4.0

TARGET_FIELDS: list[str] = [
    "title",
    "category",
    "status",
    "country",
    "year",
    "denomination",
    "mint_or_refiner",
    "series",
    "quantity",
    "metal_type",
    "weight_value",
    "weight_unit",
    "purity",
    "grading_service",
    "cert_number",
    "grade",
    "serial_number",
    "purchase_price",
    "market_value_unit",
    "notes",
    "obverse_image_url",
    "reverse_image_url",
    "image_url",
]

FIELD_ALIASES: dict[str, list[str]] = {
    "title": ["title", "coin name", "name", "item", "item name", "description", "coin"],
    "category": ["category", "type", "item type"],
    "status": ["status", "collection status"],
    "country": ["country", "issuer", "country/issuer", "nation", "origin"],
    "year": ["year", "date", "mint year", "issue year"],
    "denomination": ["denomination", "face value", "denom"],
    "mint_or_refiner": ["mint_or_refiner", "mint", "mint mark", "mintmark", "refiner", "manufacturer"],
    "series": ["series", "variety", "type/series", "reference", "km#", "n#"],
    "quantity": ["quantity", "qty", "count", "amount"],
    "metal_type": ["metal_type", "metal", "composition", "material", "alloy"],
    "weight_value": ["weight_value", "weight", "mass"],
    "weight_unit": ["weight_unit", "unit", "weight unit"],
    "purity": ["purity", "fineness", "millesimal fineness"],
    "grading_service": ["grading_service", "grader", "grading company", "slab", "service", "tpg"],
    "cert_number": ["cert_number", "cert #", "cert number", "cert", "certification", "certification #", "pcgs #", "ngc #", "slab #"],
    "grade": ["grade", "condition", "assigned grade"],
    "serial_number": ["serial_number", "serial #", "serial number", "serial"],
    "purchase_price": ["purchase_price", "paid", "price paid", "cost", "purchase cost", "cost basis"],
    "market_value_unit": [
        "market_value_unit",
        "market_value",
        "estimated value",
        "est. value",
        "value",
        "price",
        "price guide",
        "fair market value",
        "fmv",
        "current value",
    ],
    "notes": ["notes", "comments", "comment", "memo", "remarks"],
    "obverse_image_url": ["obverse_image_url", "obverse image", "obverse url", "front image", "front url", "obverse"],
    "reverse_image_url": ["reverse_image_url", "reverse image", "reverse url", "back image", "back url", "reverse"],
    "image_url": ["image_url", "image", "image url", "photo", "photo url"],
}

_CURRENCY_CLEAN_RE = re.compile(r"[^\d.\-]")


@dataclass
class PreviewResult:
    detected_preset: str
    headers: list[str]
    suggested_mapping: dict[str, str]
    total_rows: int
    sample_rows: list[dict[str, str]]
    normalized_preview: list[dict[str, Any]]


@dataclass
class MappedImportResult:
    created_count: int
    errors: list[dict[str, Any]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _normalize_header(header: str) -> str:
    return re.sub(r"\s+", " ", header.strip().lower())


def detect_preset_and_mapping(headers: list[str]) -> tuple[str, dict[str, str]]:
    """Detect source platform preset and build header -> StackVault field mapping."""
    norm_to_orig: dict[str, str] = {}
    for h in headers:
        norm = _normalize_header(h)
        if norm and norm not in norm_to_orig:
            norm_to_orig[norm] = h

    norm_set = set(norm_to_orig.keys())

    # Detect platform preset
    if "title" in norm_set and (
        "metal_type" in norm_set or "market_value_unit" in norm_set or "weight_unit" in norm_set
    ):
        preset = "stackvault"
    elif ({"denomination", "composition"} & norm_set) and (
        {"estimated value", "value", "obverse image", "obverse url", "reverse image", "reverse url"} & norm_set
    ):
        preset = "coinsnap"
    elif {"n#", "numista", "km#"} & norm_set or ("issuer" in norm_set and ("reference" in norm_set or "name" in norm_set)):
        preset = "numista"
    elif ({"cert #", "cert number", "certification", "pcgs #", "ngc #"} & norm_set) and (
        {"grade", "denomination", "coin"} & norm_set
    ):
        preset = "pcgs_ngc"
    else:
        preset = "custom"

    mapping: dict[str, str] = {}
    used_headers: set[str] = set()

    # Exact alias pass first, then substring pass
    for target in TARGET_FIELDS:
        aliases = FIELD_ALIASES.get(target, [])
        matched_header: str | None = None
        for alias in aliases:
            if alias in norm_to_orig and norm_to_orig[alias] not in used_headers:
                matched_header = norm_to_orig[alias]
                break
        if matched_header:
            mapping[matched_header] = target
            used_headers.add(matched_header)

    return preset, mapping


def parse_decimal_currency(raw: str | None, default: Decimal | None = None) -> Decimal | None:
    """Parse currency strings like '$1,250.50' into Decimal, returning default if blank."""
    if raw is None:
        return default
    text = raw.strip()
    if not text or text.lower() in {"-", "n/a", "na", "none", "null"}:
        return default
    cleaned = _CURRENCY_CLEAN_RE.sub("", text)
    if not cleaned or cleaned in {"-", "."}:
        return default
    return Decimal(cleaned)


def normalize_metal_type(raw: str | None) -> str:
    """Normalize composition/metal strings to CollectionItem.MetalType."""
    if not raw:
        return CollectionItem.MetalType.NONE
    val = raw.strip().lower()
    if not val:
        return CollectionItem.MetalType.NONE
    # Clad / copper-nickel / bronze alloys are non-bullion collectibles
    if any(tok in val for tok in ("copper-nickel", "cupronickel", "clad", "nickel", "brass", "bronze", "zinc", "steel")):
        return CollectionItem.MetalType.NONE
    if "gold" in val or val == "au":
        return CollectionItem.MetalType.GOLD
    if "silver" in val or val == "ag" or "sterling" in val:
        return CollectionItem.MetalType.SILVER
    if "platinum" in val or val == "pt":
        return CollectionItem.MetalType.PLATINUM
    if "palladium" in val or val == "pd":
        return CollectionItem.MetalType.PALLADIUM
    if "copper" in val or val == "cu":
        return CollectionItem.MetalType.COPPER
    return CollectionItem.MetalType.NONE


def normalize_weight_unit(raw: str | None) -> str:
    if not raw:
        return CollectionItem.WeightUnit.OZ_T
    val = raw.strip().lower()
    if val in {"g", "gram", "grams", "gr"}:
        return CollectionItem.WeightUnit.G
    if val in {"kg", "kilogram", "kilograms", "kilo"}:
        return CollectionItem.WeightUnit.KG
    if val in {"oz_avdp", "avdp", "avdp oz", "avoirdupois"}:
        return CollectionItem.WeightUnit.OZ_AVDP
    return CollectionItem.WeightUnit.OZ_T


def normalize_category(raw: str | None) -> str:
    if not raw:
        return CollectionItem.Category.COIN
    val = raw.strip().upper()
    valid = {c[0] for c in CollectionItem.Category.choices}
    if val in valid:
        return val
    low = val.lower()
    if any(k in low for k in ("paper", "note", "banknote", "bill", "currency")):
        return CollectionItem.Category.PAPER
    if any(k in low for k in ("bar", "ingot")):
        return CollectionItem.Category.BAR
    if "round" in low:
        return CollectionItem.Category.ROUND
    if "slab" in low:
        return CollectionItem.Category.SLAB
    if "flip" in low:
        return CollectionItem.Category.FLIPPER
    if "coin" in low:
        return CollectionItem.Category.COIN
    return CollectionItem.Category.OTHER


def normalize_grading_service(raw: str | None) -> str:
    if not raw:
        return CollectionItem.GradingService.NONE
    val = raw.strip().upper().replace(" ", "_")
    valid = {c[0] for c in CollectionItem.GradingService.choices}
    if val in valid:
        return val
    low = raw.strip().lower()
    if "pcgs" in low and "banknote" in low:
        return CollectionItem.GradingService.PCGS_BANKNOTE
    if "pcgs" in low:
        return CollectionItem.GradingService.PCGS
    if "ngc" in low:
        return CollectionItem.GradingService.NGC
    if "pmg" in low:
        return CollectionItem.GradingService.PMG
    if "cac" in low:
        return CollectionItem.GradingService.CACG
    if "anacs" in low:
        return CollectionItem.GradingService.ANACS
    if "icg" in low:
        return CollectionItem.GradingService.ICG
    if low in {"none", "raw", "ungraded", ""}:
        return CollectionItem.GradingService.NONE
    return CollectionItem.GradingService.OTHER


def normalize_status(raw: str | None) -> str:
    if not raw:
        return CollectionItem.Status.IN_COLLECTION
    val = raw.strip().upper().replace(" ", "_")
    valid = {c[0] for c in CollectionItem.Status.choices}
    if val in valid:
        return val
    low = raw.strip().lower()
    if "sale" in low:
        return CollectionItem.Status.FOR_SALE
    if "sold" in low:
        return CollectionItem.Status.SOLD
    if "wish" in low or "want" in low:
        return CollectionItem.Status.WISHLIST
    return CollectionItem.Status.IN_COLLECTION


def synthesize_title(fields: dict[str, str]) -> str:
    """Build a readable title when no explicit title column is present."""
    parts: list[str] = []
    for key in ("year", "country", "denomination", "series", "grade"):
        val = (fields.get(key) or "").strip()
        if val and val not in parts:
            parts.append(val)
    if parts:
        return " ".join(parts)[:200]
    for fallback_key in ("cert_number", "mint_or_refiner"):
        val = (fields.get(fallback_key) or "").strip()
        if val:
            return val[:200]
    return "Imported Item"


def _extract_mapped_row(row: dict[str, str], mapping: dict[str, str]) -> dict[str, str]:
    extracted: dict[str, str] = {}
    for csv_col, target_field in mapping.items():
        if not target_field or target_field not in TARGET_FIELDS:
            continue
        raw_val = (row.get(csv_col) or "").strip()
        if raw_val and target_field not in extracted:
            extracted[target_field] = raw_val
    return extracted


def _normalize_item_kwargs(
    extracted: dict[str, str], preset: str = "custom"
) -> dict[str, Any]:
    title = (extracted.get("title") or "").strip()
    if not title:
        title = synthesize_title(extracted)
    else:
        title = title[:200]

    qty_raw = extracted.get("quantity")
    try:
        qty = max(1, int(float(qty_raw))) if qty_raw else 1
    except (ValueError, TypeError):
        qty = 1

    weight_val = parse_decimal_currency(extracted.get("weight_value"), Decimal("0")) or Decimal("0")
    purity_val = parse_decimal_currency(extracted.get("purity"), Decimal("0.999")) or Decimal("0.999")
    if purity_val > Decimal("1"):
        # Handle millesimal fineness like 999 or 900
        purity_val = (purity_val / Decimal("1000")).quantize(Decimal("0.000001"))

    market_val = parse_decimal_currency(extracted.get("market_value_unit"), Decimal("0.00")) or Decimal("0.00")
    purchase_val = parse_decimal_currency(extracted.get("purchase_price"), None)

    grading_service = normalize_grading_service(extracted.get("grading_service"))
    if grading_service == CollectionItem.GradingService.NONE and preset == "pcgs_ngc" and extracted.get("cert_number"):
        grading_service = CollectionItem.GradingService.PCGS

    category = normalize_category(extracted.get("category"))
    if "category" not in extracted and grading_service != CollectionItem.GradingService.NONE:
        category = CollectionItem.Category.SLAB

    return {
        "title": title,
        "category": category,
        "status": normalize_status(extracted.get("status")),
        "country": (extracted.get("country") or "")[:100],
        "year": (extracted.get("year") or "")[:32],
        "denomination": (extracted.get("denomination") or "")[:64],
        "mint_or_refiner": (extracted.get("mint_or_refiner") or "")[:120],
        "series": (extracted.get("series") or "")[:120],
        "quantity": qty,
        "metal_type": normalize_metal_type(extracted.get("metal_type")),
        "weight_value": weight_val,
        "weight_unit": normalize_weight_unit(extracted.get("weight_unit")),
        "purity": purity_val,
        "grading_service": grading_service,
        "cert_number": (extracted.get("cert_number") or "")[:64],
        "grade": (extracted.get("grade") or "")[:32],
        "serial_number": (extracted.get("serial_number") or "")[:64],
        "purchase_price": purchase_val,
        "market_value_unit": market_val,
        "notes": extracted.get("notes") or "",
    }


def preview_csv(raw_bytes: bytes, sample_limit: int = 5) -> PreviewResult:
    """Parse uploaded CSV bytes and return preset detection, suggested mapping, and preview rows."""
    text = raw_bytes.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    headers = [h for h in (reader.fieldnames or []) if h is not None]
    preset, suggested_mapping = detect_preset_and_mapping(headers)

    all_rows = list(reader)
    sample_rows = all_rows[:sample_limit]
    normalized_preview: list[dict[str, Any]] = []
    for row in sample_rows:
        extracted = _extract_mapped_row(row, suggested_mapping)
        kwargs = _normalize_item_kwargs(extracted, preset=preset)
        normalized_preview.append({
            "title": kwargs["title"],
            "category": kwargs["category"],
            "metal_type": kwargs["metal_type"],
            "grade": kwargs["grade"],
            "quantity": kwargs["quantity"],
            "purchase_price": str(kwargs["purchase_price"]) if kwargs["purchase_price"] is not None else None,
            "market_value_unit": str(kwargs["market_value_unit"]),
        })

    return PreviewResult(
        detected_preset=preset,
        headers=headers,
        suggested_mapping=suggested_mapping,
        total_rows=len(all_rows),
        sample_rows=sample_rows,
        normalized_preview=normalized_preview,
    )


def _attach_remote_photo(
    client: httpx.Client,
    workspace: Workspace,
    item: CollectionItem,
    url: str,
    label: str,
    is_primary: bool,
) -> str | None:
    """Download a remote image URL and attach as ItemPhoto. Returns warning string on failure."""
    if not url.startswith(("http://", "https://")):
        return f"Skipped invalid photo URL for '{item.title}': {url}"
    try:
        resp = client.get(url)
        resp.raise_for_status()
        content = resp.content
        if len(content) > MAX_PHOTO_BYTES:
            return f"Skipped oversized photo (>5MB) for '{item.title}': {url}"
        img = Image.open(io.BytesIO(content))
        width, height = img.size
        img.verify()
        photo = ItemPhoto(
            workspace=workspace,
            item=item,
            label=label,
            is_primary=is_primary,
            sort_order=0 if is_primary else 1,
            width=width,
            height=height,
        )
        ext = (img.format or "jpeg").lower()
        photo.image.save(f"import-{label.lower()}.{ext}", ContentFile(content), save=True)
        return None
    except Exception as exc:
        logger.warning("Remote photo import failed for item %s (%s): %s", item.id, url, exc)
        return f"Could not fetch photo for '{item.title}' ({url}): {exc}"


def import_mapped_csv(
    raw_bytes: bytes,
    workspace: Workspace,
    mapping: dict[str, str] | None = None,
    import_photos: bool = False,
) -> MappedImportResult:
    """Import CSV rows using explicit or auto-detected column mappings."""
    text = raw_bytes.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    headers = [h for h in (reader.fieldnames or []) if h is not None]
    preset, auto_mapping = detect_preset_and_mapping(headers)
    effective_mapping = mapping if mapping else auto_mapping

    result = MappedImportResult(created_count=0)
    photo_client = httpx.Client(timeout=PHOTO_FETCH_TIMEOUT, follow_redirects=True) if import_photos else None

    try:
        for idx, row in enumerate(reader, start=2):
            extracted = _extract_mapped_row(row, effective_mapping)
            if not extracted:
                result.errors.append({"row": idx, "error": "Row has no mapped values."})
                continue
            try:
                kwargs = _normalize_item_kwargs(extracted, preset=preset)
                item = CollectionItem.objects.create(workspace=workspace, **kwargs)
                refresh_item_melt_from_latest_spot(item)
                result.created_count += 1

                if photo_client is not None:
                    obverse_url = extracted.get("obverse_image_url") or extracted.get("image_url")
                    reverse_url = extracted.get("reverse_image_url")
                    if obverse_url:
                        warn = _attach_remote_photo(
                            photo_client,
                            workspace,
                            item,
                            obverse_url,
                            ItemPhoto.Label.OBVERSE,
                            is_primary=True,
                        )
                        if warn:
                            result.warnings.append(warn)
                    if reverse_url:
                        warn = _attach_remote_photo(
                            photo_client,
                            workspace,
                            item,
                            reverse_url,
                            ItemPhoto.Label.REVERSE,
                            is_primary=not bool(obverse_url),
                        )
                        if warn:
                            result.warnings.append(warn)
            except (InvalidOperation, ValueError) as exc:
                result.errors.append({"row": idx, "error": str(exc)})
    finally:
        if photo_client is not None:
            photo_client.close()

    return result

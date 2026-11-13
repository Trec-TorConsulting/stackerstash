from __future__ import annotations

import csv
import io
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx
from django.core.files.base import ContentFile
from PIL import Image

from apps.accounts.models import Workspace
from apps.valuation.services import refresh_item_melt_from_latest_spot

from .image_processing import process_item_image
from .models import CollectionItem, Container, ItemPhoto

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
    "slab_designation",
    "serial_number",
    "container",
    "tags",
    "purchase_price",
    "market_value_unit",
    "notes",
    "obverse_image_url",
    "reverse_image_url",
    "slab_label_image_url",
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
    "series": ["series", "subject", "variety", "type/series", "reference", "krause number", "km#", "n#"],
    "quantity": ["quantity", "qty", "count", "amount"],
    "metal_type": ["metal_type", "metal", "composition", "material", "alloy"],
    "weight_value": ["weight_value", "weight", "precious metal weight", "mass"],
    "weight_unit": ["weight_unit", "unit", "weight unit"],
    "purity": ["purity", "fineness", "millesimal fineness"],
    "grading_service": [
        "grading_service",
        "grader",
        "grading company",
        "grading",
        "slab",
        "slabbed",
        "slab company",
        "certified by",
        "service",
        "tpg",
        "tpg service",
    ],
    "cert_number": [
        "cert_number",
        "cert #",
        "cert number",
        "cert no",
        "cert",
        "certification",
        "certification #",
        "certificate",
        "certificate #",
        "pcgs #",
        "pcgs cert",
        "ngc #",
        "ngc cert",
        "pmg #",
        "cac #",
        "slab #",
        "slab serial",
    ],
    "grade": ["grade", "condition", "assigned grade"],
    "slab_designation": [
        "slab_designation",
        "designation",
        "slab designation",
        "label",
        "label type",
        "strike",
        "attribution",
    ],
    "serial_number": ["serial_number", "serial #", "serial number", "serial"],
    "container": ["container", "custom set", "box", "location", "storage", "album", "tube"],
    "tags": ["tags", "tag", "labels"],
    "purchase_price": ["purchase_price", "paid", "price paid", "cost", "purchase cost", "cost basis"],
    "market_value_unit": [
        "market_value_unit",
        "market_value",
        "value, usd (coinsnap)",
        "estimated value",
        "est. value",
        "value",
        "price",
        "price guide",
        "fair market value",
        "fmv",
        "current value",
    ],
    "notes": ["notes", "note", "comments", "comment", "memo", "remarks"],
    "obverse_image_url": ["obverse_image_url", "obverse image", "obverse photo", "obverse url", "front image", "front url", "obverse"],
    "reverse_image_url": ["reverse_image_url", "reverse image", "reverse photo", "reverse url", "back image", "back url", "reverse"],
    "slab_label_image_url": ["slab_label_image_url", "slab image", "slab photo", "slab label", "slab url"],
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
    queued_appraisals: int = 0


def _normalize_header(header: str) -> str:
    return re.sub(r"\s+", " ", header.strip().lower())


def detect_preset_and_mapping(headers: list[str]) -> tuple[str, dict[str, str]]:
    """Detect source platform preset and build header -> Stacker Stash field mapping."""
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
        preset = "stackerstash"
    elif ({"denomination", "composition"} & norm_set) and (
        {
            "estimated value",
            "value",
            "value, usd (coinsnap)",
            "obverse image",
            "obverse url",
            "obverse photo",
            "reverse image",
            "reverse url",
            "reverse photo",
        }
        & norm_set
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

    grading_raw = extracted.get("grading_service") or ""
    grading_service = normalize_grading_service(grading_raw)
    if grading_service == CollectionItem.GradingService.NONE and preset == "pcgs_ngc" and extracted.get("cert_number"):
        grading_service = CollectionItem.GradingService.PCGS

    grade_val = (extracted.get("grade") or "").strip()
    if not grade_val and grading_service != CollectionItem.GradingService.NONE and grading_raw:
        # Extract embedded grade like "PCGS MS65" or "NGC PF70 UC"
        stripped = re.sub(
            r"\b(pcgs\s*banknote|pcgs|ngc|pmg|cacg|cac|anacs|icg)\b",
            "",
            grading_raw,
            flags=re.IGNORECASE,
        ).strip(" -:/")
        if stripped:
            grade_val = stripped

    category = normalize_category(extracted.get("category"))
    if "category" not in extracted and (
        grading_service != CollectionItem.GradingService.NONE or extracted.get("cert_number")
    ):
        category = CollectionItem.Category.SLAB

    weight_unit = (
        CollectionItem.WeightUnit.G
        if preset == "coinsnap" and not extracted.get("weight_unit") and extracted.get("weight_value")
        else normalize_weight_unit(extracted.get("weight_unit"))
    )

    tags_raw = extracted.get("tags") or ""
    tags_list = [t.strip() for t in re.split(r"[,;]", tags_raw) if t.strip()]

    attributes: dict[str, Any] = {}
    slab_designation = (extracted.get("slab_designation") or "").strip()
    if slab_designation:
        attributes["slab_designation"] = slab_designation[:120]

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
        "weight_unit": weight_unit,
        "purity": purity_val,
        "grading_service": grading_service,
        "cert_number": (extracted.get("cert_number") or "")[:64],
        "grade": grade_val[:32],
        "serial_number": (extracted.get("serial_number") or "")[:64],
        "purchase_price": purchase_val,
        "market_value_unit": market_val,
        "tags": tags_list,
        "attributes": attributes,
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


def _download_and_validate_photo(
    client: httpx.Client,
    item_id: Any,
    item_title: str,
    url: str,
    remove_background: bool = True,
) -> tuple[tuple[bytes, int, int, str] | None, str | None]:
    """Download, validate, and process a remote image URL. Returns ((content, width, height, ext), warning)."""
    if not url.startswith(("http://", "https://")):
        return None, f"Skipped invalid photo URL for '{item_title}': {url}"
    try:
        resp = client.get(url)
        resp.raise_for_status()
        content = resp.content
        if len(content) > MAX_PHOTO_BYTES:
            return None, f"Skipped oversized photo (>5MB) for '{item_title}': {url}"
        with Image.open(io.BytesIO(content)) as img:
            img.verify()
        processed, width, height, ext = process_item_image(
            content, remove_background=remove_background, enhance=True
        )
        return (processed, width, height, ext), None
    except Exception as exc:
        logger.warning("Remote photo import failed for item %s (%s): %s", item_id, url, exc)
        return None, f"Could not fetch photo for '{item_title}' ({url}): {exc}"


def _resolve_container_by_name(
    workspace: Workspace,
    raw_name: str | None,
    cache: dict[str, Container],
) -> Container | None:
    name = (raw_name or "").strip()[:120]
    if not name:
        return None
    key = name.lower()
    if key in cache:
        return cache[key]
    existing = Container.objects.filter(workspace=workspace, name__iexact=name).first()
    if existing:
        cache[key] = existing
        return existing
    created = Container.objects.create(workspace=workspace, name=name)
    cache[key] = created
    return created


def _enqueue_csv_batch_appraisals(item_ids: list[Any], workspace_id: Any) -> None:
    """Run background appraisals for CSV-imported items throttled to 2 workers."""
    import threading
    from django.db import close_old_connections
    from apps.accounts.models import Workspace
    from apps.valuation.services import start_appraisal_job

    def _worker() -> None:
        close_old_connections()
        try:
            ws = Workspace.objects.get(id=workspace_id)

            def _run_one(iid: Any) -> None:
                close_old_connections()
                try:
                    it = CollectionItem.objects.prefetch_related("photos").get(id=iid, workspace=ws)
                    start_appraisal_job(it, ws, sync=True)
                except Exception:
                    pass
                finally:
                    close_old_connections()

            with ThreadPoolExecutor(max_workers=2) as pool:
                list(pool.map(_run_one, item_ids))
        finally:
            close_old_connections()

    threading.Thread(target=_worker, daemon=True).start()


def import_mapped_csv(
    raw_bytes: bytes,
    workspace: Workspace,
    mapping: dict[str, str] | None = None,
    import_photos: bool = False,
    remove_background: bool = True,
    auto_appraise: bool = True,
) -> MappedImportResult:
    """Import CSV rows using explicit or auto-detected column mappings."""
    from apps.valuation.services import _clean_item_title

    text = raw_bytes.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    headers = [h for h in (reader.fieldnames or []) if h is not None]
    preset, auto_mapping = detect_preset_and_mapping(headers)
    effective_mapping = mapping if mapping else auto_mapping

    result = MappedImportResult(created_count=0)
    pending_photos: list[tuple[CollectionItem, str, str, bool]] = []
    created_item_ids: list[Any] = []
    container_cache: dict[str, Container] = {}

    for idx, row in enumerate(reader, start=2):
        extracted = _extract_mapped_row(row, effective_mapping)
        if not extracted:
            result.errors.append({"row": idx, "error": "Row has no mapped values."})
            continue
        try:
            kwargs = _normalize_item_kwargs(extracted, preset=preset)
            if kwargs.get("title"):
                kwargs["title"] = _clean_item_title(kwargs["title"])
            container = _resolve_container_by_name(
                workspace, extracted.get("container"), container_cache
            )
            item = CollectionItem.objects.create(
                workspace=workspace,
                container=container,
                intake_source=CollectionItem.IntakeSource.CSV,
                **kwargs,
            )
            refresh_item_melt_from_latest_spot(item)
            from apps.catalog.auto_sort import enqueue_item_auto_sort

            enqueue_item_auto_sort(item)
            created_item_ids.append(item.id)
            result.created_count += 1

            if import_photos:
                obverse_url = extracted.get("obverse_image_url") or extracted.get("image_url")
                reverse_url = extracted.get("reverse_image_url")
                slab_url = extracted.get("slab_label_image_url")
                if obverse_url:
                    pending_photos.append((item, obverse_url, ItemPhoto.Label.OBVERSE, True))
                if reverse_url:
                    pending_photos.append((item, reverse_url, ItemPhoto.Label.REVERSE, not bool(obverse_url)))
                if slab_url:
                    pending_photos.append(
                        (item, slab_url, ItemPhoto.Label.SLAB_LABEL, not bool(obverse_url or reverse_url))
                    )
        except (InvalidOperation, ValueError) as exc:
            result.errors.append({"row": idx, "error": str(exc)})

    if import_photos and pending_photos:
        with httpx.Client(
            timeout=PHOTO_FETCH_TIMEOUT,
            follow_redirects=True,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=20),
        ) as photo_client:
            with ThreadPoolExecutor(max_workers=16) as executor:
                fetched = list(
                    executor.map(
                        lambda task: _download_and_validate_photo(
                            photo_client,
                            task[0].id,
                            task[0].title,
                            task[1],
                            remove_background=remove_background,
                        ),
                        pending_photos,
                    )
                )

        for (item, _url, label, is_primary), (photo_data, warn) in zip(
            pending_photos, fetched, strict=True
        ):
            if warn:
                result.warnings.append(warn)
                continue
            if photo_data is None:
                continue
            content, width, height, ext = photo_data
            photo = ItemPhoto(
                workspace=workspace,
                item=item,
                label=label,
                is_primary=is_primary,
                sort_order=0 if is_primary else 1,
                width=width,
                height=height,
            )
            photo.image.save(f"import-{label.lower()}.{ext}", ContentFile(content), save=True)

    if auto_appraise and created_item_ids:
        _enqueue_csv_batch_appraisals(created_item_ids, workspace.id)
        result.queued_appraisals = len(created_item_ids)

    return result

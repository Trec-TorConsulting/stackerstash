import csv
import io
import json
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from ninja import File, Form, Router, Schema, UploadedFile
from ninja.errors import HttpError
from PIL import Image

from apps.accounts.auth import WorkspaceAuth

from .importer import TARGET_FIELDS, import_mapped_csv, preview_csv
from .models import CollectionItem, Container, ItemPhoto
from .presets import ITEM_PRESETS

catalog_router = Router(tags=["Catalog"], auth=WorkspaceAuth())


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class ContainerIn(Schema):
    name: str
    container_type: str = Container.ContainerType.BOX
    parent_id: UUID | None = None
    location_notes: str = ""


class ContainerOut(Schema):
    id: UUID
    name: str
    container_type: str
    parent_id: UUID | None
    location_notes: str
    direct_item_count: int
    total_item_count: int
    total_market_value: Decimal
    total_melt_value: Decimal
    children: list["ContainerOut"] = []


ContainerOut.model_rebuild()


class PhotoOut(Schema):
    id: UUID
    url: str
    label: str
    is_primary: bool
    sort_order: int
    width: int | None
    height: int | None
    created_at: datetime


class ItemIn(Schema):
    container_id: UUID | None = None
    category: str = CollectionItem.Category.COIN
    status: str = CollectionItem.Status.IN_COLLECTION
    title: str
    country: str = ""
    year: str = ""
    mint_or_refiner: str = ""
    denomination: str = ""
    series: str = ""
    quantity: int = 1
    metal_type: str = CollectionItem.MetalType.NONE
    weight_value: Decimal = Decimal("0")
    weight_unit: str = CollectionItem.WeightUnit.OZ_T
    purity: Decimal = Decimal("0.999000")
    grading_service: str = CollectionItem.GradingService.NONE
    cert_number: str = ""
    grade: str = ""
    estimated_grade: str = ""
    ai_confidence: float | None = None
    serial_number: str = ""
    purchase_price: Decimal | None = None
    purchase_date: date | None = None
    vendor: str = ""
    sold_price: Decimal | None = None
    sold_date: date | None = None
    market_value_unit: Decimal = Decimal("0.00")
    valuation_source: str = CollectionItem.ValuationSource.MANUAL
    is_estimate: bool = False
    tags: list[str] = []
    attributes: dict[str, Any] = {}
    notes: str = ""


class ItemPatch(Schema):
    container_id: UUID | None = None
    category: str | None = None
    status: str | None = None
    title: str | None = None
    country: str | None = None
    year: str | None = None
    mint_or_refiner: str | None = None
    denomination: str | None = None
    series: str | None = None
    quantity: int | None = None
    metal_type: str | None = None
    weight_value: Decimal | None = None
    weight_unit: str | None = None
    purity: Decimal | None = None
    grading_service: str | None = None
    cert_number: str | None = None
    grade: str | None = None
    estimated_grade: str | None = None
    ai_confidence: float | None = None
    serial_number: str | None = None
    purchase_price: Decimal | None = None
    purchase_date: date | None = None
    vendor: str | None = None
    sold_price: Decimal | None = None
    sold_date: date | None = None
    market_value_unit: Decimal | None = None
    valuation_source: str | None = None
    is_estimate: bool | None = None
    tags: list[str] | None = None
    attributes: dict[str, Any] | None = None
    notes: str | None = None


class ItemOut(Schema):
    id: UUID
    container_id: UUID | None
    container_name: str | None
    category: str
    status: str
    title: str
    country: str
    year: str
    mint_or_refiner: str
    denomination: str
    series: str
    quantity: int
    metal_type: str
    weight_value: Decimal
    weight_unit: str
    purity: Decimal
    fine_troy_oz: Decimal
    grading_service: str
    cert_number: str
    grade: str
    estimated_grade: str
    ai_confidence: float | None
    serial_number: str
    purchase_price: Decimal | None
    purchase_date: date | None
    vendor: str
    sold_price: Decimal | None
    sold_date: date | None
    melt_value_unit: Decimal
    market_value_unit: Decimal
    total_melt_value: Decimal
    total_market_value: Decimal
    collector_premium_total: Decimal
    unrealized_gain_loss: Decimal | None
    valuation_source: str
    is_estimate: bool
    valued_at: datetime | None
    tags: list[str]
    attributes: dict[str, Any]
    notes: str
    primary_photo_url: str | None
    photos: list[PhotoOut]
    created_at: datetime
    updated_at: datetime


class CsvImportRowError(Schema):
    row: int
    error: str


class CsvImportResult(Schema):
    created_count: int
    errors: list[CsvImportRowError]


class CsvImportPreviewOut(Schema):
    detected_preset: str
    headers: list[str]
    target_fields: list[str]
    suggested_mapping: dict[str, str]
    total_rows: int
    sample_rows: list[dict[str, str]]
    normalized_preview: list[dict[str, Any]]


class MappedCsvImportResult(Schema):
    created_count: int
    errors: list[CsvImportRowError]
    warnings: list[str]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _photo_to_out(photo: ItemPhoto) -> PhotoOut:
    return PhotoOut(
        id=photo.id,
        url=photo.image.url if photo.image else "",
        label=photo.label,
        is_primary=photo.is_primary,
        sort_order=photo.sort_order,
        width=photo.width,
        height=photo.height,
        created_at=photo.created_at,
    )


def _item_to_out(item: CollectionItem) -> ItemOut:
    photos = list(item.photos.all())
    primary = next((p for p in photos if p.is_primary), photos[0] if photos else None)
    return ItemOut(
        id=item.id,
        container_id=item.container_id,
        container_name=item.container.name if item.container else None,
        category=item.category,
        status=item.status,
        title=item.title,
        country=item.country,
        year=item.year,
        mint_or_refiner=item.mint_or_refiner,
        denomination=item.denomination,
        series=item.series,
        quantity=item.quantity,
        metal_type=item.metal_type,
        weight_value=item.weight_value,
        weight_unit=item.weight_unit,
        purity=item.purity,
        fine_troy_oz=item.fine_troy_oz,
        grading_service=item.grading_service,
        cert_number=item.cert_number,
        grade=item.grade,
        estimated_grade=item.estimated_grade,
        ai_confidence=item.ai_confidence,
        serial_number=item.serial_number,
        purchase_price=item.purchase_price,
        purchase_date=item.purchase_date,
        vendor=item.vendor,
        sold_price=item.sold_price,
        sold_date=item.sold_date,
        melt_value_unit=item.melt_value_unit,
        market_value_unit=item.market_value_unit,
        total_melt_value=item.total_melt_value,
        total_market_value=item.total_market_value,
        collector_premium_total=item.collector_premium_total,
        unrealized_gain_loss=item.unrealized_gain_loss,
        valuation_source=item.valuation_source,
        is_estimate=item.is_estimate,
        valued_at=item.valued_at,
        tags=item.tags or [],
        attributes=item.attributes or {},
        notes=item.notes,
        primary_photo_url=primary.image.url if primary and primary.image else None,
        photos=[_photo_to_out(p) for p in photos],
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _validate_container(workspace, container_id: UUID | None) -> Container | None:
    if container_id is None:
        return None
    container = Container.objects.filter(id=container_id, workspace=workspace).first()
    if not container:
        raise HttpError(404, "Container not found in active workspace.")
    return container


# ---------------------------------------------------------------------------
# Containers
# ---------------------------------------------------------------------------


@catalog_router.get("/containers", response=list[ContainerOut])
def list_containers(request):
    containers = list(Container.objects.filter(workspace=request.workspace))
    items = list(
        CollectionItem.objects.filter(
            workspace=request.workspace,
            container__isnull=False,
        ).exclude(status=CollectionItem.Status.SOLD)
    )

    direct_stats: dict[UUID, dict[str, Any]] = {
        c.id: {"count": 0, "market": Decimal("0.00"), "melt": Decimal("0.00")}
        for c in containers
    }
    for item in items:
        if item.container_id in direct_stats:
            st = direct_stats[item.container_id]
            st["count"] += item.quantity
            st["market"] += item.total_market_value
            st["melt"] += item.total_melt_value

    children_map: dict[UUID | None, list[Container]] = {}
    for c in containers:
        children_map.setdefault(c.parent_id, []).append(c)

    def build_node(c: Container) -> ContainerOut:
        child_nodes = [build_node(ch) for ch in children_map.get(c.id, [])]
        st = direct_stats[c.id]
        total_count = st["count"] + sum(ch.total_item_count for ch in child_nodes)
        total_market = st["market"] + sum(ch.total_market_value for ch in child_nodes)
        total_melt = st["melt"] + sum(ch.total_melt_value for ch in child_nodes)
        return ContainerOut(
            id=c.id,
            name=c.name,
            container_type=c.container_type,
            parent_id=c.parent_id,
            location_notes=c.location_notes,
            direct_item_count=st["count"],
            total_item_count=total_count,
            total_market_value=total_market.quantize(Decimal("0.01")),
            total_melt_value=total_melt.quantize(Decimal("0.01")),
            children=child_nodes,
        )

    return [build_node(root) for root in children_map.get(None, [])]


@catalog_router.post("/containers", response={201: ContainerOut})
def create_container(request, payload: ContainerIn):
    parent = _validate_container(request.workspace, payload.parent_id)
    container = Container.objects.create(
        workspace=request.workspace,
        parent=parent,
        name=payload.name.strip(),
        container_type=payload.container_type,
        location_notes=payload.location_notes,
    )
    return 201, ContainerOut(
        id=container.id,
        name=container.name,
        container_type=container.container_type,
        parent_id=container.parent_id,
        location_notes=container.location_notes,
        direct_item_count=0,
        total_item_count=0,
        total_market_value=Decimal("0.00"),
        total_melt_value=Decimal("0.00"),
        children=[],
    )


@catalog_router.patch("/containers/{container_id}", response=ContainerOut)
def update_container(request, container_id: UUID, payload: ContainerIn):
    container = get_object_or_404(Container, id=container_id, workspace=request.workspace)
    if payload.parent_id == container.id:
        raise HttpError(400, "A container cannot be its own parent.")
    parent = _validate_container(request.workspace, payload.parent_id)
    container.name = payload.name.strip()
    container.container_type = payload.container_type
    container.parent = parent
    container.location_notes = payload.location_notes
    container.save()
    return ContainerOut(
        id=container.id,
        name=container.name,
        container_type=container.container_type,
        parent_id=container.parent_id,
        location_notes=container.location_notes,
        direct_item_count=0,
        total_item_count=0,
        total_market_value=Decimal("0.00"),
        total_melt_value=Decimal("0.00"),
        children=[],
    )


@catalog_router.delete("/containers/{container_id}", response={204: None})
def delete_container(request, container_id: UUID):
    container = get_object_or_404(Container, id=container_id, workspace=request.workspace)
    container.delete()
    return 204, None


# ---------------------------------------------------------------------------
# Presets & Items
# ---------------------------------------------------------------------------


@catalog_router.get("/items/presets")
def get_item_presets(request):
    return ITEM_PRESETS


@catalog_router.get("/items", response=list[ItemOut])
def list_items(
    request,
    category: str | None = None,
    metal_type: str | None = None,
    container_id: UUID | None = None,
    grading_service: str | None = None,
    status: str | None = None,
    tag: str | None = None,
    is_estimate: bool | None = None,
    q: str | None = None,
    sort: str = "-created_at",
):
    qs = (
        CollectionItem.objects.filter(workspace=request.workspace)
        .select_related("container")
        .prefetch_related("photos")
    )

    if category:
        qs = qs.filter(category=category)
    if metal_type:
        qs = qs.filter(metal_type=metal_type)
    if container_id:
        qs = qs.filter(container_id=container_id)
    if grading_service:
        qs = qs.filter(grading_service=grading_service)
    if status:
        qs = qs.filter(status=status)
    if is_estimate is not None:
        qs = qs.filter(is_estimate=is_estimate)
    if q:
        term = q.strip()
        qs = qs.filter(
            Q(title__icontains=term)
            | Q(cert_number__icontains=term)
            | Q(serial_number__icontains=term)
            | Q(mint_or_refiner__icontains=term)
            | Q(country__icontains=term)
            | Q(notes__icontains=term)
        )

    items = list(qs)
    if tag:
        items = [i for i in items if tag in (i.tags or [])]

    sort_key_map = {
        "-market_value_total": lambda i: i.total_market_value,
        "market_value_total": lambda i: i.total_market_value,
        "-melt_value_total": lambda i: i.total_melt_value,
        "melt_value_total": lambda i: i.total_melt_value,
        "-gain_loss": lambda i: i.unrealized_gain_loss or Decimal("-999999999"),
        "title": lambda i: i.title.lower(),
        "-purchase_date": lambda i: i.purchase_date or date.min,
        "-created_at": lambda i: i.created_at,
        "created_at": lambda i: i.created_at,
    }
    reverse = sort.startswith("-")
    key_fn = sort_key_map.get(sort, sort_key_map["-created_at"])
    items.sort(key=key_fn, reverse=reverse)

    return [_item_to_out(i) for i in items]


@catalog_router.post("/items", response={201: ItemOut})
def create_item(request, payload: ItemIn):
    container = _validate_container(request.workspace, payload.container_id)
    item = CollectionItem(
        workspace=request.workspace,
        container=container,
        category=payload.category,
        status=payload.status,
        title=payload.title.strip(),
        country=payload.country,
        year=payload.year,
        mint_or_refiner=payload.mint_or_refiner,
        denomination=payload.denomination,
        series=payload.series,
        quantity=max(1, payload.quantity),
        metal_type=payload.metal_type,
        weight_value=payload.weight_value,
        weight_unit=payload.weight_unit,
        purity=payload.purity,
        grading_service=payload.grading_service,
        cert_number=payload.cert_number.strip(),
        grade=payload.grade.strip(),
        estimated_grade=payload.estimated_grade.strip(),
        ai_confidence=payload.ai_confidence,
        serial_number=payload.serial_number.strip(),
        purchase_price=payload.purchase_price,
        purchase_date=payload.purchase_date,
        vendor=payload.vendor,
        sold_price=payload.sold_price,
        sold_date=payload.sold_date,
        market_value_unit=payload.market_value_unit,
        valuation_source=payload.valuation_source,
        is_estimate=payload.is_estimate,
        valued_at=timezone.now() if payload.market_value_unit > 0 else None,
        tags=payload.tags,
        attributes=payload.attributes,
        notes=payload.notes,
    )
    # Compute live melt value if a spot snapshot exists
    from apps.valuation.services import refresh_item_melt_from_latest_spot

    item.save()
    refresh_item_melt_from_latest_spot(item)
    return 201, _item_to_out(item)


@catalog_router.get("/items/{item_id}", response=ItemOut)
def get_item(request, item_id: UUID):
    item = get_object_or_404(
        CollectionItem.objects.select_related("container").prefetch_related("photos"),
        id=item_id,
        workspace=request.workspace,
    )
    return _item_to_out(item)


@catalog_router.patch("/items/{item_id}", response=ItemOut)
def update_item(request, item_id: UUID, payload: ItemPatch):
    item = get_object_or_404(
        CollectionItem.objects.select_related("container").prefetch_related("photos"),
        id=item_id,
        workspace=request.workspace,
    )
    data = payload.dict(exclude_unset=True)
    if "container_id" in data:
        item.container = _validate_container(request.workspace, data.pop("container_id"))
    for field, value in data.items():
        setattr(item, field, value)
    if "market_value_unit" in data:
        item.valued_at = timezone.now()
    item.save()

    from apps.valuation.services import refresh_item_melt_from_latest_spot

    refresh_item_melt_from_latest_spot(item)
    return _item_to_out(item)


@catalog_router.delete("/items/{item_id}", response={204: None})
def delete_item(request, item_id: UUID):
    item = get_object_or_404(CollectionItem, id=item_id, workspace=request.workspace)
    item.delete()
    return 204, None


# ---------------------------------------------------------------------------
# Multi-Photo Management
# ---------------------------------------------------------------------------


@catalog_router.post("/items/{item_id}/photos", response={201: PhotoOut})
@transaction.atomic
def upload_item_photo(
    request,
    item_id: UUID,
    file: UploadedFile = File(...),
    label: str = Form(ItemPhoto.Label.OBVERSE),
    is_primary: bool = Form(False),
):
    item = get_object_or_404(CollectionItem, id=item_id, workspace=request.workspace)
    if label not in dict(ItemPhoto.Label.choices):
        raise HttpError(400, f"Invalid photo label: {label}")

    width: int | None = None
    height: int | None = None
    try:
        file.seek(0)
        with Image.open(file) as img:
            width, height = img.size
        file.seek(0)
    except Exception:
        file.seek(0)

    has_existing = item.photos.exists()
    make_primary = is_primary or not has_existing
    if make_primary:
        item.photos.update(is_primary=False)

    next_order = (item.photos.count() + 1)
    photo = ItemPhoto.objects.create(
        workspace=request.workspace,
        item=item,
        image=file,
        label=label,
        is_primary=make_primary,
        sort_order=next_order,
        width=width,
        height=height,
    )
    return 201, _photo_to_out(photo)


@catalog_router.patch("/items/{item_id}/photos/{photo_id}/primary", response=PhotoOut)
@transaction.atomic
def set_primary_photo(request, item_id: UUID, photo_id: UUID):
    item = get_object_or_404(CollectionItem, id=item_id, workspace=request.workspace)
    photo = get_object_or_404(ItemPhoto, id=photo_id, item=item, workspace=request.workspace)
    item.photos.update(is_primary=False)
    photo.is_primary = True
    photo.save(update_fields=["is_primary"])
    return _photo_to_out(photo)


@catalog_router.delete("/items/{item_id}/photos/{photo_id}", response={204: None})
def delete_item_photo(request, item_id: UUID, photo_id: UUID):
    item = get_object_or_404(CollectionItem, id=item_id, workspace=request.workspace)
    photo = get_object_or_404(ItemPhoto, id=photo_id, item=item, workspace=request.workspace)
    was_primary = photo.is_primary
    photo.image.delete(save=False)
    photo.delete()
    if was_primary:
        replacement = item.photos.first()
        if replacement:
            replacement.is_primary = True
            replacement.save(update_fields=["is_primary"])
    return 204, None


# ---------------------------------------------------------------------------
# Export & Bulk CSV Import
# ---------------------------------------------------------------------------


@catalog_router.get("/items/export/csv")
def export_items_csv(request):
    items = CollectionItem.objects.filter(workspace=request.workspace).select_related("container")
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "id",
        "title",
        "category",
        "status",
        "container",
        "quantity",
        "metal_type",
        "weight_value",
        "weight_unit",
        "purity",
        "fine_troy_oz",
        "grading_service",
        "cert_number",
        "grade",
        "serial_number",
        "purchase_price",
        "purchase_date",
        "melt_value_total",
        "market_value_total",
        "valuation_source",
        "is_estimate",
    ])
    for item in items:
        writer.writerow([
            str(item.id),
            item.title,
            item.category,
            item.status,
            item.container.name if item.container else "",
            item.quantity,
            item.metal_type,
            str(item.weight_value),
            item.weight_unit,
            str(item.purity),
            str(item.fine_troy_oz),
            item.grading_service,
            item.cert_number,
            item.grade,
            item.serial_number,
            str(item.purchase_price or ""),
            str(item.purchase_date or ""),
            str(item.total_melt_value),
            str(item.total_market_value),
            item.valuation_source,
            str(item.is_estimate),
        ])
    resp = HttpResponse(buf.getvalue(), content_type="text/csv")
    resp["Content-Disposition"] = 'attachment; filename="stackvault-collection.csv"'
    return resp


@catalog_router.get("/items/export/json")
def export_items_json(request):
    items = (
        CollectionItem.objects.filter(workspace=request.workspace)
        .select_related("container")
        .prefetch_related("photos")
    )
    payload = [_item_to_out(i).model_dump(mode="json") for i in items]
    resp = HttpResponse(json.dumps(payload, indent=2), content_type="application/json")
    resp["Content-Disposition"] = 'attachment; filename="stackvault-collection.json"'
    return resp


@catalog_router.post("/items/import/csv", response=CsvImportResult)
def import_items_csv(request, file: UploadedFile = File(...)):
    raw = file.read().decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(raw))
    created_count = 0
    errors: list[CsvImportRowError] = []

    for idx, row in enumerate(reader, start=2):
        title = (row.get("title") or "").strip()
        if not title:
            errors.append(CsvImportRowError(row=idx, error="Missing required 'title' column."))
            continue
        try:
            qty = int(row.get("quantity") or 1)
            weight_val = Decimal(row.get("weight_value") or "0")
            purity_val = Decimal(row.get("purity") or "0.999")
            market_val = Decimal(row.get("market_value_unit") or row.get("market_value") or "0")
            purchase_val = (
                Decimal(row["purchase_price"]) if row.get("purchase_price") else None
            )
            CollectionItem.objects.create(
                workspace=request.workspace,
                title=title,
                category=(row.get("category") or "COIN").upper(),
                status=(row.get("status") or "IN_COLLECTION").upper(),
                country=row.get("country") or "",
                year=row.get("year") or "",
                mint_or_refiner=row.get("mint_or_refiner") or "",
                quantity=max(1, qty),
                metal_type=(row.get("metal_type") or "NONE").upper(),
                weight_value=weight_val,
                weight_unit=(row.get("weight_unit") or "OZ_T").upper(),
                purity=purity_val,
                grading_service=(row.get("grading_service") or "NONE").upper(),
                cert_number=row.get("cert_number") or "",
                grade=row.get("grade") or "",
                serial_number=row.get("serial_number") or "",
                purchase_price=purchase_val,
                market_value_unit=market_val,
                notes=row.get("notes") or "",
            )
            created_count += 1
        except (InvalidOperation, ValueError) as exc:
            errors.append(CsvImportRowError(row=idx, error=str(exc)))

    return CsvImportResult(created_count=created_count, errors=errors)


@catalog_router.post("/items/import/preview", response=CsvImportPreviewOut)
def preview_items_csv_import(request, file: UploadedFile = File(...)):
    preview = preview_csv(file.read())
    return CsvImportPreviewOut(
        detected_preset=preview.detected_preset,
        headers=preview.headers,
        target_fields=TARGET_FIELDS,
        suggested_mapping=preview.suggested_mapping,
        total_rows=preview.total_rows,
        sample_rows=preview.sample_rows,
        normalized_preview=preview.normalized_preview,
    )


@catalog_router.post("/items/import/mapped", response=MappedCsvImportResult)
def import_items_csv_mapped(
    request,
    file: UploadedFile = File(...),
    mapping: str = Form(""),
    import_photos: bool = Form(False),
):
    parsed_mapping: dict[str, str] | None = None
    if mapping.strip():
        try:
            raw_map = json.loads(mapping)
            if not isinstance(raw_map, dict):
                raise HttpError(400, "mapping must be a JSON object.")
            parsed_mapping = {str(k): str(v) for k, v in raw_map.items() if v}
        except json.JSONDecodeError as exc:
            raise HttpError(400, f"Invalid mapping JSON: {exc}") from exc

    res = import_mapped_csv(
        file.read(),
        workspace=request.workspace,
        mapping=parsed_mapping,
        import_photos=import_photos,
    )
    return MappedCsvImportResult(
        created_count=res.created_count,
        errors=[CsvImportRowError(**e) for e in res.errors],
        warnings=res.warnings,
    )


@catalog_router.get("/items/export/insurance-report")
def export_insurance_report(request):
    items = (
        CollectionItem.objects.filter(
            workspace=request.workspace,
            status=CollectionItem.Status.IN_COLLECTION,
        )
        .select_related("container")
        .prefetch_related("photos")
        .order_by("-market_value_unit")
    )
    total_market = sum((i.total_market_value for i in items), Decimal("0.00"))
    total_melt = sum((i.total_melt_value for i in items), Decimal("0.00"))
    return {
        "generated_at": timezone.now().isoformat(),
        "workspace_name": request.workspace.name,
        "item_count": sum(i.quantity for i in items),
        "total_market_value": str(total_market),
        "total_melt_value": str(total_melt),
        "items": [
            {
                "title": i.title,
                "category": i.category,
                "quantity": i.quantity,
                "container": i.container.name if i.container else "Unassigned",
                "metal_type": i.metal_type,
                "fine_troy_oz": str(i.fine_troy_oz * i.quantity),
                "grading_service": i.grading_service,
                "cert_number": i.cert_number,
                "serial_number": i.serial_number,
                "replacement_value": str(i.total_market_value),
                "is_estimate": i.is_estimate,
            }
            for i in items
        ],
    }

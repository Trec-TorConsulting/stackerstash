from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from django.shortcuts import get_object_or_404
from ninja import Router, Schema

from apps.accounts.auth import WorkspaceAuth
from apps.catalog.api import ItemOut, _item_to_out
from apps.catalog.models import CollectionItem

from .models import AppraisalJob, ValuationHistory
from .providers import build_cert_verification_url
from .services import (
    compute_portfolio_summary,
    get_latest_spot_map,
    refresh_spot_prices,
    start_appraisal_job,
)

valuation_router = Router(tags=["Valuation"], auth=WorkspaceAuth())
analytics_router = Router(tags=["Analytics"], auth=WorkspaceAuth())


@valuation_router.get("/spots")
def list_spots(request):
    spots = get_latest_spot_map()
    return {k: str(v) for k, v in spots.items()}


@valuation_router.post("/spots/refresh")
def trigger_spot_refresh(request):
    spots = refresh_spot_prices()
    return {k: str(v) for k, v in spots.items()}


class AppraisalJobOut(Schema):
    id: UUID
    item_id: UUID
    status: str
    steps: dict[str, str]
    error_message: str
    created_at: datetime
    completed_at: datetime | None
    item: ItemOut | None = None


class ValuationHistoryOut(Schema):
    id: UUID
    melt_value_unit: Decimal
    market_value_unit: Decimal
    source: str
    is_estimate: bool
    raw_payload: dict[str, Any]
    recorded_at: datetime


@valuation_router.post("/items/{item_id}/appraise", response=AppraisalJobOut)
def appraise_collection_item(request, item_id: UUID, sync: bool = False):
    item = get_object_or_404(
        CollectionItem.objects.select_related("container").prefetch_related("photos"),
        id=item_id,
        workspace=request.workspace,
    )
    job = start_appraisal_job(item, request.workspace, sync=sync)
    job.item.refresh_from_db()
    return AppraisalJobOut(
        id=job.id,
        item_id=job.item_id,
        status=job.status,
        steps=job.steps or {},
        error_message=job.error_message,
        created_at=job.created_at,
        completed_at=job.completed_at,
        item=_item_to_out(job.item),
    )


@valuation_router.get("/jobs/{job_id}", response=AppraisalJobOut)
def get_appraisal_job(request, job_id: UUID):
    job = get_object_or_404(
        AppraisalJob.objects.select_related("item__container").prefetch_related("item__photos"),
        id=job_id,
        workspace=request.workspace,
    )
    return AppraisalJobOut(
        id=job.id,
        item_id=job.item_id,
        status=job.status,
        steps=job.steps or {},
        error_message=job.error_message,
        created_at=job.created_at,
        completed_at=job.completed_at,
        item=_item_to_out(job.item) if job.status == AppraisalJob.Status.COMPLETED else None,
    )


@valuation_router.get("/items/{item_id}/valuations", response=list[ValuationHistoryOut])
def list_item_valuations(request, item_id: UUID):
    item = get_object_or_404(CollectionItem, id=item_id, workspace=request.workspace)
    rows = ValuationHistory.objects.filter(item=item)[:10]
    return [
        ValuationHistoryOut(
            id=r.id,
            melt_value_unit=r.melt_value_unit,
            market_value_unit=r.market_value_unit,
            source=r.source,
            is_estimate=r.is_estimate,
            raw_payload=r.raw_payload or {},
            recorded_at=r.recorded_at,
        )
        for r in rows
    ]


@valuation_router.get("/items/{item_id}/cert-url")
def get_cert_verification_url(request, item_id: UUID):
    item = get_object_or_404(CollectionItem, id=item_id, workspace=request.workspace)
    url = build_cert_verification_url(item.grading_service, item.cert_number)
    return {"grading_service": item.grading_service, "cert_number": item.cert_number, "url": url}


@analytics_router.get("/summary")
def portfolio_summary(request):
    return compute_portfolio_summary(request.workspace)

from uuid import UUID

from django.shortcuts import get_object_or_404
from ninja import Router

from apps.accounts.auth import WorkspaceAuth
from apps.catalog.api import ItemOut, _item_to_out
from apps.catalog.models import CollectionItem

from .providers import build_cert_verification_url
from .services import (
    appraise_item,
    compute_portfolio_summary,
    get_latest_spot_map,
    refresh_spot_prices,
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


@valuation_router.post("/items/{item_id}/appraise", response=ItemOut)
def appraise_collection_item(request, item_id: UUID):
    item = get_object_or_404(
        CollectionItem.objects.select_related("container").prefetch_related("photos"),
        id=item_id,
        workspace=request.workspace,
    )
    updated = appraise_item(item, request.workspace)
    return _item_to_out(updated)


@valuation_router.get("/items/{item_id}/cert-url")
def get_cert_verification_url(request, item_id: UUID):
    item = get_object_or_404(CollectionItem, id=item_id, workspace=request.workspace)
    url = build_cert_verification_url(item.grading_service, item.cert_number)
    return {"grading_service": item.grading_service, "cert_number": item.cert_number, "url": url}


@analytics_router.get("/summary")
def portfolio_summary(request):
    return compute_portfolio_summary(request.workspace)

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from uuid import UUID

from django.db.models import Count, F, Q, Sum
from django.utils import timezone
from ninja import Router, Schema
from ninja.errors import HttpError

from apps.catalog.models import CollectionItem, Container
from apps.valuation.models import SpotPriceSnapshot

from .auth import WorkspaceAuth, resolve_user_workspace
from .models import ProviderCredential, User, Workspace, WorkspaceMembership


class GlobalAdminAuth(WorkspaceAuth):
    """Bearer JWT authentication restricted to Global Admins (staff or superuser)."""

    def authenticate(self, request, token: str):
        user = super().authenticate(request, token)
        if user is None:
            return None
        if not (user.is_staff or user.is_superuser):
            raise HttpError(403, "Global Admin access required.")
        return user


admin_router = Router(tags=["Global Admin"], auth=GlobalAdminAuth())


class AdminOverviewOut(Schema):
    total_users: int
    active_users: int
    admin_users: int
    recent_signups_7d: int
    total_workspaces: int
    total_items: int
    total_containers: int
    total_market_value: str
    total_melt_value: str
    last_spot_sync: datetime | None = None


class AdminUserWorkspaceOut(Schema):
    id: UUID
    name: str
    slug: str


class AdminUserOut(Schema):
    id: UUID
    email: str
    display_name: str
    is_active: bool
    is_staff: bool
    is_superuser: bool
    date_joined: datetime
    last_login: datetime | None = None
    workspace_count: int
    primary_workspace: AdminUserWorkspaceOut | None = None
    item_count: int
    container_count: int
    total_market_value: str


class AdminUserPatchIn(Schema):
    is_active: bool | None = None
    is_staff: bool | None = None
    display_name: str | None = None


class AdminWorkspaceOut(Schema):
    id: UUID
    name: str
    slug: str
    default_currency: str
    owner_email: str
    member_count: int
    item_count: int
    container_count: int
    total_market_value: str
    total_melt_value: str
    configured_providers: list[str]
    created_at: datetime


def _decimal_str(val: Decimal | None) -> str:
    return str((val or Decimal("0.00")).quantize(Decimal("0.01")))


def _workspace_totals(workspace_id: UUID) -> tuple[int, int, Decimal, Decimal]:
    agg = CollectionItem.objects.filter(
        workspace_id=workspace_id, status=CollectionItem.Status.IN_COLLECTION
    ).aggregate(
        item_count=Count("id"),
        market=Sum(F("market_value_unit") * F("quantity")),
        melt=Sum(F("melt_value_unit") * F("quantity")),
    )
    container_count = Container.objects.filter(workspace_id=workspace_id).count()
    return (
        agg["item_count"] or 0,
        container_count,
        agg["market"] or Decimal("0.00"),
        agg["melt"] or Decimal("0.00"),
    )


def _serialize_admin_user(user: User) -> AdminUserOut:
    ws = resolve_user_workspace(user)
    ws_count = WorkspaceMembership.objects.filter(user=user).count()
    if ws is not None:
        item_count, container_count, market_val, _ = _workspace_totals(ws.id)
        primary_ws = AdminUserWorkspaceOut(id=ws.id, name=ws.name, slug=ws.slug)
    else:
        item_count, container_count, market_val = 0, 0, Decimal("0.00")
        primary_ws = None

    return AdminUserOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        is_active=user.is_active,
        is_staff=user.is_staff,
        is_superuser=user.is_superuser,
        date_joined=user.date_joined,
        last_login=user.last_login,
        workspace_count=ws_count,
        primary_workspace=primary_ws,
        item_count=item_count,
        container_count=container_count,
        total_market_value=_decimal_str(market_val),
    )


@admin_router.get("/overview", response=AdminOverviewOut)
def get_admin_overview(request):
    seven_days_ago = timezone.now() - timedelta(days=7)
    item_agg = CollectionItem.objects.filter(status=CollectionItem.Status.IN_COLLECTION).aggregate(
        total_items=Count("id"),
        market=Sum(F("market_value_unit") * F("quantity")),
        melt=Sum(F("melt_value_unit") * F("quantity")),
    )
    latest_spot = SpotPriceSnapshot.objects.order_by("-fetched_at").first()

    return AdminOverviewOut(
        total_users=User.objects.count(),
        active_users=User.objects.filter(is_active=True).count(),
        admin_users=User.objects.filter(Q(is_staff=True) | Q(is_superuser=True)).count(),
        recent_signups_7d=User.objects.filter(date_joined__gte=seven_days_ago).count(),
        total_workspaces=Workspace.objects.count(),
        total_items=item_agg["total_items"] or 0,
        total_containers=Container.objects.count(),
        total_market_value=_decimal_str(item_agg["market"]),
        total_melt_value=_decimal_str(item_agg["melt"]),
        last_spot_sync=latest_spot.fetched_at if latest_spot else None,
    )


@admin_router.get("/users", response=list[AdminUserOut])
def list_admin_users(request, q: str = "", status: str = "all"):
    qs = User.objects.all().order_by("-date_joined")
    query = q.strip()
    if query:
        qs = qs.filter(Q(email__icontains=query) | Q(display_name__icontains=query))
    if status == "active":
        qs = qs.filter(is_active=True)
    elif status == "inactive":
        qs = qs.filter(is_active=False)
    elif status == "admins":
        qs = qs.filter(Q(is_staff=True) | Q(is_superuser=True))

    return [_serialize_admin_user(u) for u in qs[:200]]


@admin_router.patch("/users/{user_id}", response=AdminUserOut)
def update_admin_user(request, user_id: UUID, payload: AdminUserPatchIn):
    target = User.objects.filter(id=user_id).first()
    if target is None:
        raise HttpError(404, "User not found.")

    if target.id == request.user.id:
        if payload.is_active is False:
            raise HttpError(400, "You cannot deactivate your own admin account.")
        if payload.is_staff is False and not target.is_superuser:
            raise HttpError(400, "You cannot remove your own staff access.")

    if target.is_superuser and payload.is_active is False and not request.user.is_superuser:
        raise HttpError(403, "Only a superuser can deactivate another superuser.")

    update_fields: list[str] = []
    if payload.is_active is not None:
        target.is_active = payload.is_active
        update_fields.append("is_active")
    if payload.is_staff is not None:
        target.is_staff = payload.is_staff
        update_fields.append("is_staff")
    if payload.display_name is not None:
        target.display_name = payload.display_name.strip()
        update_fields.append("display_name")

    if update_fields:
        target.save(update_fields=update_fields)

    return _serialize_admin_user(target)


@admin_router.get("/workspaces", response=list[AdminWorkspaceOut])
def list_admin_workspaces(request, q: str = ""):
    qs = Workspace.objects.select_related("owner").order_by("-created_at")
    query = q.strip()
    if query:
        qs = qs.filter(
            Q(name__icontains=query)
            | Q(slug__icontains=query)
            | Q(owner__email__icontains=query)
        )

    results: list[AdminWorkspaceOut] = []
    for ws in qs[:200]:
        item_count, container_count, market_val, melt_val = _workspace_totals(ws.id)
        member_count = WorkspaceMembership.objects.filter(workspace=ws).count()
        providers = list(
            ProviderCredential.objects.filter(workspace=ws)
            .exclude(encrypted_value="")
            .values_list("provider", flat=True)
        )
        results.append(
            AdminWorkspaceOut(
                id=ws.id,
                name=ws.name,
                slug=ws.slug,
                default_currency=ws.default_currency,
                owner_email=ws.owner.email,
                member_count=member_count,
                item_count=item_count,
                container_count=container_count,
                total_market_value=_decimal_str(market_val),
                total_melt_value=_decimal_str(melt_val),
                configured_providers=providers,
                created_at=ws.created_at,
            )
        )
    return results

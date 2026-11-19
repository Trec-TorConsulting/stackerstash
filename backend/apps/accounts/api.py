import logging
from datetime import datetime
from typing import Any
from uuid import UUID

from django.contrib.auth import authenticate
from django.db import transaction
from django.db.models import Case, Count, F, IntegerField, Sum, Value, When
from django.utils import timezone
from django.utils.text import slugify
from ninja import Router, Schema, Status
from ninja.errors import HttpError

from .auth import (
    WorkspaceAuth,
    issue_access_token,
    require_owner,
    resolve_user_workspace,
)
from .models import (
    ProviderCredential,
    User,
    Workspace,
    WorkspaceInvitation,
    WorkspaceMembership,
    assert_can_create_vault,
    create_default_workspace_for_user,
    get_owner_default_workspace,
    get_user_entitlement_status,
)

logger = logging.getLogger(__name__)
auth_router = Router(tags=["Auth"])
settings_router = Router(tags=["Settings"], auth=WorkspaceAuth())


class RegisterIn(Schema):
    email: str
    password: str
    display_name: str = ""
    workspace_name: str | None = None


class LoginIn(Schema):
    email: str
    password: str


class WorkspaceOut(Schema):
    id: UUID
    name: str
    slug: str
    description: str = ""
    default_currency: str
    auto_sort_enabled: bool = True
    is_default: bool = False
    item_count: int = 0
    total_market_value: str = "0.00"
    role: str = WorkspaceMembership.Role.OWNER
    is_shared: bool = False
    owner_email: str = ""


class WorkspaceCreateIn(Schema):
    name: str
    description: str = ""
    default_currency: str = "USD"
    auto_sort_enabled: bool = True


class WorkspaceUpdateIn(Schema):
    name: str | None = None
    description: str | None = None
    default_currency: str | None = None
    auto_sort_enabled: bool | None = None


class WorkspaceSettingsOut(Schema):
    id: UUID
    name: str
    slug: str
    description: str = ""
    default_currency: str
    auto_sort_enabled: bool
    is_default: bool = False
    role: str = WorkspaceMembership.Role.OWNER
    is_shared: bool = False
    owner_email: str = ""


class WorkspaceSettingsPatchIn(Schema):
    name: str | None = None
    description: str | None = None
    default_currency: str | None = None
    auto_sort_enabled: bool | None = None


class PlanSummaryOut(Schema):
    tier: str
    name: str
    max_vaults: int | None = None
    max_items: int | None = None
    owned_vault_count: int = 0
    active_item_count: int = 0
    enforce_tiers: bool = True
    dedicated_server: bool = False


class UserOut(Schema):
    id: UUID
    email: str
    display_name: str
    is_staff: bool
    is_superuser: bool
    workspace: WorkspaceOut
    workspaces: list[WorkspaceOut] = []
    plan: PlanSummaryOut | None = None


class AuthResponse(Schema):
    access_token: str
    token_type: str = "bearer"  # noqa: S105  # nosec B105
    user: UserOut


class CredentialOut(Schema):
    provider: str
    label: str
    is_configured: bool
    masked_hint: str
    updated_at: datetime | None = None
    is_inherited: bool = False
    inherited_from_workspace_name: str | None = None


class CredentialIn(Schema):
    value: str


class MePatchIn(Schema):
    display_name: str


class ChangePasswordIn(Schema):
    current_password: str
    new_password: str


class DeleteAccountIn(Schema):
    password: str


class WorkspaceInviteCreateIn(Schema):
    email: str
    role: str = WorkspaceInvitation.Role.VIEWER


class WorkspaceInviteOut(Schema):
    id: UUID
    workspace_id: UUID
    workspace_name: str
    email: str
    role: str
    status: str
    token: str
    invite_path: str
    invited_by_email: str
    accepted_by_email: str | None = None
    expires_at: datetime
    is_expired: bool = False
    created_at: datetime
    responded_at: datetime | None = None


class InvitePreviewOut(Schema):
    id: UUID
    workspace_id: UUID
    workspace_name: str
    owner_email: str
    invited_by_email: str
    email: str
    role: str
    status: str
    expires_at: datetime
    is_expired: bool = False


class WorkspaceMemberOut(Schema):
    id: UUID
    user_id: UUID
    email: str
    display_name: str
    role: str
    is_owner: bool
    created_at: datetime


class WorkspaceMemberPatchIn(Schema):
    role: str


def _serialize_workspace(
    ws: Workspace,
    item_count: int = 0,
    market_value: str = "0.00",
    role: str | None = None,
    user: User | None = None,
) -> WorkspaceOut:
    effective_role = role or (
        WorkspaceMembership.Role.OWNER
        if user is None or ws.owner_id == user.id
        else WorkspaceMembership.Role.VIEWER
    )
    owner_email = ws.owner.email if ws.owner_id else ""
    is_shared = (
        ws.owner_id != user.id
        if user is not None
        else effective_role != WorkspaceMembership.Role.OWNER
    )
    return WorkspaceOut(
        id=ws.id,
        name=ws.name,
        slug=ws.slug,
        description=ws.description,
        default_currency=ws.default_currency,
        auto_sort_enabled=ws.auto_sort_enabled,
        is_default=ws.is_default,
        item_count=item_count,
        total_market_value=market_value,
        role=effective_role,
        is_shared=is_shared,
        owner_email=owner_email,
    )


def _list_user_workspaces(user: User) -> list[WorkspaceOut]:
    from decimal import Decimal

    from apps.catalog.models import CollectionItem

    memberships = list(
        WorkspaceMembership.objects.select_related("workspace", "workspace__owner")
        .filter(user=user)
        .annotate(
            is_owner_priority=Case(
                When(workspace__owner=user, then=Value(0)),
                default=Value(1),
                output_field=IntegerField(),
            )
        )
        .order_by("is_owner_priority", "-workspace__is_default", "workspace__created_at")
    )
    ws_ids = [m.workspace_id for m in memberships]
    totals: dict[UUID, tuple[int, str]] = {}
    if ws_ids:
        agg_rows = (
            CollectionItem.objects.filter(
                workspace_id__in=ws_ids,
                status=CollectionItem.Status.IN_COLLECTION,
            )
            .values("workspace_id")
            .annotate(
                item_count=Count("id"),
                market=Sum(F("market_value_unit") * F("quantity")),
            )
        )
        for row in agg_rows:
            market_dec = (row["market"] or Decimal("0.00")).quantize(Decimal("0.01"))
            totals[row["workspace_id"]] = (int(row["item_count"] or 0), str(market_dec))

    return [
        _serialize_workspace(
            m.workspace,
            item_count=totals.get(m.workspace_id, (0, "0.00"))[0],
            market_value=totals.get(m.workspace_id, (0, "0.00"))[1],
            role=(
                WorkspaceMembership.Role.OWNER
                if m.workspace.owner_id == user.id
                else m.role
            ),
            user=user,
        )
        for m in memberships
    ]


def _serialize_user(user: User, workspace=None) -> UserOut:
    ws = workspace or resolve_user_workspace(user)
    if ws is None:
        ws = create_default_workspace_for_user(user)
    all_workspaces = _list_user_workspaces(user)
    active_out = next(
        (w for w in all_workspaces if w.id == ws.id),
        _serialize_workspace(ws, user=user),
    )
    ent = get_user_entitlement_status(user)
    return UserOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        is_staff=user.is_staff,
        is_superuser=user.is_superuser,
        workspace=active_out,
        workspaces=all_workspaces,
        plan=PlanSummaryOut(
            tier=ent["tier"],
            name=ent["plan"]["name"],
            max_vaults=ent["max_vaults"],
            max_items=ent["max_items"],
            owned_vault_count=ent["owned_vault_count"],
            active_item_count=ent["active_item_count"],
            enforce_tiers=ent["enforce_tiers"],
            dedicated_server=bool(ent["plan"]["dedicated_server"]),
        ),
    )


@auth_router.post("/register", response={201: AuthResponse})
@transaction.atomic
def register(request, payload: RegisterIn):
    email = payload.email.strip().lower()
    if not email or "@" not in email:
        raise HttpError(400, "Valid email is required.")
    if len(payload.password) < 8:
        raise HttpError(400, "Password must be at least 8 characters.")
    if User.objects.filter(email=email).exists():
        raise HttpError(409, "An account with this email already exists.")

    user = User.objects.create_user(
        email=email,
        password=payload.password,
        display_name=payload.display_name.strip(),
    )
    workspace = create_default_workspace_for_user(user, name=payload.workspace_name)
    token = issue_access_token(user)
    return Status(201, AuthResponse(access_token=token, user=_serialize_user(user, workspace)))


@auth_router.post("/login", response=AuthResponse)
def login(request, payload: LoginIn):
    email = payload.email.strip().lower()
    user = authenticate(request, username=email, password=payload.password)
    if not user or not user.is_active:
        raise HttpError(401, "Invalid email or password.")
    token = issue_access_token(user)
    return AuthResponse(access_token=token, user=_serialize_user(user))


@auth_router.get("/me", response=UserOut, auth=WorkspaceAuth())
def me(request):
    return _serialize_user(request.user, request.workspace)


@auth_router.patch("/me", response=UserOut, auth=WorkspaceAuth())
def update_me(request, payload: MePatchIn):
    user = request.user
    user.display_name = payload.display_name.strip()[:120]
    user.save(update_fields=["display_name"])
    return _serialize_user(user, request.workspace)


@auth_router.post("/change-password", auth=WorkspaceAuth())
def change_password(request, payload: ChangePasswordIn):
    user = request.user
    if not user.check_password(payload.current_password):
        raise HttpError(400, "Current password is incorrect.")
    if len(payload.new_password) < 8:
        raise HttpError(400, "New password must be at least 8 characters.")
    user.set_password(payload.new_password)
    user.save(update_fields=["password"])
    return {"detail": "Password updated."}


@auth_router.delete("/me", response={204: None}, auth=WorkspaceAuth())
@transaction.atomic
def delete_me(request, payload: DeleteAccountIn):
    from apps.catalog.models import ItemPhoto

    user = request.user
    if not user.check_password(payload.password):
        raise HttpError(403, "Password verification failed.")

    owned_workspaces = list(Workspace.objects.filter(owner=user))
    media_cleanup: list[tuple[Any, str]] = []
    if owned_workspaces:
        for photo in ItemPhoto.objects.filter(workspace__in=owned_workspaces):
            if photo.image and photo.image.name:
                media_cleanup.append((photo.image.storage, photo.image.name))
            if photo.thumbnail and photo.thumbnail.name:
                media_cleanup.append((photo.thumbnail.storage, photo.thumbnail.name))
        Workspace.objects.filter(id__in=[ws.id for ws in owned_workspaces]).delete()

    user.delete()

    for storage, name in media_cleanup:
        try:
            storage.delete(name)
        except Exception as exc:
            logger.debug("Media cleanup failed for %s: %s", name, exc)

    return Status(204, None)


@auth_router.get("/workspaces", response=list[WorkspaceOut], auth=WorkspaceAuth())
def list_workspaces(request):
    return _list_user_workspaces(request.user)


@auth_router.post("/workspaces", response={201: WorkspaceOut}, auth=WorkspaceAuth())
@transaction.atomic
def create_workspace(request, payload: WorkspaceCreateIn):
    import uuid as _uuid

    assert_can_create_vault(request.user)
    name = (payload.name or "").strip()[:120]
    if not name:
        raise HttpError(400, "Vault name is required.")
    currency = (payload.default_currency or "USD").strip().upper()[:3] or "USD"
    description = (payload.description or "").strip()[:240]
    base_slug = slugify(name) or "vault"
    slug = f"{base_slug}-{str(_uuid.uuid4())[:6]}"
    ws = Workspace.objects.create(
        name=name,
        slug=slug,
        description=description,
        owner=request.user,
        default_currency=currency,
        auto_sort_enabled=payload.auto_sort_enabled,
        is_default=False,
    )
    WorkspaceMembership.objects.create(
        workspace=ws,
        user=request.user,
        role=WorkspaceMembership.Role.OWNER,
    )
    return Status(201, _serialize_workspace(ws, user=request.user))


def _get_owned_workspace(user: User, workspace_id: UUID) -> Workspace:
    ws = Workspace.objects.select_related("owner").filter(id=workspace_id).first()
    if ws is None:
        raise HttpError(404, "Vault not found.")
    if ws.owner_id != user.id:
        raise HttpError(403, "Only the vault owner can perform this action.")
    return ws


def _get_member_workspace(user: User, workspace_id: UUID) -> Workspace:
    ws = Workspace.objects.select_related("owner").filter(id=workspace_id).first()
    if ws is None:
        raise HttpError(404, "Vault not found.")
    if not WorkspaceMembership.objects.filter(workspace=ws, user=user).exists():
        raise HttpError(403, "You do not have access to this vault.")
    return ws


def _serialize_invite(inv: WorkspaceInvitation) -> WorkspaceInviteOut:
    return WorkspaceInviteOut(
        id=inv.id,
        workspace_id=inv.workspace_id,
        workspace_name=inv.workspace.name,
        email=inv.email,
        role=inv.role,
        status=inv.status,
        token=inv.token,
        invite_path=f"/invite/{inv.token}",
        invited_by_email=inv.invited_by.email,
        accepted_by_email=inv.accepted_by.email if inv.accepted_by_id else None,
        expires_at=inv.expires_at,
        is_expired=inv.is_expired,
        created_at=inv.created_at,
        responded_at=inv.responded_at,
    )


def _serialize_member(m: WorkspaceMembership, owner_id: UUID) -> WorkspaceMemberOut:
    is_owner = m.user_id == owner_id
    return WorkspaceMemberOut(
        id=m.id,
        user_id=m.user_id,
        email=m.user.email,
        display_name=m.user.display_name,
        role=WorkspaceMembership.Role.OWNER if is_owner else m.role,
        is_owner=is_owner,
        created_at=m.created_at,
    )


@auth_router.patch("/workspaces/{workspace_id}", response=WorkspaceOut, auth=WorkspaceAuth())
def update_workspace(request, workspace_id: UUID, payload: WorkspaceUpdateIn):
    ws = _get_owned_workspace(request.user, workspace_id)
    update_fields: list[str] = []
    if payload.name is not None:
        cleaned = payload.name.strip()[:120]
        if not cleaned:
            raise HttpError(400, "Vault name cannot be empty.")
        ws.name = cleaned
        update_fields.append("name")
    if payload.description is not None:
        ws.description = payload.description.strip()[:240]
        update_fields.append("description")
    if payload.default_currency is not None and payload.default_currency.strip():
        ws.default_currency = payload.default_currency.strip().upper()[:3]
        update_fields.append("default_currency")
    if payload.auto_sort_enabled is not None:
        ws.auto_sort_enabled = payload.auto_sort_enabled
        update_fields.append("auto_sort_enabled")
    if update_fields:
        ws.save(update_fields=update_fields)
    all_ws = _list_user_workspaces(request.user)
    return next((w for w in all_ws if w.id == ws.id), _serialize_workspace(ws))


@auth_router.post(
    "/workspaces/{workspace_id}/set-default",
    response=WorkspaceOut,
    auth=WorkspaceAuth(),
)
@transaction.atomic
def set_default_workspace(request, workspace_id: UUID):
    ws = _get_owned_workspace(request.user, workspace_id)
    Workspace.objects.filter(owner=request.user).update(is_default=False)
    ws.is_default = True
    ws.save(update_fields=["is_default"])
    all_ws = _list_user_workspaces(request.user)
    return next((w for w in all_ws if w.id == ws.id), _serialize_workspace(ws))


@auth_router.delete("/workspaces/{workspace_id}", response={204: None}, auth=WorkspaceAuth())
@transaction.atomic
def delete_workspace(request, workspace_id: UUID):
    from apps.catalog.models import ItemPhoto

    ws = _get_owned_workspace(request.user, workspace_id)
    owned_count = Workspace.objects.filter(owner=request.user).count()
    if owned_count <= 1:
        raise HttpError(400, "Cannot delete your last remaining vault.")

    if ws.is_default:
        new_default = (
            Workspace.objects.filter(owner=request.user)
            .exclude(id=ws.id)
            .order_by("created_at")
            .first()
        )
        if new_default is not None:
            new_default.is_default = True
            new_default.save(update_fields=["is_default"])
            existing_providers = set(
                ProviderCredential.objects.filter(workspace=new_default).values_list(
                    "provider", flat=True
                )
            )
            for cred in ProviderCredential.objects.filter(workspace=ws):
                if cred.provider not in existing_providers:
                    ProviderCredential.objects.create(
                        workspace=new_default,
                        provider=cred.provider,
                        encrypted_value=cred.encrypted_value,
                        masked_hint=cred.masked_hint,
                    )

    media_cleanup: list[tuple[Any, str]] = []
    for photo in ItemPhoto.objects.filter(workspace=ws):
        if photo.image and photo.image.name:
            media_cleanup.append((photo.image.storage, photo.image.name))
        if photo.thumbnail and photo.thumbnail.name:
            media_cleanup.append((photo.thumbnail.storage, photo.thumbnail.name))

    ws.delete()

    for storage, name in media_cleanup:
        try:
            storage.delete(name)
        except Exception as exc:
            logger.debug("Media cleanup failed for %s: %s", name, exc)

    return Status(204, None)


@auth_router.get(
    "/workspaces/{workspace_id}/invites",
    response=list[WorkspaceInviteOut],
    auth=WorkspaceAuth(),
)
def list_workspace_invites(request, workspace_id: UUID):
    ws = _get_owned_workspace(request.user, workspace_id)
    invites = (
        WorkspaceInvitation.objects.select_related(
            "workspace", "invited_by", "accepted_by"
        )
        .filter(workspace=ws)
        .order_by("-created_at")
    )
    return [_serialize_invite(inv) for inv in invites]


@auth_router.post(
    "/workspaces/{workspace_id}/invites",
    response={201: WorkspaceInviteOut},
    auth=WorkspaceAuth(),
)
@transaction.atomic
def create_workspace_invite(request, workspace_id: UUID, payload: WorkspaceInviteCreateIn):
    import re

    ws = _get_owned_workspace(request.user, workspace_id)
    email = (payload.email or "").strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HttpError(400, "A valid email address is required.")

    role = (payload.role or "").strip().upper()
    if role not in {WorkspaceInvitation.Role.EDITOR, WorkspaceInvitation.Role.VIEWER}:
        raise HttpError(400, "Invitation role must be EDITOR or VIEWER.")

    if email == ws.owner.email.lower():
        raise HttpError(400, "Cannot invite yourself to a vault you own.")

    if WorkspaceMembership.objects.filter(workspace=ws, user__email=email).exists():
        raise HttpError(409, "This user is already a member of this vault.")

    WorkspaceInvitation.objects.filter(
        workspace=ws,
        email=email,
        status=WorkspaceInvitation.Status.PENDING,
    ).update(
        status=WorkspaceInvitation.Status.REVOKED,
        responded_at=timezone.now(),
    )

    inv = WorkspaceInvitation.objects.create(
        workspace=ws,
        invited_by=request.user,
        email=email,
        role=role,
    )
    return Status(201, _serialize_invite(inv))


@auth_router.delete(
    "/workspaces/{workspace_id}/invites/{invite_id}",
    response={204: None},
    auth=WorkspaceAuth(),
)
def revoke_workspace_invite(request, workspace_id: UUID, invite_id: UUID):
    ws = _get_owned_workspace(request.user, workspace_id)
    inv = WorkspaceInvitation.objects.filter(workspace=ws, id=invite_id).first()
    if inv is None:
        raise HttpError(404, "Invitation not found.")
    if inv.status != WorkspaceInvitation.Status.PENDING:
        raise HttpError(400, "Only pending invitations can be revoked.")
    inv.status = WorkspaceInvitation.Status.REVOKED
    inv.responded_at = timezone.now()
    inv.save(update_fields=["status", "responded_at"])
    return Status(204, None)


@auth_router.get(
    "/workspaces/{workspace_id}/members",
    response=list[WorkspaceMemberOut],
    auth=WorkspaceAuth(),
)
def list_workspace_members(request, workspace_id: UUID):
    ws = _get_member_workspace(request.user, workspace_id)
    memberships = (
        WorkspaceMembership.objects.select_related("user")
        .filter(workspace=ws)
        .annotate(
            is_owner_priority=Case(
                When(user_id=ws.owner_id, then=Value(0)),
                default=Value(1),
                output_field=IntegerField(),
            )
        )
        .order_by("is_owner_priority", "created_at")
    )
    return [_serialize_member(m, ws.owner_id) for m in memberships]


@auth_router.patch(
    "/workspaces/{workspace_id}/members/{membership_id}",
    response=WorkspaceMemberOut,
    auth=WorkspaceAuth(),
)
def update_workspace_member(
    request, workspace_id: UUID, membership_id: UUID, payload: WorkspaceMemberPatchIn
):
    ws = _get_owned_workspace(request.user, workspace_id)
    role = (payload.role or "").strip().upper()
    if role not in {WorkspaceInvitation.Role.EDITOR, WorkspaceInvitation.Role.VIEWER}:
        raise HttpError(400, "Member role must be EDITOR or VIEWER.")

    membership = (
        WorkspaceMembership.objects.select_related("user")
        .filter(workspace=ws, id=membership_id)
        .first()
    )
    if membership is None:
        raise HttpError(404, "Vault member not found.")
    if membership.user_id == ws.owner_id:
        raise HttpError(400, "Cannot change the role of the vault owner.")

    membership.role = role
    membership.save(update_fields=["role"])
    return _serialize_member(membership, ws.owner_id)


@auth_router.delete(
    "/workspaces/{workspace_id}/members/{membership_id}",
    response={204: None},
    auth=WorkspaceAuth(),
)
def remove_workspace_member(request, workspace_id: UUID, membership_id: UUID):
    ws = _get_owned_workspace(request.user, workspace_id)
    membership = WorkspaceMembership.objects.filter(
        workspace=ws, id=membership_id
    ).first()
    if membership is None:
        raise HttpError(404, "Vault member not found.")
    if membership.user_id == ws.owner_id:
        raise HttpError(400, "Cannot remove the vault owner.")
    membership.delete()
    return Status(204, None)


@auth_router.post(
    "/workspaces/{workspace_id}/leave",
    response={204: None},
    auth=WorkspaceAuth(),
)
def leave_workspace(request, workspace_id: UUID):
    ws = Workspace.objects.filter(id=workspace_id).first()
    if ws is None:
        raise HttpError(404, "Vault not found.")
    if ws.owner_id == request.user.id:
        raise HttpError(400, "Vault owners cannot leave their own vault.")
    membership = WorkspaceMembership.objects.filter(
        workspace=ws, user=request.user
    ).first()
    if membership is None:
        raise HttpError(404, "You are not a member of this vault.")
    membership.delete()
    return Status(204, None)


@auth_router.get(
    "/invites/pending",
    response=list[WorkspaceInviteOut],
    auth=WorkspaceAuth(),
)
def list_pending_invites(request):
    invites = (
        WorkspaceInvitation.objects.select_related(
            "workspace", "workspace__owner", "invited_by", "accepted_by"
        )
        .filter(
            email=request.user.email.lower(),
            status=WorkspaceInvitation.Status.PENDING,
            expires_at__gt=timezone.now(),
        )
        .order_by("-created_at")
    )
    return [_serialize_invite(inv) for inv in invites]


@auth_router.get("/invites/{token}", response=InvitePreviewOut)
def preview_invite(request, token: str):
    inv = (
        WorkspaceInvitation.objects.select_related(
            "workspace", "workspace__owner", "invited_by"
        )
        .filter(token=token)
        .first()
    )
    if inv is None:
        raise HttpError(404, "Invitation not found.")
    return InvitePreviewOut(
        id=inv.id,
        workspace_id=inv.workspace_id,
        workspace_name=inv.workspace.name,
        owner_email=inv.workspace.owner.email,
        invited_by_email=inv.invited_by.email,
        email=inv.email,
        role=inv.role,
        status=inv.status,
        expires_at=inv.expires_at,
        is_expired=inv.is_expired,
    )


@auth_router.post("/invites/{token}/accept", response=WorkspaceOut, auth=WorkspaceAuth())
@transaction.atomic
def accept_invite(request, token: str):
    inv = (
        WorkspaceInvitation.objects.select_related(
            "workspace", "workspace__owner", "invited_by"
        )
        .filter(token=token)
        .first()
    )
    if inv is None:
        raise HttpError(404, "Invitation not found.")
    if inv.email.lower() != request.user.email.lower():
        raise HttpError(403, "This invitation is addressed to a different email address.")
    if inv.status == WorkspaceInvitation.Status.REVOKED:
        raise HttpError(410, "This invitation has been revoked.")
    if inv.status != WorkspaceInvitation.Status.PENDING:
        raise HttpError(400, f"Invitation is already {inv.status.lower()}.")
    if inv.is_expired:
        raise HttpError(410, "This invitation has expired.")
    if inv.workspace.owner_id == request.user.id:
        raise HttpError(400, "You already own this vault.")

    membership, created = WorkspaceMembership.objects.get_or_create(
        workspace=inv.workspace,
        user=request.user,
        defaults={"role": inv.role},
    )
    if not created and membership.role != inv.role:
        membership.role = inv.role
        membership.save(update_fields=["role"])

    inv.status = WorkspaceInvitation.Status.ACCEPTED
    inv.accepted_by = request.user
    inv.responded_at = timezone.now()
    inv.save(update_fields=["status", "accepted_by", "responded_at"])

    all_ws = _list_user_workspaces(request.user)
    return next(
        (w for w in all_ws if w.id == inv.workspace_id),
        _serialize_workspace(inv.workspace, role=membership.role, user=request.user),
    )


@auth_router.post("/invites/{token}/decline", response={204: None}, auth=WorkspaceAuth())
def decline_invite(request, token: str):
    inv = WorkspaceInvitation.objects.filter(token=token).first()
    if inv is None:
        raise HttpError(404, "Invitation not found.")
    if inv.email.lower() != request.user.email.lower():
        raise HttpError(403, "This invitation is addressed to a different email address.")
    if inv.status == WorkspaceInvitation.Status.REVOKED:
        raise HttpError(410, "This invitation has been revoked.")
    if inv.status != WorkspaceInvitation.Status.PENDING:
        raise HttpError(400, f"Invitation is already {inv.status.lower()}.")
    if inv.is_expired:
        raise HttpError(410, "This invitation has expired.")

    inv.status = WorkspaceInvitation.Status.DECLINED
    inv.responded_at = timezone.now()
    inv.save(update_fields=["status", "responded_at"])
    return Status(204, None)


@settings_router.get("/workspace", response=WorkspaceSettingsOut)
def get_workspace_settings(request):
    ws = request.workspace
    return WorkspaceSettingsOut(
        id=ws.id,
        name=ws.name,
        slug=ws.slug,
        description=ws.description,
        default_currency=ws.default_currency,
        auto_sort_enabled=ws.auto_sort_enabled,
        is_default=ws.is_default,
        role=request.workspace_role,
        is_shared=ws.owner_id != request.user.id,
        owner_email=ws.owner.email,
    )


@settings_router.patch("/workspace", response=WorkspaceSettingsOut)
def update_workspace_settings(request, payload: WorkspaceSettingsPatchIn):
    require_owner(request)
    ws = request.workspace
    update_fields: list[str] = []
    if payload.name is not None:
        cleaned_name = payload.name.strip()[:120]
        if not cleaned_name:
            raise HttpError(400, "Vault name cannot be empty.")
        ws.name = cleaned_name
        update_fields.append("name")
    if payload.description is not None:
        ws.description = payload.description.strip()[:240]
        update_fields.append("description")
    if payload.default_currency is not None and payload.default_currency.strip():
        ws.default_currency = payload.default_currency.strip().upper()[:3]
        update_fields.append("default_currency")
    if payload.auto_sort_enabled is not None:
        ws.auto_sort_enabled = payload.auto_sort_enabled
        update_fields.append("auto_sort_enabled")
    if update_fields:
        ws.save(update_fields=update_fields)
    return WorkspaceSettingsOut(
        id=ws.id,
        name=ws.name,
        slug=ws.slug,
        description=ws.description,
        default_currency=ws.default_currency,
        auto_sort_enabled=ws.auto_sort_enabled,
        is_default=ws.is_default,
        role=request.workspace_role,
        is_shared=ws.owner_id != request.user.id,
        owner_email=ws.owner.email,
    )


@settings_router.get("/credentials", response=list[CredentialOut])
def list_credentials(request):
    require_owner(request)
    local_creds = {
        c.provider: c
        for c in ProviderCredential.objects.filter(workspace=request.workspace)
    }
    default_ws = get_owner_default_workspace(request.workspace.owner)
    default_creds = (
        {c.provider: c for c in ProviderCredential.objects.filter(workspace=default_ws)}
        if default_ws is not None and default_ws.id != request.workspace.id
        else {}
    )
    results: list[CredentialOut] = []
    for provider_code, label in ProviderCredential.Provider.choices:
        local = local_creds.get(provider_code)
        if local is not None:
            results.append(
                CredentialOut(
                    provider=provider_code,
                    label=label,
                    is_configured=True,
                    masked_hint=local.masked_hint,
                    updated_at=local.updated_at,
                    is_inherited=False,
                    inherited_from_workspace_name=None,
                )
            )
            continue
        inherited = default_creds.get(provider_code)
        if inherited is not None and default_ws is not None:
            results.append(
                CredentialOut(
                    provider=provider_code,
                    label=label,
                    is_configured=True,
                    masked_hint=inherited.masked_hint,
                    updated_at=inherited.updated_at,
                    is_inherited=True,
                    inherited_from_workspace_name=default_ws.name,
                )
            )
            continue
        results.append(
            CredentialOut(
                provider=provider_code,
                label=label,
                is_configured=False,
                masked_hint="",
                updated_at=None,
                is_inherited=False,
                inherited_from_workspace_name=None,
            )
        )
    return results


@settings_router.put("/credentials/{provider}", response=CredentialOut)
def upsert_credential(request, provider: str, payload: CredentialIn):
    require_owner(request)
    valid_providers = dict(ProviderCredential.Provider.choices)
    if provider not in valid_providers:
        raise HttpError(400, f"Unsupported provider: {provider}")
    secret_value = payload.value.strip()
    if not secret_value:
        raise HttpError(400, "Credential value cannot be empty.")

    cred, _ = ProviderCredential.objects.get_or_create(
        workspace=request.workspace,
        provider=provider,
        defaults={"encrypted_value": ""},
    )
    cred.set_secret(secret_value)
    cred.save()
    return CredentialOut(
        provider=cred.provider,
        label=valid_providers[cred.provider],
        is_configured=True,
        masked_hint=cred.masked_hint,
        updated_at=cred.updated_at,
    )


@settings_router.delete("/credentials/{provider}", response={204: None})
def delete_credential(request, provider: str):
    require_owner(request)
    if provider not in dict(ProviderCredential.Provider.choices):
        raise HttpError(400, f"Unsupported provider: {provider}")
    ProviderCredential.objects.filter(
        workspace=request.workspace,
        provider=provider,
    ).delete()
    return Status(204, None)

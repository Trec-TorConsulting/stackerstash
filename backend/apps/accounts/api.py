from datetime import datetime
from typing import Any
from uuid import UUID

from django.contrib.auth import authenticate
from django.db import transaction
from django.db.models import Count, F, Sum
from django.utils.text import slugify
from ninja import Router, Schema, Status
from ninja.errors import HttpError

from .auth import WorkspaceAuth, issue_access_token, resolve_user_workspace
from .models import (
    ProviderCredential,
    User,
    Workspace,
    WorkspaceMembership,
    create_default_workspace_for_user,
    get_owner_default_workspace,
)

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


class WorkspaceSettingsPatchIn(Schema):
    name: str | None = None
    description: str | None = None
    default_currency: str | None = None
    auto_sort_enabled: bool | None = None


class UserOut(Schema):
    id: UUID
    email: str
    display_name: str
    is_staff: bool
    is_superuser: bool
    workspace: WorkspaceOut
    workspaces: list[WorkspaceOut] = []


class AuthResponse(Schema):
    access_token: str
    token_type: str = "bearer"
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


def _serialize_workspace(
    ws: Workspace, item_count: int = 0, market_value: str = "0.00"
) -> WorkspaceOut:
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
    )


def _list_user_workspaces(user: User) -> list[WorkspaceOut]:
    from decimal import Decimal

    from apps.catalog.models import CollectionItem

    memberships = list(
        WorkspaceMembership.objects.select_related("workspace")
        .filter(user=user)
        .order_by("-workspace__is_default", "workspace__created_at")
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
        )
        for m in memberships
    ]


def _serialize_user(user: User, workspace=None) -> UserOut:
    ws = workspace or resolve_user_workspace(user)
    if ws is None:
        ws = create_default_workspace_for_user(user)
    all_workspaces = _list_user_workspaces(user)
    active_out = next((w for w in all_workspaces if w.id == ws.id), _serialize_workspace(ws))
    return UserOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        is_staff=user.is_staff,
        is_superuser=user.is_superuser,
        workspace=active_out,
        workspaces=all_workspaces,
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
        except Exception:
            pass

    return Status(204, None)


@auth_router.get("/workspaces", response=list[WorkspaceOut], auth=WorkspaceAuth())
def list_workspaces(request):
    return _list_user_workspaces(request.user)


@auth_router.post("/workspaces", response={201: WorkspaceOut}, auth=WorkspaceAuth())
@transaction.atomic
def create_workspace(request, payload: WorkspaceCreateIn):
    import uuid as _uuid

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
    return Status(201, _serialize_workspace(ws))


def _get_owned_workspace(user: User, workspace_id: UUID) -> Workspace:
    ws = Workspace.objects.filter(id=workspace_id).first()
    if ws is None:
        raise HttpError(404, "Vault not found.")
    if ws.owner_id != user.id:
        raise HttpError(403, "Only the vault owner can perform this action.")
    return ws


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
        except Exception:
            pass

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
    )


@settings_router.patch("/workspace", response=WorkspaceSettingsOut)
def update_workspace_settings(request, payload: WorkspaceSettingsPatchIn):
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
    )


@settings_router.get("/credentials", response=list[CredentialOut])
def list_credentials(request):
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
    if provider not in dict(ProviderCredential.Provider.choices):
        raise HttpError(400, f"Unsupported provider: {provider}")
    ProviderCredential.objects.filter(
        workspace=request.workspace,
        provider=provider,
    ).delete()
    return Status(204, None)

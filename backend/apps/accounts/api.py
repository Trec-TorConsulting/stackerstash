from datetime import datetime
from uuid import UUID

from django.contrib.auth import authenticate
from django.db import transaction
from ninja import Router, Schema
from ninja.errors import HttpError

from .auth import WorkspaceAuth, issue_access_token, resolve_user_workspace
from .models import ProviderCredential, User, create_default_workspace_for_user

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
    default_currency: str


class UserOut(Schema):
    id: UUID
    email: str
    display_name: str
    is_staff: bool
    workspace: WorkspaceOut


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


class CredentialIn(Schema):
    value: str


def _serialize_user(user: User, workspace=None) -> UserOut:
    ws = workspace or resolve_user_workspace(user)
    if ws is None:
        ws = create_default_workspace_for_user(user)
    return UserOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        is_staff=user.is_staff,
        workspace=WorkspaceOut(
            id=ws.id,
            name=ws.name,
            slug=ws.slug,
            default_currency=ws.default_currency,
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
    return 201, AuthResponse(access_token=token, user=_serialize_user(user, workspace))


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


@settings_router.get("/credentials", response=list[CredentialOut])
def list_credentials(request):
    existing = {
        c.provider: c
        for c in ProviderCredential.objects.filter(workspace=request.workspace)
    }
    results: list[CredentialOut] = []
    for provider_code, label in ProviderCredential.Provider.choices:
        cred = existing.get(provider_code)
        results.append(
            CredentialOut(
                provider=provider_code,
                label=label,
                is_configured=cred is not None,
                masked_hint=cred.masked_hint if cred else "",
                updated_at=cred.updated_at if cred else None,
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
    return 204, None

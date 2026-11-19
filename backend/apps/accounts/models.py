from __future__ import annotations

import secrets
import uuid
from datetime import timedelta

from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.utils import timezone
from django.utils.text import slugify

from .crypto import decrypt_secret, encrypt_secret, mask_secret


class UserManager(BaseUserManager["User"]):
    """Custom manager for email-based User accounts."""

    use_in_migrations = True

    def _create_user(self, email: str, password: str | None, **extra_fields) -> User:
        if not email:
            raise ValueError("An email address is required.")
        normalized_email = self.normalize_email(email).lower()
        user = self.model(email=normalized_email, username=normalized_email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email: str, password: str | None = None, **extra_fields) -> User:
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email: str, password: str | None = None, **extra_fields) -> User:
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self._create_user(email, password, **extra_fields)


class User(AbstractUser):
    """Email-authenticated user model."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    display_name = models.CharField(max_length=120, blank=True, default="")

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    objects = UserManager()

    def __str__(self) -> str:
        return self.email


class Workspace(models.Model):
    """Tenant isolation boundary for a collector or household/team stack."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True)
    description = models.CharField(max_length=240, blank=True, default="")
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="owned_workspaces"
    )
    default_currency = models.CharField(max_length=3, default="USD")
    auto_sort_enabled = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-is_default", "created_at"]

    def __str__(self) -> str:
        return f"{self.name} ({self.slug})"


class WorkspaceMembership(models.Model):
    """Maps users to workspaces with role-based access."""

    class Role(models.TextChoices):
        OWNER = "OWNER", "Owner"
        EDITOR = "EDITOR", "Editor"
        VIEWER = "VIEWER", "Viewer"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="memberships"
    )
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="workspace_memberships"
    )
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.OWNER)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("workspace", "user")

    def __str__(self) -> str:
        return f"{self.user.email} -> {self.workspace.slug} ({self.role})"


def _default_invitation_token() -> str:
    return secrets.token_urlsafe(32)


def _default_invitation_expiry():
    return timezone.now() + timedelta(days=14)


class WorkspaceInvitation(models.Model):
    """Email-targeted invitation granting Editor or Viewer access to a shared vault."""

    class Role(models.TextChoices):
        EDITOR = "EDITOR", "Editor"
        VIEWER = "VIEWER", "Viewer"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACCEPTED = "ACCEPTED", "Accepted"
        DECLINED = "DECLINED", "Declined"
        REVOKED = "REVOKED", "Revoked"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="invitations"
    )
    invited_by = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="sent_workspace_invitations"
    )
    email = models.EmailField()
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.VIEWER)
    token = models.CharField(
        max_length=128, unique=True, default=_default_invitation_token
    )
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.PENDING
    )
    expires_at = models.DateTimeField(default=_default_invitation_expiry)
    accepted_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="accepted_workspace_invitations",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=("email", "status")),
            models.Index(fields=("workspace", "status")),
        ]
        ordering = ("-created_at",)

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    def save(self, *args, **kwargs) -> None:
        self.email = (self.email or "").strip().lower()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.email} -> {self.workspace.slug} ({self.role}, {self.status})"


class ProviderCredential(models.Model):
    """Encrypted BYOK credentials for external AI and valuation providers."""

    class Provider(models.TextChoices):
        GEMINI = "GEMINI", "Google Gemini API"
        GROQ_API_KEY = "GROQ_API_KEY", "Groq API Key (Free Tier)"
        OPENROUTER_API_KEY = "OPENROUTER_API_KEY", "OpenRouter API Key (Free Models)"
        PCGS = "PCGS", "PCGS API Token"
        GREYSHEET_KEY = "GREYSHEET_KEY", "Greysheet API Key"
        GREYSHEET_TOKEN = "GREYSHEET_TOKEN", "Greysheet API Token"
        NUMISTA_KEY = "NUMISTA_KEY", "Numista API Key"
        NUMISMEDIA_KEY = "NUMISMEDIA_KEY", "NumisMedia FMV API Key"
        EBAY_CLIENT_ID = "EBAY_CLIENT_ID", "eBay App Client ID"
        EBAY_CLIENT_SECRET = "EBAY_CLIENT_SECRET", "eBay App Client Secret"
        PRICECHARTING_API_KEY = "PRICECHARTING_API_KEY", "PriceCharting API Key"
        PSA_API_TOKEN = "PSA_API_TOKEN", "PSA Cert API Token"
        POKEMON_TCG_API_KEY = "POKEMON_TCG_API_KEY", "Pokémon TCG API Key"
        TCGPLAYER_CLIENT_ID = "TCGPLAYER_CLIENT_ID", "TCGplayer API Client ID"
        TCGPLAYER_CLIENT_SECRET = "TCGPLAYER_CLIENT_SECRET", "TCGplayer API Client Secret"
        COLLECTR_API_KEY = "COLLECTR_API_KEY", "Collectr API Key"
        OLLAMA_URL = "OLLAMA_URL", "Self-Hosted Ollama URL"
        OLLAMA_MODEL = "OLLAMA_MODEL", "Self-Hosted Ollama Vision Model"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="provider_credentials"
    )
    provider = models.CharField(max_length=32, choices=Provider.choices)
    encrypted_value = models.TextField()
    masked_hint = models.CharField(max_length=32, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("workspace", "provider")

    def set_secret(self, plaintext: str) -> None:
        self.encrypted_value = encrypt_secret(plaintext)
        if self.provider in {self.Provider.OLLAMA_URL, self.Provider.OLLAMA_MODEL}:
            self.masked_hint = plaintext[:32]
        else:
            self.masked_hint = mask_secret(plaintext)

    def get_secret(self) -> str:
        return decrypt_secret(self.encrypted_value)

    def __str__(self) -> str:
        return f"{self.workspace.slug}:{self.provider}"


def get_owner_default_workspace(user: User) -> Workspace | None:
    """Return the user's designated default owned workspace, falling back to earliest."""
    return (
        Workspace.objects.filter(owner=user)
        .order_by("-is_default", "created_at")
        .first()
    )


def resolve_workspace_credential(
    workspace: Workspace, provider: str
) -> tuple[ProviderCredential | None, bool]:
    """
    Resolve a BYOK credential for ``workspace`` checking vault-level overrides first
    and falling back to the vault owner's default vault credential.

    Returns ``(credential_or_none, is_inherited)``.
    """
    override = ProviderCredential.objects.filter(
        workspace=workspace, provider=provider
    ).first()
    if override is not None:
        return override, False

    default_ws = get_owner_default_workspace(workspace.owner)
    if default_ws is not None and default_ws.id != workspace.id:
        inherited = ProviderCredential.objects.filter(
            workspace=default_ws, provider=provider
        ).first()
        if inherited is not None:
            return inherited, True

    return None, False


def resolve_workspace_secret(workspace: Workspace, provider: str) -> str:
    """Decrypt a provider credential using vault-override -> owner-default inheritance."""
    cred, _ = resolve_workspace_credential(workspace, provider)
    return cred.get_secret() if cred is not None else ""


def create_default_workspace_for_user(
    user: User, name: str | None = None, description: str = ""
) -> Workspace:
    """Create a default workspace and owner membership for a newly registered user."""
    base_name = name or (user.display_name or user.email.split("@")[0])
    ws_name = f"{base_name}'s Vault" if not name else name.strip()[:120]
    base_slug = slugify(base_name) or "vault"
    slug = f"{base_slug}-{str(uuid.uuid4())[:6]}"
    has_default = Workspace.objects.filter(owner=user, is_default=True).exists()
    workspace = Workspace.objects.create(
        name=ws_name,
        slug=slug,
        description=(description or "").strip()[:240],
        owner=user,
        is_default=not has_default,
    )
    WorkspaceMembership.objects.create(
        workspace=workspace,
        user=user,
        role=WorkspaceMembership.Role.OWNER,
    )
    return workspace


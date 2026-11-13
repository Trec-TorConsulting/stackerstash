from __future__ import annotations

import uuid

from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
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
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="owned_workspaces"
    )
    default_currency = models.CharField(max_length=3, default="USD")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

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


class ProviderCredential(models.Model):
    """Encrypted BYOK credentials for external AI and valuation providers."""

    class Provider(models.TextChoices):
        GEMINI = "GEMINI", "Google Gemini API"
        PCGS = "PCGS", "PCGS API Token"
        GREYSHEET_KEY = "GREYSHEET_KEY", "Greysheet API Key"
        GREYSHEET_TOKEN = "GREYSHEET_TOKEN", "Greysheet API Token"
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


def create_default_workspace_for_user(user: User, name: str | None = None) -> Workspace:
    """Create a default workspace and owner membership for a newly registered user."""
    base_name = name or (user.display_name or user.email.split("@")[0])
    ws_name = f"{base_name}'s Vault"
    base_slug = slugify(base_name) or "vault"
    slug = f"{base_slug}-{str(uuid.uuid4())[:6]}"
    workspace = Workspace.objects.create(name=ws_name, slug=slug, owner=user)
    WorkspaceMembership.objects.create(
        workspace=workspace,
        user=user,
        role=WorkspaceMembership.Role.OWNER,
    )
    return workspace


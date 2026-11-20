from __future__ import annotations

import ipaddress
import secrets
import uuid
from datetime import timedelta
from typing import Any
from urllib.parse import urlparse

from django.conf import settings
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
    media_key_version = models.PositiveIntegerField(default=1)
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


_BLOCKED_OLLAMA_HOST_SUFFIXES = (
    ".svc",
    ".cluster.local",
    ".internal",
    ".amazonaws.com",
    ".metadata",
)
_BLOCKED_OLLAMA_EXACT_HOSTS = {
    "169.254.169.254",
    "100.100.100.200",
    "metadata.google.internal",
    "metadata",
    "kubernetes",
    "kubernetes.default",
    "postgres",
    "postgresql",
    "redis",
    "stackerstash-backend",
    "stackerstash-frontend",
    "stackerstash-redis",
}


def validate_ollama_url(raw_url: str) -> str:
    """Validate an OLLAMA_URL credential against SSRF, cloud metadata, and internal cluster services."""
    cleaned = (raw_url or "").strip().rstrip("/")
    parsed = urlparse(cleaned)
    scheme = (parsed.scheme or "").lower()
    if scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("OLLAMA_URL must be a valid http:// or https:// URL.")
    if parsed.username or parsed.password:
        raise ValueError("OLLAMA_URL must not contain embedded credentials.")

    hostname = parsed.hostname.strip().lower()

    # Always block cloud metadata endpoints
    if (
        hostname in {"169.254.169.254", "100.100.100.200", "metadata.google.internal", "metadata"}
        or hostname.endswith(".metadata")
    ):
        raise ValueError(f"Blocked internal or metadata host for OLLAMA_URL: {hostname}")

    allowed_hosts = {
        h.strip().lower()
        for h in getattr(
            settings,
            "OLLAMA_ALLOWED_HOSTS",
            ["ollama.local", "localhost", "127.0.0.1", "ollama.ollama.svc.cluster.local"],
        )
        if h.strip()
    }

    # If the host is explicitly allowlisted by cluster operator or settings, permit it
    if hostname in allowed_hosts:
        return cleaned

    if hostname in _BLOCKED_OLLAMA_EXACT_HOSTS or hostname.endswith(_BLOCKED_OLLAMA_HOST_SUFFIXES):
        raise ValueError(f"Blocked internal or metadata host for OLLAMA_URL: {hostname}")
    try:
        ip = ipaddress.ip_address(hostname.split("%", 1)[0])
    except ValueError:
        ip = None

    if ip is not None:
        if ip.is_link_local or ip.is_multicast or ip.is_unspecified or ip.is_reserved:
            raise ValueError(f"Blocked non-routable IP address for OLLAMA_URL: {hostname}")
        if (ip.is_private or ip.is_loopback) and hostname not in allowed_hosts:
            raise ValueError(f"Private or loopback IP for OLLAMA_URL is not allowlisted: {hostname}")
    elif hostname in {"localhost", "localhost.localdomain"} or hostname.endswith((".localhost", ".local")):
        if hostname not in allowed_hosts:
            raise ValueError(f"Local hostname for OLLAMA_URL is not allowlisted: {hostname}")

    return cleaned


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


class PlanTier(models.TextChoices):
    """Supported subscription tiers."""

    FREE = "FREE", "Free"
    PLUS = "PLUS", "Plus ($9.99/mo)"
    UNLIMITED = "UNLIMITED", "Unlimited ($19.99/mo)"
    DEDICATED = "DEDICATED", "Dedicated Server ($99.99/mo)"


PLAN_CATALOG: dict[str, dict[str, Any]] = {
    PlanTier.FREE: {
        "tier": PlanTier.FREE,
        "name": "Collector Vault (Free)",
        "monthly_price_cents": 0,
        "price_display": "Free",
        "max_vaults": 1,
        "max_items": 100,
        "dedicated_server": False,
        "summary": "1 Vault / 100 Items",
    },
    PlanTier.PLUS: {
        "tier": PlanTier.PLUS,
        "name": "Plus",
        "monthly_price_cents": 999,
        "price_display": "$9.99/mo",
        "max_vaults": 10,
        "max_items": None,
        "dedicated_server": False,
        "summary": "10 Vaults / Unlimited Items",
    },
    PlanTier.UNLIMITED: {
        "tier": PlanTier.UNLIMITED,
        "name": "Unlimited",
        "monthly_price_cents": 1999,
        "price_display": "$19.99/mo",
        "max_vaults": None,
        "max_items": None,
        "dedicated_server": False,
        "summary": "Unlimited Vaults / Unlimited Items",
    },
    PlanTier.DEDICATED: {
        "tier": PlanTier.DEDICATED,
        "name": "Dedicated Server",
        "monthly_price_cents": 9999,
        "price_display": "$99.99/mo",
        "max_vaults": None,
        "max_items": None,
        "dedicated_server": True,
        "summary": "Dedicated Servers with Unlimited Vaults / Unlimited Items",
    },
}


class AccountSubscription(models.Model):
    """Stores the subscription tier, Stripe billing linkage, and admin overrides per User."""

    class Source(models.TextChoices):
        DEFAULT = "DEFAULT", "Default Free"
        STRIPE = "STRIPE", "Stripe Subscription"
        ADMIN_OVERRIDE = "ADMIN_OVERRIDE", "Global Admin Override"

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        TRIALING = "TRIALING", "Trialing"
        PAST_DUE = "PAST_DUE", "Past Due"
        CANCELED = "CANCELED", "Canceled"
        INCOMPLETE = "INCOMPLETE", "Incomplete"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="subscription"
    )
    tier = models.CharField(
        max_length=16, choices=PlanTier.choices, default=PlanTier.FREE
    )
    source = models.CharField(
        max_length=24, choices=Source.choices, default=Source.DEFAULT
    )
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.ACTIVE
    )
    stripe_customer_id = models.CharField(max_length=128, blank=True, default="")
    stripe_subscription_id = models.CharField(max_length=128, blank=True, default="")
    stripe_price_id = models.CharField(max_length=128, blank=True, default="")
    current_period_end = models.DateTimeField(null=True, blank=True)
    cancel_at_period_end = models.BooleanField(default=False)
    admin_notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.user.email}: {self.tier} ({self.source}/{self.status})"


class DedicatedServerInstance(models.Model):
    """Tracks provisioning state and host URL for $99.99 Dedicated Server accounts."""

    class Status(models.TextChoices):
        REQUESTED = "REQUESTED", "Requested"
        PROVISIONING = "PROVISIONING", "Provisioning"
        ACTIVE = "ACTIVE", "Active"
        SUSPENDED = "SUSPENDED", "Suspended"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="dedicated_instance"
    )
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.REQUESTED
    )
    requested_subdomain = models.CharField(max_length=80, blank=True, default="")
    dedicated_url = models.URLField(blank=True, default="")
    admin_notes = models.TextField(blank=True, default="")
    provisioned_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.user.email}: {self.status} ({self.dedicated_url or 'pending'})"


class PlanLimitExceeded(Exception):
    """Raised when an account exceeds its active tier vault or item quota."""

    def __init__(
        self,
        *,
        detail: str,
        limit_type: str,
        current_usage: int,
        limit: int,
        current_tier: str,
    ) -> None:
        super().__init__(detail)
        self.detail = detail
        self.limit_type = limit_type
        self.current_usage = current_usage
        self.limit = limit
        self.current_tier = current_tier


def get_or_create_subscription(user: User) -> AccountSubscription:
    """Lazy-create or return the user's AccountSubscription defaulting to FREE."""
    sub, _ = AccountSubscription.objects.get_or_create(user=user)
    return sub


def ensure_dedicated_instance(
    user: User, requested_subdomain: str = ""
) -> DedicatedServerInstance:
    """Create or update a DedicatedServerInstance tracking record when DEDICATED activates."""
    cleaned_sub = (requested_subdomain or "").strip()[:80]
    inst, created = DedicatedServerInstance.objects.get_or_create(
        user=user,
        defaults={"requested_subdomain": cleaned_sub},
    )
    if not created and cleaned_sub and not inst.requested_subdomain:
        inst.requested_subdomain = cleaned_sub
        inst.save(update_fields=["requested_subdomain", "updated_at"])
    return inst


def _resolve_effective_tier(sub: AccountSubscription) -> str:
    if sub.source == AccountSubscription.Source.ADMIN_OVERRIDE:
        return sub.tier
    if sub.tier == PlanTier.FREE:
        return PlanTier.FREE
    if sub.status in {
        AccountSubscription.Status.ACTIVE,
        AccountSubscription.Status.TRIALING,
    }:
        return sub.tier
    return PlanTier.FREE


def get_user_usage_counts(user: User) -> tuple[int, int]:
    """Return `(owned_vault_count, active_item_count)` across vaults owned by `user`."""
    from apps.catalog.models import CollectionItem

    owned_vaults = Workspace.objects.filter(owner=user).count()
    active_items = (
        CollectionItem.objects.filter(workspace__owner=user)
        .exclude(status=CollectionItem.Status.SOLD)
        .count()
    )
    return owned_vaults, active_items


def get_user_entitlement_status(user: User) -> dict[str, Any]:
    """Evaluate active tier limits, enforcement toggle, usage counts, and dedicated server info."""
    enforce = bool(getattr(settings, "BILLING_ENFORCE_TIERS", True))
    sub = get_or_create_subscription(user)
    effective_tier = _resolve_effective_tier(sub)
    plan = PLAN_CATALOG.get(effective_tier, PLAN_CATALOG[PlanTier.FREE])
    owned_vault_count, active_item_count = get_user_usage_counts(user)
    dedicated = DedicatedServerInstance.objects.filter(user=user).first()
    return {
        "tier": effective_tier,
        "plan": plan,
        "source": sub.source,
        "status": sub.status,
        "enforce_tiers": enforce,
        "max_vaults": plan["max_vaults"] if enforce else None,
        "max_items": plan["max_items"] if enforce else None,
        "owned_vault_count": owned_vault_count,
        "active_item_count": active_item_count,
        "cancel_at_period_end": sub.cancel_at_period_end,
        "current_period_end": sub.current_period_end,
        "has_stripe_customer": bool(sub.stripe_customer_id),
        "dedicated_instance": dedicated,
    }


def get_remaining_active_item_slots(user: User) -> int | None:
    """Return remaining non-SOLD catalog item slots for `user`, or None when unlimited."""
    ent = get_user_entitlement_status(user)
    if not ent["enforce_tiers"] or ent["max_items"] is None:
        return None
    return max(0, int(ent["max_items"]) - int(ent["active_item_count"]))


def assert_can_create_vault(user: User, adding: int = 1) -> None:
    """Raise `PlanLimitExceeded` if creating another owned vault exceeds the user's tier."""
    if adding <= 0:
        return
    ent = get_user_entitlement_status(user)
    if not ent["enforce_tiers"] or ent["max_vaults"] is None:
        return
    if ent["owned_vault_count"] + adding > ent["max_vaults"]:
        raise PlanLimitExceeded(
            detail=(
                f"Your {ent['plan']['name']} plan includes up to "
                f"{ent['max_vaults']} owned vault(s). Upgrade your plan to add more vaults."
            ),
            limit_type="vaults",
            current_usage=ent["owned_vault_count"],
            limit=ent["max_vaults"],
            current_tier=ent["tier"],
        )


def assert_can_add_active_items(user: User, adding: int = 1) -> None:
    """Raise `PlanLimitExceeded` if adding non-SOLD catalog items exceeds `user`'s tier."""
    if adding <= 0:
        return
    ent = get_user_entitlement_status(user)
    if not ent["enforce_tiers"] or ent["max_items"] is None:
        return
    if ent["active_item_count"] + adding > ent["max_items"]:
        raise PlanLimitExceeded(
            detail=(
                f"Your {ent['plan']['name']} plan includes up to "
                f"{ent['max_items']} active items across your vaults. "
                "Upgrade your plan or mark sold items as Sold to add more."
            ),
            limit_type="items",
            current_usage=ent["active_item_count"],
            limit=ent["max_items"],
            current_tier=ent["tier"],
        )


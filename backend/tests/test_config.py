from __future__ import annotations

import importlib
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.http import Http404
from django.test import override_settings
from django.utils import timezone

from apps.accounts.auth import WorkspaceAuth, get_request_workspace_role, issue_access_token
from apps.accounts.crypto import decrypt_secret, mask_secret
from apps.accounts.models import (
    AccountSubscription,
    PlanTier,
    ProviderCredential,
    User,
    WorkspaceInvitation,
    WorkspaceMembership,
    _resolve_effective_tier,
    assert_can_add_active_items,
    assert_can_create_vault,
    create_default_workspace_for_user,
    ensure_dedicated_instance,
    get_remaining_active_item_slots,
)
from config import health
from config.media_signing import (
    MediaSignatureError,
    build_signed_media_url,
    verify_signed_media_path,
)


@pytest.mark.django_db
def test_health_error_and_unconfigured_redis(client):
    with patch("config.health.connection.cursor", side_effect=RuntimeError("db down")):
        ok, err = health.check_db_health()
        assert ok is False
        assert "db down" in (err or "")
        resp = client.get("/readyz")
        assert resp.status_code == 503
        assert resp.json()["status"] == "error"

    with override_settings(REDIS_URL=""):
        ok, err = health.check_redis_health()
        assert ok is False
        assert "REDIS_URL" in (err or "")


def test_media_signing_edge_cases(tmp_path):
    assert build_signed_media_url("") == ""

    with override_settings(MEDIA_ROOT=tmp_path):
        with pytest.raises(Http404):
            # rel_path begins with '/' even though outer path does not start with '/'
            verify_signed_media_path("s/9999999999/0123456789abcdef0123456789abcdef//etc/passwd")

        outside = tmp_path.parent / "outside-secret.txt"
        outside.write_text("secret")
        link_path = tmp_path / "escape.png"
        link_path.symlink_to(outside)
        signed = build_signed_media_url("escape.png")
        raw_signed = signed.split("/media/", 1)[1]
        with pytest.raises(Http404):
            verify_signed_media_path(raw_signed)

        with pytest.raises(MediaSignatureError):
            verify_signed_media_path("not-signed.png")


def test_settings_production_branches_and_database_url(monkeypatch):
    import config.settings as settings_mod

    try:
        monkeypatch.setenv("DJANGO_DEBUG", "false")
        monkeypatch.delenv("DJANGO_SECRET_KEY", raising=False)
        with pytest.raises(RuntimeError, match="DJANGO_SECRET_KEY"):
            importlib.reload(settings_mod)

        monkeypatch.setenv("DJANGO_SECRET_KEY", "test-prod-secret-key-not-for-prod-123456")
        monkeypatch.delenv("FIELD_ENCRYPTION_KEY", raising=False)
        with pytest.raises(RuntimeError, match="FIELD_ENCRYPTION_KEY"):
            importlib.reload(settings_mod)

        monkeypatch.setenv("FIELD_ENCRYPTION_KEY", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
        monkeypatch.setenv("DATABASE_URL", "postgres://stackuser:stackpass@dbhost:5433/stackdb")
        importlib.reload(settings_mod)
        assert settings_mod.DATABASES["default"]["ENGINE"] == "django.db.backends.postgresql"
        assert settings_mod.DATABASES["default"]["HOST"] == "dbhost"
        assert settings_mod.SESSION_COOKIE_SECURE is True

        monkeypatch.setenv("DATABASE_URL", "mysql://bad/db")
        with pytest.raises(ValueError, match="Unsupported DATABASE_URL scheme"):
            settings_mod._build_databases()
    finally:
        monkeypatch.setenv("DJANGO_DEBUG", "true")
        monkeypatch.delenv("DJANGO_SECRET_KEY", raising=False)
        monkeypatch.delenv("FIELD_ENCRYPTION_KEY", raising=False)
        monkeypatch.delenv("DATABASE_URL", raising=False)
        importlib.reload(settings_mod)


@pytest.mark.django_db
def test_crypto_auth_and_account_model_helpers():
    assert decrypt_secret("") == ""
    assert mask_secret("abcd") == "••••"
    assert mask_secret("sk-12345678") == "••••5678"

    with pytest.raises(ValueError, match="email address is required"):
        User.objects.create_user(email="")
    with pytest.raises(ValueError, match="is_staff=True"):
        User.objects.create_superuser(email="badstaff@example.com", password="pw", is_staff=False)
    with pytest.raises(ValueError, match="is_superuser=True"):
        User.objects.create_superuser(email="badsu@example.com", password="pw", is_superuser=False)

    owner = User.objects.create_user(email="owner-m@example.com", password="Password123!")
    editor = User.objects.create_user(email="editor-m@example.com", password="Password123!")
    stranger = User.objects.create_user(email="stranger-m@example.com", password="Password123!")
    ws = create_default_workspace_for_user(owner, name="Primary")
    membership = WorkspaceMembership.objects.create(
        workspace=ws, user=editor, role=WorkspaceMembership.Role.EDITOR
    )
    invite = WorkspaceInvitation.objects.create(
        workspace=ws,
        invited_by=owner,
        email="invitee@example.com",
        role=WorkspaceInvitation.Role.VIEWER,
        expires_at=timezone.now() + timedelta(days=3),
    )
    cred = ProviderCredential.objects.create(workspace=ws, provider=ProviderCredential.Provider.GEMINI)
    sub = AccountSubscription.objects.create(
        user=owner,
        tier=PlanTier.PLUS,
        source=AccountSubscription.Source.STRIPE,
        status=AccountSubscription.Status.CANCELED,
    )
    inst = ensure_dedicated_instance(owner, "")
    updated_inst = ensure_dedicated_instance(owner, "custom-node")

    assert str(owner) == "owner-m@example.com"
    assert "Primary (" in str(ws)
    assert "EDITOR" in str(membership)
    assert "invitee@example.com" in str(invite)
    assert "GEMINI" in str(cred)
    assert "PLUS" in str(sub)
    assert "pending" in str(inst)
    assert updated_inst.requested_subdomain == "custom-node"
    assert _resolve_effective_tier(sub) == PlanTier.FREE

    # Role lookup paths when request lacks cached workspace_role
    assert get_request_workspace_role(SimpleNamespace(workspace=ws, user=owner)) == "OWNER"
    assert get_request_workspace_role(SimpleNamespace(workspace=ws, user=editor)) == "EDITOR"
    assert get_request_workspace_role(SimpleNamespace(workspace=ws, user=stranger)) == "VIEWER"

    # WorkspaceAuth with a user belonging to no workspace returns None
    stranger_token = issue_access_token(stranger)
    assert WorkspaceAuth().authenticate(SimpleNamespace(headers={}), stranger_token) is None

    # No-op quota checks & unlimited slot checks
    assert_can_create_vault(owner, adding=0)
    assert_can_add_active_items(owner, adding=0)
    sub.tier = PlanTier.UNLIMITED
    sub.source = AccountSubscription.Source.ADMIN_OVERRIDE
    sub.save()
    assert get_remaining_active_item_slots(owner) is None

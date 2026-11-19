from __future__ import annotations

import json

import pytest

from apps.accounts.models import ProviderCredential


@pytest.mark.django_db
def test_register_login_and_me(api_client):
    resp = api_client.post(
        "/api/v1/auth/register",
        data=json.dumps({
            "email": "stacker@example.com",
            "password": "Password123!",
            "display_name": "Stacker",
        }),
        content_type="application/json",
    )
    assert resp.status_code == 201
    data = resp.json()
    token = data["access_token"]
    assert data["user"]["email"] == "stacker@example.com"
    assert "Stacker" in data["user"]["workspace"]["name"]

    # Login
    login_resp = api_client.post(
        "/api/v1/auth/login",
        data=json.dumps({"email": "stacker@example.com", "password": "Password123!"}),
        content_type="application/json",
    )
    assert login_resp.status_code == 200

    # Bad password -> 401
    bad_resp = api_client.post(
        "/api/v1/auth/login",
        data=json.dumps({"email": "stacker@example.com", "password": "WrongPassword"}),
        content_type="application/json",
    )
    assert bad_resp.status_code == 401

    # /me
    me_resp = api_client.get(
        "/api/v1/auth/me",
        HTTP_AUTHORIZATION=f"Bearer {token}",
    )
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == "stacker@example.com"


@pytest.mark.django_db
def test_byok_credential_encryption_and_masking(api_client, user_a):
    _, ws, token = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    put_resp = api_client.put(
        "/api/v1/settings/credentials/GEMINI",
        data=json.dumps({"value": "AIzaSySuperSecretKey1234"}),
        content_type="application/json",
        **headers,
    )
    assert put_resp.status_code == 200
    body = put_resp.json()
    assert body["is_configured"] is True
    assert body["masked_hint"] == "••••1234"
    assert "AIzaSy" not in json.dumps(body)

    cred = ProviderCredential.objects.get(workspace=ws, provider="GEMINI")
    assert cred.encrypted_value != "AIzaSySuperSecretKey1234"
    assert cred.get_secret() == "AIzaSySuperSecretKey1234"

    del_resp = api_client.delete("/api/v1/settings/credentials/GEMINI", **headers)
    assert del_resp.status_code == 204
    assert not ProviderCredential.objects.filter(workspace=ws, provider="GEMINI").exists()


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("provider", "secret_val", "expected_hint"),
    [
        ("GROQ_API_KEY", "gsk_supersecretgroqtoken9876", "••••9876"),
        ("OPENROUTER_API_KEY", "sk-or-v1-supersecretkey5432", "••••5432"),
    ],
)
def test_byok_free_backup_provider_credentials(api_client, user_a, provider, secret_val, expected_hint):
    _, ws, token = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    put_resp = api_client.put(
        f"/api/v1/settings/credentials/{provider}",
        data=json.dumps({"value": secret_val}),
        content_type="application/json",
        **headers,
    )
    assert put_resp.status_code == 200
    body = put_resp.json()
    assert body["is_configured"] is True
    assert body["masked_hint"] == expected_hint
    assert secret_val[:8] not in json.dumps(body)

    cred = ProviderCredential.objects.get(workspace=ws, provider=provider)
    assert cred.encrypted_value != secret_val
    assert cred.get_secret() == secret_val

    del_resp = api_client.delete(f"/api/v1/settings/credentials/{provider}", **headers)
    assert del_resp.status_code == 204
    assert not ProviderCredential.objects.filter(workspace=ws, provider=provider).exists()


@pytest.mark.django_db
def test_health_and_readiness_probes(api_client, settings, monkeypatch):
    import redis

    assert api_client.get("/healthz").status_code == 200
    assert api_client.get("/readyz").status_code == 200

    settings.READY_CHECK_REDIS = True

    class _DownRedis:
        def ping(self):
            raise ConnectionError("redis unreachable")

        def close(self):
            pass

    monkeypatch.setattr(redis, "from_url", lambda *args, **kwargs: _DownRedis())
    down_resp = api_client.get("/readyz")
    assert down_resp.status_code == 503
    assert "redis unreachable" in down_resp.json()["detail"]

    class _UpRedis:
        def ping(self):
            return True

        def close(self):
            pass

    monkeypatch.setattr(redis, "from_url", lambda *args, **kwargs: _UpRedis())
    assert api_client.get("/readyz").status_code == 200


@pytest.mark.django_db
def test_self_service_account_crud_and_deletion_cleanup(api_client, user_a):
    import io

    from django.core.files.uploadedfile import SimpleUploadedFile
    from PIL import Image

    from apps.accounts.models import User, Workspace
    from apps.catalog.models import CollectionItem, ItemPhoto

    user, ws, token = user_a
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    # 1. Update display_name
    patch_resp = api_client.patch(
        "/api/v1/auth/me",
        data=json.dumps({"display_name": "Alice Collector"}),
        content_type="application/json",
        **headers,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["display_name"] == "Alice Collector"

    # 2. Change password validation & update
    bad_pw = api_client.post(
        "/api/v1/auth/change-password",
        data=json.dumps({"current_password": "WrongPassword", "new_password": "NewPassword123!"}),
        content_type="application/json",
        **headers,
    )
    assert bad_pw.status_code == 400

    short_pw = api_client.post(
        "/api/v1/auth/change-password",
        data=json.dumps({"current_password": "StrongPassword123!", "new_password": "short"}),
        content_type="application/json",
        **headers,
    )
    assert short_pw.status_code == 400

    numeric_pw = api_client.post(
        "/api/v1/auth/change-password",
        data=json.dumps({"current_password": "StrongPassword123!", "new_password": "12345678"}),
        content_type="application/json",
        **headers,
    )
    assert numeric_pw.status_code == 400
    assert "numeric" in numeric_pw.json()["detail"].lower() or "common" in numeric_pw.json()["detail"].lower()

    common_reg = api_client.post(
        "/api/v1/auth/register",
        data=json.dumps({"email": "commonpw@example.com", "password": "password123"}),
        content_type="application/json",
    )
    assert common_reg.status_code == 400
    assert "common" in common_reg.json()["detail"].lower()

    numeric_reg = api_client.post(
        "/api/v1/auth/register",
        data=json.dumps({"email": "numpw@example.com", "password": "123456789"}),
        content_type="application/json",
    )
    assert numeric_reg.status_code == 400
    assert "numeric" in numeric_reg.json()["detail"].lower() or "common" in numeric_reg.json()["detail"].lower()

    good_pw = api_client.post(
        "/api/v1/auth/change-password",
        data=json.dumps({"current_password": "StrongPassword123!", "new_password": "NewPassword123!"}),
        content_type="application/json",
        **headers,
    )
    assert good_pw.status_code == 200
    assert api_client.get("/api/v1/auth/me", **headers).status_code == 401
    headers = {"HTTP_AUTHORIZATION": f"Bearer {good_pw.json()['access_token']}"}

    login_new = api_client.post(
        "/api/v1/auth/login",
        data=json.dumps({"email": user.email, "password": "NewPassword123!"}),
        content_type="application/json",
    )
    assert login_new.status_code == 200

    # 3. Upload a photo before deleting account so we verify media cleanup
    item = CollectionItem.objects.create(workspace=ws, title="Temp Coin", category="COIN")
    img = Image.new("RGB", (40, 40), color=(200, 180, 120))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    up = SimpleUploadedFile("temp.png", buf.getvalue(), content_type="image/png")
    p_resp = api_client.post(
        f"/api/v1/catalog/items/{item.id}/photos",
        data={"file": up, "label": "OBVERSE", "is_primary": "true"},
        **headers,
    )
    assert p_resp.status_code == 201
    photo = ItemPhoto.objects.get(item=item)
    storage = photo.image.storage
    img_name = photo.image.name
    thumb_name = photo.thumbnail.name
    assert storage.exists(img_name)

    # Wrong password rejected with 403
    bad_del = api_client.delete(
        "/api/v1/auth/me",
        data=json.dumps({"password": "WrongPassword"}),
        content_type="application/json",
        **headers,
    )
    assert bad_del.status_code == 403
    assert User.objects.filter(id=user.id).exists()

    # Correct password deletes user, workspace, and stored photo/thumbnail files on commit
    del_resp = api_client.delete(
        "/api/v1/auth/me",
        data=json.dumps({"password": "NewPassword123!"}),
        content_type="application/json",
        **headers,
    )
    assert del_resp.status_code == 204
    assert not User.objects.filter(id=user.id).exists()
    assert not Workspace.objects.filter(id=ws.id).exists()
    assert not storage.exists(img_name)
    if thumb_name:
        assert not storage.exists(thumb_name)


@pytest.mark.django_db
def test_multiple_vaults_crud_isolation_headers_and_byok_inheritance(api_client, user_a, user_b, monkeypatch):
    import io
    import uuid

    from django.core.files.uploadedfile import SimpleUploadedFile
    from PIL import Image

    from apps.accounts.models import (
        AccountSubscription,
        PlanTier,
        Workspace,
        resolve_workspace_credential,
        resolve_workspace_secret,
    )
    from apps.catalog.models import CollectionItem, ItemPhoto
    from apps.valuation.services import _get_workspace_secret
    from apps.valuation.tasks import process_deferred_ai_enrichment_task
    from apps.vision.services import _get_secret

    user, default_ws, token_a = user_a
    AccountSubscription.objects.update_or_create(
        user=user,
        defaults={
            "tier": PlanTier.PLUS,
            "source": AccountSubscription.Source.ADMIN_OVERRIDE,
            "status": AccountSubscription.Status.ACTIVE,
        },
    )
    _, bob_ws, _ = user_b
    headers_a = {"HTTP_AUTHORIZATION": f"Bearer {token_a}"}

    assert default_ws.is_default is True

    # 1. Cannot delete last remaining vault -> 400
    last_del = api_client.delete(f"/api/v1/auth/workspaces/{default_ws.id}", **headers_a)
    assert last_del.status_code == 400

    # 2. Malformed X-Workspace-Id -> 400; unauthorized/nonexistent UUID -> 403 (never 401/500)
    bad_hdr = api_client.get(
        "/api/v1/auth/me",
        HTTP_AUTHORIZATION=f"Bearer {token_a}",
        HTTP_X_WORKSPACE_ID="not-a-uuid",
    )
    assert bad_hdr.status_code == 400

    other_hdr = api_client.get(
        "/api/v1/auth/me",
        HTTP_AUTHORIZATION=f"Bearer {token_a}",
        HTTP_X_WORKSPACE_ID=str(bob_ws.id),
    )
    assert other_hdr.status_code == 403

    missing_hdr = api_client.get(
        "/api/v1/auth/me",
        HTTP_AUTHORIZATION=f"Bearer {token_a}",
        HTTP_X_WORKSPACE_ID=str(uuid.uuid4()),
    )
    assert missing_hdr.status_code == 403

    # 3. Create secondary vault; blank name rejected with 400
    blank_ws = api_client.post(
        "/api/v1/auth/workspaces",
        data=json.dumps({"name": "   "}),
        content_type="application/json",
        **headers_a,
    )
    assert blank_ws.status_code == 400

    create_resp = api_client.post(
        "/api/v1/auth/workspaces",
        data=json.dumps({
            "name": "IRA Bullion",
            "description": "Self-directed retirement gold",
            "default_currency": "USD",
            "auto_sort_enabled": False,
        }),
        content_type="application/json",
        **headers_a,
    )
    assert create_resp.status_code == 201
    ira_id = create_resp.json()["id"]
    assert create_resp.json()["is_default"] is False
    assert create_resp.json()["description"] == "Self-directed retirement gold"

    # Cross-user PATCH / set-default / DELETE rejected with 403
    assert (
        api_client.patch(
            f"/api/v1/auth/workspaces/{bob_ws.id}",
            data=json.dumps({"name": "Stolen"}),
            content_type="application/json",
            **headers_a,
        ).status_code
        == 403
    )
    assert api_client.post(f"/api/v1/auth/workspaces/{bob_ws.id}/set-default", **headers_a).status_code == 403
    assert api_client.delete(f"/api/v1/auth/workspaces/{bob_ws.id}", **headers_a).status_code == 403

    # 4. Tenant isolation & matching cert_number independence across Vault A vs Vault B
    headers_ira = {"HTTP_AUTHORIZATION": f"Bearer {token_a}", "HTTP_X_WORKSPACE_ID": ira_id}
    item_a = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps({
            "title": "Vault A Slab",
            "category": "SLAB",
            "grading_service": "PCGS",
            "cert_number": "11223344",
            "market_value_unit": "120.00",
        }),
        content_type="application/json",
        **headers_a,
    )
    assert item_a.status_code == 201

    assert api_client.get("/api/v1/catalog/items", **headers_ira).json() == []
    item_b = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps({
            "title": "IRA Vault Slab",
            "category": "SLAB",
            "grading_service": "PCGS",
            "cert_number": "11223344",
            "market_value_unit": "250.00",
        }),
        content_type="application/json",
        **headers_ira,
    )
    assert item_b.status_code == 201

    # List workspaces shows both vaults with counts and default ordered first
    list_ws = api_client.get("/api/v1/auth/workspaces", **headers_a).json()
    assert len(list_ws) == 2
    assert list_ws[0]["id"] == str(default_ws.id)
    assert list_ws[0]["is_default"] is True
    assert list_ws[0]["item_count"] == 1
    assert list_ws[1]["id"] == ira_id
    assert list_ws[1]["item_count"] == 1
    assert list_ws[1]["total_market_value"] == "250.00"

    # 5. BYOK Inheritance & Vault Override
    api_client.put(
        "/api/v1/settings/credentials/GEMINI",
        data=json.dumps({"value": "AIzaPrimaryKey9999"}),
        content_type="application/json",
        **headers_a,
    )
    ira_ws = Workspace.objects.get(id=ira_id)
    cred_obj, is_inherited = resolve_workspace_credential(ira_ws, "GEMINI")
    assert cred_obj is not None
    assert is_inherited is True
    assert resolve_workspace_secret(ira_ws, "GEMINI") == "AIzaPrimaryKey9999"
    assert _get_workspace_secret(ira_ws, "GEMINI") == "AIzaPrimaryKey9999"
    assert _get_secret(ira_ws, "GEMINI") == "AIzaPrimaryKey9999"

    # Deferred AI enrichment task recognizes inherited GEMINI key on secondary vault
    deferred_item = CollectionItem.objects.create(
        workspace=ira_ws,
        title="Deferred Coin",
        ai_enrichment_pending=True,
    )
    seen_ids: list[str] = []

    def _fake_appraise(it, _ws):
        seen_ids.append(str(it.id))
        it.ai_enrichment_pending = False
        it.save(update_fields=["ai_enrichment_pending"])
        return it

    monkeypatch.setattr("apps.valuation.tasks.appraise_item", _fake_appraise)
    task_res = process_deferred_ai_enrichment_task(batch_size=10)
    assert task_res["upgraded"] == 1
    assert str(deferred_item.id) in seen_ids

    creds_ira = api_client.get("/api/v1/settings/credentials", **headers_ira).json()
    gemini_ira = next(c for c in creds_ira if c["provider"] == "GEMINI")
    assert gemini_ira["is_configured"] is True
    assert gemini_ira["is_inherited"] is True
    assert gemini_ira["inherited_from_workspace_name"] == default_ws.name

    # Override GEMINI key on IRA vault -> delete override -> returns to inherited without deleting default key
    api_client.put(
        "/api/v1/settings/credentials/GEMINI",
        data=json.dumps({"value": "AIzaSecondaryOverride1111"}),
        content_type="application/json",
        **headers_ira,
    )
    assert resolve_workspace_secret(ira_ws, "GEMINI") == "AIzaSecondaryOverride1111"
    api_client.delete("/api/v1/settings/credentials/GEMINI", **headers_ira)
    assert resolve_workspace_secret(ira_ws, "GEMINI") == "AIzaPrimaryKey9999"

    # 6. Upload photo inside default_ws, set IRA default, delete old default -> migrates credential & deletes files
    default_item = CollectionItem.objects.get(id=item_a.json()["id"])
    img = Image.new("RGB", (50, 50), color=(212, 175, 55))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    up = SimpleUploadedFile("gold.png", buf.getvalue(), content_type="image/png")
    p_resp = api_client.post(
        f"/api/v1/catalog/items/{default_item.id}/photos",
        data={"file": up, "label": "OBVERSE", "is_primary": "true"},
        **headers_a,
    )
    assert p_resp.status_code == 201
    photo = ItemPhoto.objects.get(item=default_item)
    storage = photo.image.storage
    img_path = photo.image.name

    # First test explicit set-default then switch back and delete default
    set_def = api_client.post(f"/api/v1/auth/workspaces/{ira_id}/set-default", **headers_a)
    assert set_def.status_code == 200 and set_def.json()["is_default"] is True
    api_client.post(f"/api/v1/auth/workspaces/{default_ws.id}/set-default", **headers_a)

    # Delete current default vault -> promotes IRA to default & migrates GEMINI credential + cleans up media
    del_default = api_client.delete(f"/api/v1/auth/workspaces/{default_ws.id}", **headers_a)
    assert del_default.status_code == 204
    ira_ws.refresh_from_db()
    assert ira_ws.is_default is True
    assert resolve_workspace_secret(ira_ws, "GEMINI") == "AIzaPrimaryKey9999"
    assert not storage.exists(img_path)

    # Verify RunPython migration helper sets is_default when a user has workspaces without default
    import importlib

    mig = importlib.import_module("apps.accounts.migrations.0007_workspace_description_is_default")
    Workspace.objects.filter(owner=user).update(is_default=False)
    from django.apps import apps as django_apps

    mig._backfill_default_workspaces(django_apps, None)
    ira_ws.refresh_from_db()
    assert ira_ws.is_default is True


@pytest.mark.django_db
def test_accounts_error_and_edge_branches(api_client):
    from datetime import timedelta
    from unittest.mock import patch

    from django.utils import timezone

    from apps.accounts.auth import issue_access_token
    from apps.accounts.models import (
        User,
        Workspace,
        WorkspaceInvitation,
        WorkspaceMembership,
    )

    # Registration validation failures
    assert (
        api_client.post(
            "/api/v1/auth/register",
            data=json.dumps({"email": "invalid-email", "password": "Password123!"}),
            content_type="application/json",
        ).status_code
        == 400
    )
    assert (
        api_client.post(
            "/api/v1/auth/register",
            data=json.dumps({"email": "dup@example.com", "password": "Password123!"}),
            content_type="application/json",
        ).status_code
        == 201
    )
    assert (
        api_client.post(
            "/api/v1/auth/register",
            data=json.dumps({"email": "dup@example.com", "password": "Password123!"}),
            content_type="application/json",
        ).status_code
        == 409
    )

    # _serialize_user auto-provisions a default workspace for a user without workspaces
    orphan = User.objects.create_user(email="orphan@example.com", password="Password123!")
    WorkspaceMembership.objects.create(
        workspace=Workspace.objects.create(name="Orphan", slug="orphan-ws", owner=orphan),
        user=orphan,
        role=WorkspaceMembership.Role.OWNER,
    )
    orphan.owned_workspaces.all().delete()
    # Now GET /auth/login auto-provisions default workspace on _serialize_user
    login_resp = api_client.post(
        "/api/v1/auth/login",
        data=json.dumps({"email": "orphan@example.com", "password": "Password123!"}),
        content_type="application/json",
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    ws_id = login_resp.json()["user"]["workspace"]["id"]
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}", "HTTP_X_WORKSPACE_ID": ws_id}

    # Enable PLUS tier to test PATCH /auth/workspaces/{id} & invites
    sub_user = User.objects.get(email="orphan@example.com")
    from apps.accounts.models import AccountSubscription, PlanTier

    AccountSubscription.objects.update_or_create(
        user=sub_user,
        defaults={
            "tier": PlanTier.PLUS,
            "source": AccountSubscription.Source.ADMIN_OVERRIDE,
            "status": AccountSubscription.Status.ACTIVE,
        },
    )

    # _get_owned_workspace 404, PATCH validation & fields
    missing_id = "00000000-0000-0000-0000-000000000099"
    assert (
        api_client.patch(
            f"/api/v1/auth/workspaces/{missing_id}",
            data=json.dumps({"name": "Valid"}),
            content_type="application/json",
            **headers,
        ).status_code
        == 404
    )
    assert (
        api_client.patch(
            f"/api/v1/auth/workspaces/{ws_id}",
            data=json.dumps({"name": "   "}),
            content_type="application/json",
            **headers,
        ).status_code
        == 400
    )
    patched = api_client.patch(
        f"/api/v1/auth/workspaces/{ws_id}",
        data=json.dumps({
            "name": "Updated Vault",
            "description": "Long description",
            "default_currency": "CAD",
            "auto_sort_enabled": False,
        }),
        content_type="application/json",
        **headers,
    )
    assert patched.status_code == 200
    assert patched.json()["default_currency"] == "CAD"
    assert patched.json()["auto_sort_enabled"] is False
    # No-op PATCH with empty body
    assert (
        api_client.patch(
            f"/api/v1/auth/workspaces/{ws_id}",
            data=json.dumps({}),
            content_type="application/json",
            **headers,
        ).status_code
        == 200
    )

    # _get_member_workspace 404 and 403 via GET /members
    other = User.objects.create_user(email="other-member@example.com", password="Password123!")
    other_ws = Workspace.objects.create(name="Other", slug="other-ws-m", owner=other)
    WorkspaceMembership.objects.create(
        workspace=other_ws, user=other, role=WorkspaceMembership.Role.OWNER
    )
    assert api_client.get(f"/api/v1/auth/workspaces/{missing_id}/members", **headers).status_code == 404
    assert api_client.get(f"/api/v1/auth/workspaces/{other_ws.id}/members", **headers).status_code == 403

    # Settings workspace PATCH empty name, description, currency
    assert (
        api_client.patch(
            "/api/v1/settings/workspace",
            data=json.dumps({"name": " "}),
            content_type="application/json",
            **headers,
        ).status_code
        == 400
    )
    s_patch = api_client.patch(
        "/api/v1/settings/workspace",
        data=json.dumps({
            "name": "Settings Vault",
            "description": "Notes",
            "default_currency": "EUR",
            "auto_sort_enabled": False,
        }),
        content_type="application/json",
        **headers,
    )
    assert s_patch.status_code == 200
    assert s_patch.json()["default_currency"] == "EUR"
    assert s_patch.json()["auto_sort_enabled"] is False

    # Settings credentials error & local credential listing paths
    assert api_client.put(
        "/api/v1/settings/credentials/BAD_PROV",
        data=json.dumps({"value": "abc"}),
        content_type="application/json",
        **headers,
    ).status_code == 400
    assert api_client.put(
        "/api/v1/settings/credentials/GEMINI",
        data=json.dumps({"value": "   "}),
        content_type="application/json",
        **headers,
    ).status_code == 400
    assert api_client.put(
        "/api/v1/settings/credentials/GEMINI",
        data=json.dumps({"value": "AIzaLocalKey1234"}),
        content_type="application/json",
        **headers,
    ).status_code == 200
    creds_list = api_client.get("/api/v1/settings/credentials", **headers)
    assert creds_list.status_code == 200
    assert any(c["provider"] == "GEMINI" and c["is_configured"] and not c["is_inherited"] for c in creds_list.json())
    assert api_client.delete("/api/v1/settings/credentials/BAD_PROV", **headers).status_code == 400

    # Invites list, invalid email, revoke 404/400, members 400/404, leave 404
    assert api_client.get(f"/api/v1/auth/workspaces/{ws_id}/invites", **headers).status_code == 200
    assert (
        api_client.post(
            f"/api/v1/auth/workspaces/{ws_id}/invites",
            data=json.dumps({"email": "bad-email", "role": "VIEWER"}),
            content_type="application/json",
            **headers,
        ).status_code
        == 400
    )
    inv_resp = api_client.post(
        f"/api/v1/auth/workspaces/{ws_id}/invites",
        data=json.dumps({"email": "other-member@example.com", "role": "VIEWER"}),
        content_type="application/json",
        **headers,
    )
    inv_id = inv_resp.json()["id"]
    inv_token = inv_resp.json()["token"]
    assert len(api_client.get(f"/api/v1/auth/workspaces/{ws_id}/invites", **headers).json()) == 1
    assert api_client.delete(f"/api/v1/auth/workspaces/{ws_id}/invites/{missing_id}", **headers).status_code == 404
    assert (
        api_client.patch(
            f"/api/v1/auth/workspaces/{ws_id}/members/{missing_id}",
            data=json.dumps({"role": "INVALID"}),
            content_type="application/json",
            **headers,
        ).status_code
        == 400
    )
    assert (
        api_client.patch(
            f"/api/v1/auth/workspaces/{ws_id}/members/{missing_id}",
            data=json.dumps({"role": "EDITOR"}),
            content_type="application/json",
            **headers,
        ).status_code
        == 404
    )
    assert api_client.delete(f"/api/v1/auth/workspaces/{ws_id}/members/{missing_id}", **headers).status_code == 404
    assert api_client.post(f"/api/v1/auth/workspaces/{missing_id}/leave", **headers).status_code == 404
    assert api_client.post(f"/api/v1/auth/workspaces/{other_ws.id}/leave", **headers).status_code == 404

    # Invite preview/accept/decline edge branches
    other_headers = {"HTTP_AUTHORIZATION": f"Bearer {issue_access_token(other)}"}
    assert api_client.get("/api/v1/auth/invites/nonexistent-tok").status_code == 404
    assert api_client.post("/api/v1/auth/invites/nonexistent-tok/accept", **other_headers).status_code == 404
    assert api_client.post("/api/v1/auth/invites/nonexistent-tok/decline", **other_headers).status_code == 404
    assert api_client.post(f"/api/v1/auth/invites/{inv_token}/decline", **headers).status_code == 403

    # Pre-create membership with VIEWER then attempt to accept EDITOR invite -> rejected with 409 without elevating role
    existing_mem = WorkspaceMembership.objects.create(
        workspace=Workspace.objects.get(id=ws_id), user=other, role=WorkspaceMembership.Role.VIEWER
    )
    inv_obj = WorkspaceInvitation.objects.get(id=inv_id)
    inv_obj.role = WorkspaceInvitation.Role.EDITOR
    inv_obj.save()
    assert api_client.post(f"/api/v1/auth/invites/{inv_token}/accept", **other_headers).status_code == 409
    existing_mem.refresh_from_db()
    assert existing_mem.role == WorkspaceMembership.Role.VIEWER
    existing_mem.delete()
    assert api_client.post(f"/api/v1/auth/invites/{inv_token}/accept", **other_headers).status_code == 200
    # Already accepted -> revoke 400, accept 400, decline 400, preview 410
    assert api_client.get(f"/api/v1/auth/invites/{inv_token}").status_code == 410
    assert api_client.delete(f"/api/v1/auth/workspaces/{ws_id}/invites/{inv_id}", **headers).status_code == 400
    assert api_client.post(f"/api/v1/auth/invites/{inv_token}/accept", **other_headers).status_code == 400
    assert api_client.post(f"/api/v1/auth/invites/{inv_token}/decline", **other_headers).status_code == 400

    # Revoked & expired decline branches
    rev_inv = WorkspaceInvitation.objects.create(
        workspace=Workspace.objects.get(id=ws_id),
        invited_by=sub_user,
        email=other.email,
        role=WorkspaceInvitation.Role.VIEWER,
        status=WorkspaceInvitation.Status.REVOKED,
    )
    assert api_client.post(f"/api/v1/auth/invites/{rev_inv.token}/decline", **other_headers).status_code == 410
    exp_inv = WorkspaceInvitation.objects.create(
        workspace=Workspace.objects.get(id=ws_id),
        invited_by=sub_user,
        email=other.email,
        role=WorkspaceInvitation.Role.VIEWER,
        expires_at=timezone.now() - timedelta(minutes=1),
    )
    assert api_client.post(f"/api/v1/auth/invites/{exp_inv.token}/decline", **other_headers).status_code == 410

    # Owner self-invite edge case via DB row: accept own vault's invitation -> 400 (line 812)
    self_inv = WorkspaceInvitation.objects.create(
        workspace=Workspace.objects.get(id=ws_id),
        invited_by=other,
        email=sub_user.email,
        role=WorkspaceInvitation.Role.EDITOR,
    )
    assert api_client.post(f"/api/v1/auth/invites/{self_inv.token}/accept", **headers).status_code == 400

    # Create second workspace with photo, then delete workspace and account with storage.delete raising
    sec = api_client.post(
        "/api/v1/auth/workspaces",
        data=json.dumps({"name": "Disposable Vault"}),
        content_type="application/json",
        **headers,
    ).json()
    import io

    from django.core.files.uploadedfile import SimpleUploadedFile
    from PIL import Image

    from apps.catalog.models import CollectionItem, ItemPhoto

    disp_ws = Workspace.objects.get(id=sec["id"])
    item = CollectionItem.objects.create(workspace=disp_ws, title="Silver Round", category="ROUND")
    buf = io.BytesIO()
    Image.new("RGB", (20, 20), (200, 200, 200)).save(buf, format="PNG")
    ItemPhoto.objects.create(
        workspace=disp_ws,
        item=item,
        image=SimpleUploadedFile("r.png", buf.getvalue(), content_type="image/png"),
        thumbnail=SimpleUploadedFile("r_t.png", buf.getvalue(), content_type="image/png"),
    )
    with patch("django.core.files.storage.FileSystemStorage.delete", side_effect=OSError("disk busy")):
        assert api_client.delete(f"/api/v1/auth/workspaces/{sec['id']}", **headers).status_code == 204
        # Add photo to primary vault and delete account with storage exception too (lines 398-399)
        p_item = CollectionItem.objects.create(workspace_id=ws_id, title="Coin", category="COIN")
        ItemPhoto.objects.create(
            workspace_id=ws_id,
            item=p_item,
            image=SimpleUploadedFile("c.png", buf.getvalue(), content_type="image/png"),
        )
        assert (
            api_client.delete(
                "/api/v1/auth/me",
                data=json.dumps({"password": "Password123!"}),
                content_type="application/json",
                **headers,
            ).status_code
            == 204
        )



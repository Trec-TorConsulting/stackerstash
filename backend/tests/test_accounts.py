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

    good_pw = api_client.post(
        "/api/v1/auth/change-password",
        data=json.dumps({"current_password": "StrongPassword123!", "new_password": "NewPassword123!"}),
        content_type="application/json",
        **headers,
    )
    assert good_pw.status_code == 200

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


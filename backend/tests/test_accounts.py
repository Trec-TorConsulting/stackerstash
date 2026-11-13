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
def test_health_and_readiness_probes(api_client):
    assert api_client.get("/healthz").status_code == 200
    assert api_client.get("/readyz").status_code == 200


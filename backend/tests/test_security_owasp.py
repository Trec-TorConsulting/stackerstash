from __future__ import annotations

import csv
import io
import json
import socket
import time
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

import httpx
import jwt
import pytest
import respx
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command

from apps.accounts.models import (
    AccountSubscription,
    PlanTier,
    ProviderCredential,
)
from apps.catalog.importer import MAX_PHOTO_BYTES, _download_and_validate_photo, _validate_public_http_url
from apps.catalog.models import CollectionItem, Container, ItemPhoto


def _headers(token: str, ws_id=None) -> dict[str, str]:
    out = {"HTTP_AUTHORIZATION": f"Bearer {token}"}
    if ws_id is not None:
        out["HTTP_X_WORKSPACE_ID"] = str(ws_id)
    return out


@pytest.mark.django_db
def test_a01_broken_access_control_and_media_signatures(api_client, user_a, user_b, settings):
    alice, alice_ws, alice_token = user_a
    _, _, bob_token = user_b

    container = Container.objects.create(workspace=alice_ws, name="Alice Safe")
    item = CollectionItem.objects.create(workspace=alice_ws, container=container, title="Private Gold")

    # Unauthenticated access -> 401
    assert api_client.get("/api/v1/catalog/items").status_code == 401

    # Bob IDOR attempts on Alice's resources -> 404/403
    assert api_client.get(f"/api/v1/catalog/items/{item.id}", **_headers(bob_token)).status_code == 404
    assert (
        api_client.patch(
            f"/api/v1/catalog/items/{item.id}",
            data=json.dumps({"title": "Hacked"}),
            content_type="application/json",
            **_headers(bob_token),
        ).status_code
        == 404
    )
    assert api_client.delete(f"/api/v1/catalog/items/{item.id}", **_headers(bob_token)).status_code == 404
    assert api_client.delete(f"/api/v1/catalog/containers/{container.id}", **_headers(bob_token)).status_code == 404
    assert api_client.get("/api/v1/admin/overview", **_headers(bob_token)).status_code == 403

    # Signed media verification & private security headers + revocation on workspace deletion
    from config.media_signing import build_signed_media_url

    media_root = Path(settings.MEDIA_ROOT)
    media_root.mkdir(parents=True, exist_ok=True)
    (media_root / "secret.jpg").write_bytes(b"imgdata")
    assert api_client.get("/media/secret.jpg").status_code == 403
    assert api_client.get("/media/secret.jpg?exp=9999999999&sig=bad").status_code == 403
    assert api_client.get("/media/secret.jpg?exp=1&sig=bad").status_code == 403

    ws_rel = f"workspaces/{alice_ws.id}/items/{item.id}/coin.jpg"
    ws_file = media_root / ws_rel
    ws_file.parent.mkdir(parents=True, exist_ok=True)
    ws_file.write_bytes(b"imgdata")
    signed_ws_url = build_signed_media_url(ws_rel)
    ok_media = api_client.get(signed_ws_url)
    assert ok_media.status_code == 200
    assert ok_media["Cache-Control"] == "private, max-age=3600, no-transform"
    assert ok_media["X-Content-Type-Options"] == "nosniff"
    assert ok_media["Content-Security-Policy"] == "default-src 'none'; img-src 'self'"
    assert ok_media["Referrer-Policy"] == "same-origin"

    # Advancing workspace media_key_version invalidates previously issued signed URLs
    alice_ws.media_key_version += 1
    alice_ws.save(update_fields=["media_key_version"])
    assert api_client.get(signed_ws_url).status_code == 403


@pytest.mark.django_db
def test_a02_cryptographic_failures_hashing_and_byok(user_a, settings):
    alice, alice_ws, _ = user_a
    assert alice.password != "StrongPassword123!"
    assert "$" in alice.password

    cred = ProviderCredential.objects.create(workspace=alice_ws, provider=ProviderCredential.Provider.GEMINI)
    cred.set_secret("AIzaSecretToken9876")
    cred.save()
    assert "AIzaSecretToken9876" not in cred.encrypted_value
    assert cred.masked_hint.endswith("9876")
    assert cred.get_secret() == "AIzaSecretToken9876"

    # Django deploy checks pass when strict production flags are set
    settings.DEBUG = False
    settings.SECRET_KEY = "x" * 64
    settings.ALLOWED_HOSTS = ["stackerstash.com"]
    settings.SECURE_HSTS_SECONDS = 31536000
    settings.SECURE_SSL_REDIRECT = True
    settings.SESSION_COOKIE_SECURE = True
    settings.CSRF_COOKIE_SECURE = True
    call_command("check", deploy=True)


@pytest.mark.django_db
def test_a03_csv_formula_injection_sql_and_xss_neutralization(api_client, user_a):
    _, alice_ws, alice_token = user_a

    payloads = [
        "=CMD|'/C calc'!A0",
        "+SUM(1,2)",
        "-1+1",
        "@SUM(1,1)",
        "\t=cmd",
        "\r+cmd",
        "<script>alert(1)</script>",
    ]
    for title in payloads:
        CollectionItem.objects.create(
            workspace=alice_ws,
            title=title,
            category=CollectionItem.Category.COIN,
            purchase_price=Decimal("-12.50"),
            market_value_unit=Decimal("25.00"),
            notes="-12.50",
        )

    csv_resp = api_client.get("/api/v1/catalog/items/export/csv", **_headers(alice_token))
    assert csv_resp.status_code == 200
    rows = list(csv.reader(io.StringIO(csv_resp.content.decode("utf-8"))))
    headers = rows[0]
    title_idx = headers.index("title")
    price_idx = headers.index("purchase_price")

    exported_titles = [r[title_idx] for r in rows[1:]]
    assert "'=CMD|'/C calc'!A0" in exported_titles
    assert "'+SUM(1,2)" in exported_titles
    assert "'-1+1" in exported_titles
    assert "'@SUM(1,1)" in exported_titles
    assert "'\t=cmd" in exported_titles
    assert "'\r+cmd" in exported_titles
    # Valid signed decimals are NOT escaped
    assert rows[1][price_idx] == "-12.50"

    # ORM SQL injection search safety
    sqli_resp = api_client.get(
        "/api/v1/catalog/items?q=' OR 1=1;--",
        **_headers(alice_token),
    )
    assert sqli_resp.status_code == 200
    assert sqli_resp.json() == []


@pytest.mark.django_db
def test_a04_a05_strict_photo_upload_validation(api_client, user_a, settings):
    _, alice_ws, alice_token = user_a
    item = CollectionItem.objects.create(workspace=alice_ws, title="Proof Target")
    headers = _headers(alice_token, alice_ws.id)

    bad_uploads = [
        SimpleUploadedFile("empty.jpg", b"", content_type="image/jpeg"),
        SimpleUploadedFile("xss.svg", b"<svg onload=alert(1)></svg>", content_type="image/svg+xml"),
        SimpleUploadedFile("fake.jpg", b"<html><body>not an image</body></html>", content_type="image/jpeg"),
        SimpleUploadedFile("oversized.jpg", b"0" * (10 * 1024 * 1024 + 10), content_type="image/jpeg"),
    ]
    for f in bad_uploads:
        resp = api_client.post(
            f"/api/v1/catalog/items/{item.id}/photos",
            data={"label": "OBVERSE", "file": f},
            **headers,
        )
        assert resp.status_code == 400

    assert ItemPhoto.objects.filter(item=item).count() == 0


@pytest.mark.django_db
def test_a07_a08_a09_auth_integrity_and_secret_non_disclosure(api_client, user_a, settings):
    alice, _, alice_token = user_a

    # Weak password rejected
    weak = api_client.post(
        "/api/v1/auth/register",
        data=json.dumps({"email": "weak@example.com", "password": "short"}),
        content_type="application/json",
    )
    assert weak.status_code == 400

    # Expired & tampered JWTs rejected
    expired_tok = jwt.encode(
        {"sub": str(alice.id), "email": alice.email, "iat": 1, "exp": int(time.time()) - 10},
        settings.SECRET_KEY,
        algorithm="HS256",
    )
    assert api_client.get("/api/v1/auth/me", HTTP_AUTHORIZATION=f"Bearer {expired_tok}").status_code == 401
    assert api_client.get("/api/v1/auth/me", HTTP_AUTHORIZATION="Bearer bad.jwt.token").status_code == 401

    # Password change immediately invalidates prior JWT tokens
    pw_change = api_client.post(
        "/api/v1/auth/change-password",
        data=json.dumps({"current_password": "StrongPassword123!", "new_password": "RotatedPassword123!"}),
        content_type="application/json",
        **_headers(alice_token),
    )
    assert pw_change.status_code == 200
    assert api_client.get("/api/v1/auth/me", **_headers(alice_token)).status_code == 401
    rotated_token = pw_change.json()["access_token"]
    assert api_client.get("/api/v1/auth/me", **_headers(rotated_token)).status_code == 200

    # Inactive user rejected
    alice.is_active = False
    alice.save(update_fields=["is_active"])
    assert api_client.get("/api/v1/auth/me", **_headers(rotated_token)).status_code == 401

    # Brute-force rate limiting returns 429 on repeated auth / invite attempts
    settings.AUTH_RATE_LIMIT_MAX_ATTEMPTS = 2
    for _ in range(2):
        assert (
            api_client.post(
                "/api/v1/auth/login",
                data=json.dumps({"email": "brute@example.com", "password": "WrongPassword123!"}),
                content_type="application/json",
                HTTP_X_FORWARDED_FOR="203.0.113.55",
            ).status_code
            == 401
        )
    throttled_login = api_client.post(
        "/api/v1/auth/login",
        data=json.dumps({"email": "brute@example.com", "password": "WrongPassword123!"}),
        content_type="application/json",
        HTTP_X_FORWARDED_FOR="203.0.113.55",
    )
    assert throttled_login.status_code == 429

    for _ in range(2):
        assert (
            api_client.get(
                "/api/v1/auth/invites/guess-token",
                HTTP_X_FORWARDED_FOR="203.0.113.56",
            ).status_code
            == 404
        )
    throttled_invite = api_client.get(
        "/api/v1/auth/invites/guess-token",
        HTTP_X_FORWARDED_FOR="203.0.113.56",
    )
    assert throttled_invite.status_code == 429

    # Stripe webhook tampering -> 400 without tier upgrade
    settings.STRIPE_WEBHOOK_SECRET = "whsec_test"
    AccountSubscription.objects.update_or_create(user=alice, defaults={"tier": PlanTier.FREE})
    with patch("apps.accounts.billing_api.stripe.Webhook.construct_event", side_effect=ValueError("bad sig")):
        bad_wh = api_client.post(
            "/api/v1/billing/webhook",
            data=json.dumps({"type": "checkout.session.completed"}),
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="tampered",
        )
        assert bad_wh.status_code == 400
    assert AccountSubscription.objects.get(user=alice).tier == PlanTier.FREE

    # Provider exception strings scrubbed in ValuationHistory, AppraisalJob, and deferred AI enrichment
    from apps.valuation.models import SpotPriceSnapshot, ValuationHistory
    from apps.valuation.services import appraise_item, start_appraisal_job
    from apps.valuation.tasks import process_deferred_ai_enrichment_task

    SpotPriceSnapshot.objects.create(metal_type="GOLD", price_usd_per_troy_oz=Decimal("2500.00"))
    alice.is_active = True
    alice.save(update_fields=["is_active"])
    alice_ws = alice.owned_workspaces.first()
    cred = ProviderCredential.objects.create(workspace=alice_ws, provider=ProviderCredential.Provider.GEMINI)
    cred.set_secret("AIzaSecretLeakTest999999")
    cred.save()
    coin = CollectionItem.objects.create(
        workspace=alice_ws,
        title="Redaction Coin",
        metal_type="GOLD",
        weight_value=Decimal("1"),
        market_value_unit=Decimal("2500.00"),
        ai_enrichment_pending=True,
    )
    leaked_msg = "Upstream failed: https://api.example/v1?key=AIzaSecretLeakTest999999 Authorization: Bearer secretBearerToken123"
    with patch("apps.vision.services.estimate_item_value_with_ai", side_effect=RuntimeError(leaked_msg)):
        appraise_item(coin, alice_ws)
    vh = ValuationHistory.objects.filter(item=coin).first()
    assert vh is not None
    assert "AIzaSecretLeakTest999999" not in json.dumps(vh.raw_payload)
    assert "secretBearerToken123" not in json.dumps(vh.raw_payload)

    with patch("apps.valuation.services.appraise_item", side_effect=RuntimeError(leaked_msg)):
        failed_job = start_appraisal_job(coin, alice_ws, sync=True)
    assert "AIzaSecretLeakTest999999" not in failed_job.error_message
    assert "secretBearerToken123" not in failed_job.error_message

    with patch("apps.valuation.tasks.appraise_item", side_effect=RuntimeError(leaked_msg)):
        process_deferred_ai_enrichment_task(batch_size=5)
    coin.refresh_from_db()
    assert "AIzaSecretLeakTest999999" not in coin.ai_enrichment_last_error
    assert "secretBearerToken123" not in coin.ai_enrichment_last_error


@pytest.mark.django_db
def test_a10_ssrf_url_validation_redirect_and_stream_cap(api_client, user_a, monkeypatch):
    from apps.accounts.models import validate_ollama_url

    _, alice_ws, alice_token = user_a

    # OLLAMA_URL SSRF checks: cloud metadata, cluster services, credentials, link-local, non-allowlisted IPs/locals
    bad_ollama_urls = [
        "file:///etc/passwd",
        "ftp://ollama.example.com:11434",
        "http://user:pass@ollama.example.com:11434",
        "http://169.254.169.254/latest/meta-data",
        "http://169.254.1.1:11434",
        "http://0.0.0.0:11434",
        "http://postgresql.postgresql.svc.cluster.local:5432",
        "http://redis.redis.svc:6379",
        "http://10.0.0.8:11434",
        "http://unlisted.local:11434",
    ]
    for bad_ol in bad_ollama_urls:
        with pytest.raises(ValueError):
            validate_ollama_url(bad_ol)

    assert validate_ollama_url("https://ollama.example.com:11434/") == "https://ollama.example.com:11434"
    assert validate_ollama_url("http://ollama.ollama.svc.cluster.local:11434") == "http://ollama.ollama.svc.cluster.local:11434"
    assert (
        api_client.put(
            "/api/v1/settings/credentials/OLLAMA_URL",
            data=json.dumps({"value": "http://169.254.169.254/latest/meta-data"}),
            content_type="application/json",
            **_headers(alice_token, alice_ws.id),
        ).status_code
        == 400
    )
    assert (
        api_client.put(
            "/api/v1/settings/credentials/OLLAMA_URL",
            data=json.dumps({"value": "https://ollama.example.com:11434"}),
            content_type="application/json",
            **_headers(alice_token, alice_ws.id),
        ).status_code
        == 200
    )

    # Direct private / loopback / metadata / non-HTTP schemes rejected
    blocked_urls = [
        "file:///etc/passwd",
        "ftp://example.com/coin.jpg",
        "http://127.0.0.1/secret.jpg",
        "http://localhost/admin",
        "http://169.254.169.254/latest/meta-data/",
        "http://10.0.0.1/internal.png",
        "http://[::1]/loop.jpg",
    ]
    for bad_url in blocked_urls:
        with pytest.raises(ValueError):
            _validate_public_http_url(bad_url)

    # Hostname resolving to private DNS IP blocked
    monkeypatch.setattr(
        "apps.catalog.importer.socket.getaddrinfo",
        lambda host, port, *a, **kw: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("169.254.169.254", port))
        ],
    )
    with pytest.raises(ValueError, match="Blocked non-public IP"):
        _validate_public_http_url("https://rebind.attacker.example/photo.jpg")

    # Public DNS resolves cleanly
    monkeypatch.setattr(
        "apps.catalog.importer.socket.getaddrinfo",
        lambda host, port, *a, **kw: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.215.14", port))
        ]
        if "public.example" in host
        else [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", port))],
    )

    with httpx.Client() as client:
        # Redirect from public host to loopback IP is caught pre-request
        with respx.mock as mock_http:
            mock_http.get("https://public.example/redirect.jpg").mock(
                return_value=httpx.Response(
                    302, headers={"location": "http://127.0.0.1/secret.jpg"}
                )
            )
            res, warn = _download_and_validate_photo(client, "id-1", "Test Coin", "https://public.example/redirect.jpg")
            assert res is None
            assert warn is not None and "Skipped unsafe" in warn

        # Oversized stream (> 10 MB) aborted safely
        with respx.mock as mock_http:
            mock_http.get("https://public.example/huge.jpg").mock(
                return_value=httpx.Response(
                    200,
                    content=b"a" * (MAX_PHOTO_BYTES + 128),
                )
            )
            res, warn = _download_and_validate_photo(client, "id-2", "Huge Coin", "https://public.example/huge.jpg")
            assert res is None
            assert warn is not None and "oversized" in warn.lower()

from __future__ import annotations

import io
import json
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image

from apps.accounts.auth import issue_access_token
from apps.accounts.models import (
    ProviderCredential,
    User,
    Workspace,
    WorkspaceInvitation,
    WorkspaceMembership,
    create_default_workspace_for_user,
)
from apps.catalog.models import CollectionItem, Container, ItemPhoto


def _make_png_bytes() -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", (24, 24), color=(180, 140, 40))
    img.save(buf, format="PNG")
    return buf.getvalue()


def _headers(token: str, workspace_id=None) -> dict[str, str]:
    h = {"HTTP_AUTHORIZATION": f"Bearer {token}"}
    if workspace_id is not None:
        h["HTTP_X_WORKSPACE_ID"] = str(workspace_id)
    return h


@pytest.mark.django_db
def test_invite_lifecycle_preview_pending_accept_decline_revoke_expiry(api_client, user_a, user_b):
    alice, alice_ws, alice_token = user_a
    bob, bob_ws, bob_token = user_b

    # Non-owner cannot invite or list invites
    forbidden = api_client.post(
        f"/api/v1/auth/workspaces/{alice_ws.id}/invites",
        data=json.dumps({"email": bob.email, "role": "EDITOR"}),
        content_type="application/json",
        **_headers(bob_token),
    )
    assert forbidden.status_code == 403

    # Invalid role / owner self-invite validation
    bad_role = api_client.post(
        f"/api/v1/auth/workspaces/{alice_ws.id}/invites",
        data=json.dumps({"email": bob.email, "role": "OWNER"}),
        content_type="application/json",
        **_headers(alice_token),
    )
    assert bad_role.status_code == 400

    self_invite = api_client.post(
        f"/api/v1/auth/workspaces/{alice_ws.id}/invites",
        data=json.dumps({"email": alice.email, "role": "EDITOR"}),
        content_type="application/json",
        **_headers(alice_token),
    )
    assert self_invite.status_code == 400

    # Alice invites Bob as EDITOR (mixed case email normalized)
    inv_resp = api_client.post(
        f"/api/v1/auth/workspaces/{alice_ws.id}/invites",
        data=json.dumps({"email": "  BOB@Example.COM ", "role": "EDITOR"}),
        content_type="application/json",
        **_headers(alice_token),
    )
    assert inv_resp.status_code == 201
    invite = inv_resp.json()
    assert invite["email"] == "bob@example.com"
    assert invite["role"] == "EDITOR"
    assert invite["status"] == "PENDING"
    assert invite["invite_path"] == f"/invite/{invite['token']}"

    # Re-inviting an already pending email automatically revokes the prior invite
    reinvite_resp = api_client.post(
        f"/api/v1/auth/workspaces/{alice_ws.id}/invites",
        data=json.dumps({"email": bob.email, "role": "VIEWER"}),
        content_type="application/json",
        **_headers(alice_token),
    )
    assert reinvite_resp.status_code == 201
    prior_inv = WorkspaceInvitation.objects.get(id=invite["id"])
    assert prior_inv.status == WorkspaceInvitation.Status.REVOKED
    invite = reinvite_resp.json()
    inv_up = api_client.post(
        f"/api/v1/auth/workspaces/{alice_ws.id}/invites",
        data=json.dumps({"email": bob.email, "role": "EDITOR"}),
        content_type="application/json",
        **_headers(alice_token),
    )
    assert inv_up.status_code == 201
    invite = inv_up.json()

    # Unauthenticated preview works with masked emails without leaking catalog data
    preview_resp = api_client.get(f"/api/v1/auth/invites/{invite['token']}")
    assert preview_resp.status_code == 200
    preview = preview_resp.json()
    assert preview["workspace_name"] == alice_ws.name
    assert preview["role"] == "EDITOR"
    assert preview["owner_email"] == "a***@example.com"
    assert preview["invited_by_email"] == "a***@example.com"
    assert preview["email"] == "b***@example.com"

    # Authenticated invitee preview returns unmasked email so client email-match succeeds
    authed_preview = api_client.get(
        f"/api/v1/auth/invites/{invite['token']}", **_headers(bob_token)
    ).json()
    assert authed_preview["email"] == bob.email
    assert authed_preview["owner_email"] == alice.email

    # Prior revoked invite token returns 410 on preview and is redacted in owner invites list
    assert api_client.get(f"/api/v1/auth/invites/{prior_inv.token}").status_code == 410
    owner_invites = api_client.get(
        f"/api/v1/auth/workspaces/{alice_ws.id}/invites", **_headers(alice_token)
    ).json()
    revoked_row = next(i for i in owner_invites if i["id"] == str(prior_inv.id))
    assert revoked_row["token"] == ""
    assert revoked_row["invite_path"] == ""

    # Pending inbox shows the invite for Bob
    pending_resp = api_client.get("/api/v1/auth/invites/pending", **_headers(bob_token))
    assert pending_resp.status_code == 200
    assert [p["id"] for p in pending_resp.json()] == [invite["id"]]

    # Wrong user (Charlie) receives 403 trying to accept Bob's invite
    charlie = User.objects.create_user(email="charlie@example.com", password="StrongPassword123!")
    create_default_workspace_for_user(charlie, name="Charlie")
    charlie_token = issue_access_token(charlie)
    wrong_accept = api_client.post(
        f"/api/v1/auth/invites/{invite['token']}/accept",
        **_headers(charlie_token),
    )
    assert wrong_accept.status_code == 403

    # Bob accepts invite -> gains shared workspace while own default stays primary
    accept_resp = api_client.post(
        f"/api/v1/auth/invites/{invite['token']}/accept",
        **_headers(bob_token),
    )
    assert accept_resp.status_code == 200
    accepted_ws = accept_resp.json()
    assert accepted_ws["id"] == str(alice_ws.id)
    assert accepted_ws["role"] == "EDITOR"
    assert accepted_ws["is_shared"] is True
    assert accepted_ws["owner_email"] == alice.email

    bob_me = api_client.get("/api/v1/auth/me", **_headers(bob_token)).json()
    assert bob_me["workspace"]["id"] == str(bob_ws.id)
    shared_entries = [w for w in bob_me["workspaces"] if w["id"] == str(alice_ws.id)]
    assert len(shared_entries) == 1
    assert shared_entries[0]["role"] == "EDITOR"
    assert shared_entries[0]["is_shared"] is True

    # Already a member -> 409 on re-invite
    member_dup = api_client.post(
        f"/api/v1/auth/workspaces/{alice_ws.id}/invites",
        data=json.dumps({"email": bob.email, "role": "VIEWER"}),
        content_type="application/json",
        **_headers(alice_token),
    )
    assert member_dup.status_code == 409

    # Charlie decline & revoke & expired paths
    charlie_inv = api_client.post(
        f"/api/v1/auth/workspaces/{alice_ws.id}/invites",
        data=json.dumps({"email": charlie.email, "role": "VIEWER"}),
        content_type="application/json",
        **_headers(alice_token),
    ).json()
    dec_resp = api_client.post(
        f"/api/v1/auth/invites/{charlie_inv['token']}/decline",
        **_headers(charlie_token),
    )
    assert dec_resp.status_code == 204
    assert not WorkspaceMembership.objects.filter(workspace=alice_ws, user=charlie).exists()

    # Re-invite after decline, then revoke by Alice
    charlie_inv2 = api_client.post(
        f"/api/v1/auth/workspaces/{alice_ws.id}/invites",
        data=json.dumps({"email": charlie.email, "role": "VIEWER"}),
        content_type="application/json",
        **_headers(alice_token),
    ).json()
    rev_resp = api_client.delete(
        f"/api/v1/auth/workspaces/{alice_ws.id}/invites/{charlie_inv2['id']}",
        **_headers(alice_token),
    )
    assert rev_resp.status_code == 204
    assert (
        api_client.post(
            f"/api/v1/auth/invites/{charlie_inv2['token']}/accept",
            **_headers(charlie_token),
        ).status_code
        == 410
    )

    # Expired invite returns 410 and allows subsequent re-invite
    expired_inv = WorkspaceInvitation.objects.create(
        workspace=alice_ws,
        invited_by=alice,
        email=charlie.email,
        role=WorkspaceInvitation.Role.VIEWER,
        expires_at=timezone.now() - timedelta(hours=1),
    )
    exp_resp = api_client.post(
        f"/api/v1/auth/invites/{expired_inv.token}/accept",
        **_headers(charlie_token),
    )
    assert exp_resp.status_code == 410

    reinvite_after_expiry = api_client.post(
        f"/api/v1/auth/workspaces/{alice_ws.id}/invites",
        data=json.dumps({"email": charlie.email, "role": "VIEWER"}),
        content_type="application/json",
        **_headers(alice_token),
    )
    assert reinvite_after_expiry.status_code == 201


@pytest.mark.django_db
def test_member_role_update_removal_and_leave_vault(api_client, user_a, user_b):
    alice, alice_ws, alice_token = user_a
    bob, _, bob_token = user_b

    membership = WorkspaceMembership.objects.create(
        workspace=alice_ws,
        user=bob,
        role=WorkspaceMembership.Role.EDITOR,
    )
    owner_membership = WorkspaceMembership.objects.get(workspace=alice_ws, user=alice)

    # Both owner and member can view members
    members_resp = api_client.get(
        f"/api/v1/auth/workspaces/{alice_ws.id}/members",
        **_headers(bob_token),
    )
    assert members_resp.status_code == 200
    assert len(members_resp.json()) == 2
    assert members_resp.json()[0]["is_owner"] is True

    # Bob cannot update roles or remove owner
    assert (
        api_client.patch(
            f"/api/v1/auth/workspaces/{alice_ws.id}/members/{membership.id}",
            data=json.dumps({"role": "VIEWER"}),
            content_type="application/json",
            **_headers(bob_token),
        ).status_code
        == 403
    )

    # Alice downgrades Bob to VIEWER
    patch_resp = api_client.patch(
        f"/api/v1/auth/workspaces/{alice_ws.id}/members/{membership.id}",
        data=json.dumps({"role": "VIEWER"}),
        content_type="application/json",
        **_headers(alice_token),
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["role"] == "VIEWER"

    # Owner cannot have role downgraded, removed, or leave own vault
    assert (
        api_client.patch(
            f"/api/v1/auth/workspaces/{alice_ws.id}/members/{owner_membership.id}",
            data=json.dumps({"role": "EDITOR"}),
            content_type="application/json",
            **_headers(alice_token),
        ).status_code
        == 400
    )
    assert (
        api_client.delete(
            f"/api/v1/auth/workspaces/{alice_ws.id}/members/{owner_membership.id}",
            **_headers(alice_token),
        ).status_code
        == 400
    )
    assert (
        api_client.post(
            f"/api/v1/auth/workspaces/{alice_ws.id}/leave",
            **_headers(alice_token),
        ).status_code
        == 400
    )

    # Bob leaves vault cleanly and prior signed media URLs for the vault are invalidated
    from config.media_signing import build_signed_media_url

    pre_leave_url = build_signed_media_url(f"workspaces/{alice_ws.id}/items/1/obv.png")
    leave_resp = api_client.post(
        f"/api/v1/auth/workspaces/{alice_ws.id}/leave",
        **_headers(bob_token),
    )
    assert leave_resp.status_code == 204
    assert api_client.get(pre_leave_url).status_code == 403
    assert (
        api_client.get(
            "/api/v1/catalog/items",
            **_headers(bob_token, alice_ws.id),
        ).status_code
        == 403
    )

    # Re-add and test owner removing member also rotates media_key_version and invalidates prior URLs
    membership2 = WorkspaceMembership.objects.create(
        workspace=alice_ws,
        user=bob,
        role=WorkspaceMembership.Role.VIEWER,
    )
    pre_remove_url = build_signed_media_url(f"workspaces/{alice_ws.id}/items/1/obv.png")
    del_resp = api_client.delete(
        f"/api/v1/auth/workspaces/{alice_ws.id}/members/{membership2.id}",
        **_headers(alice_token),
    )
    assert del_resp.status_code == 204
    assert api_client.get(pre_remove_url).status_code == 403
    assert not WorkspaceMembership.objects.filter(id=membership2.id).exists()


@pytest.mark.django_db
def test_rbac_matrix_viewer_read_only_and_editor_ai_without_key_exposure(
    api_client, user_a, user_b
):
    alice, alice_ws, alice_token = user_a
    bob, _, bob_token = user_b

    # Configure owner's Gemini key on default vault, plus an override vault for Alice
    cred = ProviderCredential.objects.create(
        workspace=alice_ws,
        provider=ProviderCredential.Provider.GEMINI,
    )
    cred.set_secret("AIzaOwnerSharedKey9999")
    cred.save()

    secondary_ws = Workspace.objects.create(
        name="Shared Family Collection",
        slug="shared-family-test",
        owner=alice,
        is_default=False,
    )
    WorkspaceMembership.objects.create(
        workspace=secondary_ws,
        user=alice,
        role=WorkspaceMembership.Role.OWNER,
    )
    container = Container.objects.create(workspace=secondary_ws, name="Safe #1")
    item = CollectionItem.objects.create(
        workspace=secondary_ws,
        container=container,
        category=CollectionItem.Category.COIN,
        title="1921 Morgan Dollar",
        year=1921,
        metal_type=CollectionItem.MetalType.SILVER,
        weight_value=Decimal("26.73"),
        weight_unit=CollectionItem.WeightUnit.G,
        purity=Decimal("0.900"),
    )
    photo = ItemPhoto.objects.create(
        workspace=secondary_ws,
        item=item,
        image=SimpleUploadedFile("obv.png", _make_png_bytes(), content_type="image/png"),
        label=ItemPhoto.Label.OBVERSE,
        is_primary=True,
    )

    bob_membership = WorkspaceMembership.objects.create(
        workspace=secondary_ws,
        user=bob,
        role=WorkspaceMembership.Role.VIEWER,
    )

    # --- VIEWER checks ---
    # Allowed reads + exports + spot refresh + workspace read settings
    assert (
        api_client.get(
            "/api/v1/catalog/items", **_headers(bob_token, secondary_ws.id)
        ).status_code
        == 200
    )
    assert (
        api_client.get(
            f"/api/v1/catalog/items/{item.id}", **_headers(bob_token, secondary_ws.id)
        ).status_code
        == 200
    )
    assert (
        api_client.get(
            "/api/v1/catalog/items/export/csv", **_headers(bob_token, secondary_ws.id)
        ).status_code
        == 200
    )
    assert (
        api_client.get(
            "/api/v1/catalog/items/export/json", **_headers(bob_token, secondary_ws.id)
        ).status_code
        == 200
    )
    assert (
        api_client.get(
            "/api/v1/catalog/items/export/insurance-report",
            **_headers(bob_token, secondary_ws.id),
        ).status_code
        == 200
    )
    assert (
        api_client.get(
            "/api/v1/settings/workspace", **_headers(bob_token, secondary_ws.id)
        ).status_code
        == 200
    )
    with patch(
        "apps.valuation.api.refresh_spot_prices",
        return_value={"GOLD": "2500.00", "SILVER": "30.00"},
    ):
        assert (
            api_client.post(
                "/api/v1/valuation/spots/refresh", **_headers(bob_token, secondary_ws.id)
            ).status_code
            == 200
        )

    # Blocked VIEWER mutations & owner settings
    viewer_forbidden = [
        ("post", "/api/v1/catalog/containers", json.dumps({"name": "Hack"}), "application/json"),
        ("patch", f"/api/v1/catalog/containers/{container.id}", json.dumps({"name": "Hack"}), "application/json"),
        ("delete", f"/api/v1/catalog/containers/{container.id}", None, None),
        ("post", "/api/v1/catalog/items", json.dumps({"category": "COIN", "title": "Hack"}), "application/json"),
        ("post", "/api/v1/catalog/items/bulk-delete", json.dumps({"item_ids": [str(item.id)]}), "application/json"),
        ("post", "/api/v1/catalog/items/bulk-update", json.dumps({"item_ids": [str(item.id)], "status": "SOLD"}), "application/json"),
        ("post", "/api/v1/catalog/items/resort", None, None),
        ("patch", f"/api/v1/catalog/items/{item.id}", json.dumps({"title": "Hack"}), "application/json"),
        ("post", f"/api/v1/catalog/items/{item.id}/duplicate", None, None),
        ("delete", f"/api/v1/catalog/items/{item.id}", None, None),
        ("post", f"/api/v1/catalog/items/{item.id}/photos/{photo.id}/rotate", json.dumps({"degrees": 90}), "application/json"),
        ("patch", f"/api/v1/catalog/items/{item.id}/photos/{photo.id}/primary", None, None),
        ("delete", f"/api/v1/catalog/items/{item.id}/photos/{photo.id}", None, None),
        ("post", f"/api/v1/valuation/items/{item.id}/appraise", None, None),
        ("patch", "/api/v1/settings/workspace", json.dumps({"name": "Stolen"}), "application/json"),
        ("get", "/api/v1/settings/credentials", None, None),
        ("put", "/api/v1/settings/credentials/GEMINI", json.dumps({"value": "bad"}), "application/json"),
        ("delete", "/api/v1/settings/credentials/GEMINI", None, None),
        ("patch", f"/api/v1/auth/workspaces/{secondary_ws.id}", json.dumps({"name": "Stolen"}), "application/json"),
        ("delete", f"/api/v1/auth/workspaces/{secondary_ws.id}", None, None),
    ]
    for method, url, body, ctype in viewer_forbidden:
        fn = getattr(api_client, method)
        kwargs = _headers(bob_token, secondary_ws.id)
        if body is not None:
            kwargs["data"] = body
        if ctype is not None:
            kwargs["content_type"] = ctype
        resp = fn(url, **kwargs)
        assert resp.status_code == 403, f"Expected 403 for VIEWER {method.upper()} {url}, got {resp.status_code}"

    # Multipart endpoints blocked for VIEWER
    upload_forbidden = api_client.post(
        f"/api/v1/catalog/items/{item.id}/photos",
        data={
            "label": "REVERSE",
            "file": SimpleUploadedFile("rev.png", _make_png_bytes(), content_type="image/png"),
        },
        **_headers(bob_token, secondary_ws.id),
    )
    assert upload_forbidden.status_code == 403

    csv_forbidden = api_client.post(
        "/api/v1/catalog/items/import/csv",
        data={
            "file": SimpleUploadedFile("items.csv", b"category,title\nCOIN,Test\n", content_type="text/csv"),
        },
        **_headers(bob_token, secondary_ws.id),
    )
    assert csv_forbidden.status_code == 403

    vision_forbidden = api_client.post(
        "/api/v1/vision/identify",
        data={
            "files": [SimpleUploadedFile("scan.png", _make_png_bytes(), content_type="image/png")],
        },
        **_headers(bob_token, secondary_ws.id),
    )
    assert vision_forbidden.status_code == 403

    # --- Upgrade Bob to EDITOR ---
    bob_membership.role = WorkspaceMembership.Role.EDITOR
    bob_membership.save(update_fields=["role"])

    # Still blocked from owner credentials & vault configuration
    assert (
        api_client.get(
            "/api/v1/settings/credentials", **_headers(bob_token, secondary_ws.id)
        ).status_code
        == 403
    )
    assert (
        api_client.patch(
            "/api/v1/settings/workspace",
            data=json.dumps({"name": "Nope"}),
            content_type="application/json",
            **_headers(bob_token, secondary_ws.id),
        ).status_code
        == 403
    )

    # Allowed catalog writes & duplicate
    create_resp = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps({"category": "COIN", "title": "Editor Added Coin"}),
        content_type="application/json",
        **_headers(bob_token, secondary_ws.id),
    )
    assert create_resp.status_code == 201
    dup_resp = api_client.post(
        f"/api/v1/catalog/items/{item.id}/duplicate",
        **_headers(bob_token, secondary_ws.id),
    )
    assert dup_resp.status_code == 201

    # Editor AI identify & appraisal succeed using owner's inherited key without reading secret endpoint
    with patch("apps.vision.api.identify_images") as mock_identify:
        mock_identify.return_value = {"candidates": [], "used_providers": ["GEMINI"]}
        id_resp = api_client.post(
            "/api/v1/vision/identify",
            data={
                "files": [SimpleUploadedFile("scan.png", _make_png_bytes(), content_type="image/png")],
            },
            **_headers(bob_token, secondary_ws.id),
        )
        assert id_resp.status_code == 200
        assert mock_identify.call_args.args[1].id == secondary_ws.id

    with patch("apps.valuation.services.appraise_item") as mock_eval:
        mock_eval.return_value = None
        from apps.valuation.services import _get_workspace_secret

        assert (
            _get_workspace_secret(secondary_ws, ProviderCredential.Provider.GEMINI)
            == "AIzaOwnerSharedKey9999"
        )
        appraise_resp = api_client.post(
            f"/api/v1/valuation/items/{item.id}/appraise?sync=true",
            **_headers(bob_token, secondary_ws.id),
        )
        assert appraise_resp.status_code == 200

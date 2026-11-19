from __future__ import annotations

import json
from datetime import UTC, datetime
from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts.auth import issue_access_token
from apps.accounts.models import (
    AccountSubscription,
    DedicatedServerInstance,
    PlanTier,
    User,
    Workspace,
    WorkspaceInvitation,
    WorkspaceMembership,
    create_default_workspace_for_user,
)
from apps.catalog.models import CollectionItem


def _headers(token: str, workspace_id=None) -> dict[str, str]:
    h = {"HTTP_AUTHORIZATION": f"Bearer {token}"}
    if workspace_id is not None:
        h["HTTP_X_WORKSPACE_ID"] = str(workspace_id)
    return h


@pytest.mark.django_db
def test_public_plans_and_default_free_status(api_client, user_a):
    _, _, token = user_a

    plans_resp = api_client.get("/api/v1/billing/plans")
    assert plans_resp.status_code == 200
    plans = plans_resp.json()
    assert [p["tier"] for p in plans] == ["FREE", "PLUS", "UNLIMITED", "DEDICATED"]
    assert plans[0]["max_vaults"] == 1
    assert plans[0]["max_items"] == 100
    assert plans[1]["monthly_price_cents"] == 999
    assert plans[1]["max_vaults"] == 10
    assert plans[1]["max_items"] is None
    assert plans[2]["monthly_price_cents"] == 1999
    assert plans[3]["monthly_price_cents"] == 9999
    assert plans[3]["dedicated_server"] is True

    status_resp = api_client.get("/api/v1/billing/status", **_headers(token))
    assert status_resp.status_code == 200
    st = status_resp.json()
    assert st["tier"] == "FREE"
    assert st["max_vaults"] == 1
    assert st["max_items"] == 100
    assert st["owned_vault_count"] == 1
    assert st["active_item_count"] == 0
    assert st["enforce_tiers"] is True

    me = api_client.get("/api/v1/auth/me", **_headers(token)).json()
    assert me["plan"]["tier"] == "FREE"
    assert me["plan"]["max_vaults"] == 1
    assert me["plan"]["max_items"] == 100


@pytest.mark.django_db
def test_billing_enforce_tiers_false_bypasses_all_caps(api_client, user_a, settings):
    settings.BILLING_ENFORCE_TIERS = False
    alice, ws, token = user_a

    st = api_client.get("/api/v1/billing/status", **_headers(token)).json()
    assert st["enforce_tiers"] is False
    assert st["max_vaults"] is None
    assert st["max_items"] is None

    # Create additional owned vault without paid upgrade
    resp = api_client.post(
        "/api/v1/auth/workspaces",
        data=json.dumps({"name": "Self Hosted Secondary"}),
        content_type="application/json",
        **_headers(token),
    )
    assert resp.status_code == 201

    CollectionItem.objects.bulk_create(
        [
            CollectionItem(
                workspace=ws,
                title=f"Item {i}",
                status=CollectionItem.Status.IN_COLLECTION,
            )
            for i in range(105)
        ]
    )
    over_cap = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps({"category": "COIN", "title": "106th Unmetered"}),
        content_type="application/json",
        **_headers(token, ws.id),
    )
    assert over_cap.status_code == 201


@pytest.mark.django_db
def test_owned_vault_limits_and_shared_collaborator_exemption(api_client, user_a, user_b):
    alice, _, alice_token = user_a
    bob, _, bob_token = user_b

    # FREE user already has 1 default vault -> creating 2nd returns 402
    blocked = api_client.post(
        "/api/v1/auth/workspaces",
        data=json.dumps({"name": "Extra Vault"}),
        content_type="application/json",
        **_headers(alice_token),
    )
    assert blocked.status_code == 402
    body = blocked.json()
    assert body["code"] == "PLAN_LIMIT_REACHED"
    assert body["limit_type"] == "vaults"
    assert body["limit"] == 1
    assert body["current_usage"] == 1
    assert body["current_tier"] == "FREE"

    # Shared vaults accepted by a FREE user do NOT count against owned-vault limit
    for idx in range(3):
        ext_ws = Workspace.objects.create(
            name=f"Shared From Bob {idx}",
            slug=f"shared-bob-{idx}",
            owner=bob,
            is_default=False,
        )
        inv = WorkspaceInvitation.objects.create(
            workspace=ext_ws,
            invited_by=bob,
            email=alice.email,
            role=WorkspaceInvitation.Role.EDITOR,
        )
        acc = api_client.post(
            f"/api/v1/auth/invites/{inv.token}/accept",
            **_headers(alice_token),
        )
        assert acc.status_code == 200

    # Alice upgrades to PLUS -> can create up to 10 total owned vaults, 11th -> 402
    AccountSubscription.objects.update_or_create(
        user=alice,
        defaults={
            "tier": PlanTier.PLUS,
            "source": AccountSubscription.Source.STRIPE,
            "status": AccountSubscription.Status.ACTIVE,
        },
    )
    for n in range(2, 11):
        ok_ws = api_client.post(
            "/api/v1/auth/workspaces",
            data=json.dumps({"name": f"Vault #{n}"}),
            content_type="application/json",
            **_headers(alice_token),
        )
        assert ok_ws.status_code == 201

    vault_11 = api_client.post(
        "/api/v1/auth/workspaces",
        data=json.dumps({"name": "Vault #11"}),
        content_type="application/json",
        **_headers(alice_token),
    )
    assert vault_11.status_code == 402
    assert vault_11.json()["limit"] == 10

    # UNLIMITED allows creating past 10
    AccountSubscription.objects.filter(user=alice).update(tier=PlanTier.UNLIMITED)
    vault_unlim = api_client.post(
        "/api/v1/auth/workspaces",
        data=json.dumps({"name": "Vault #11 Unlimited"}),
        content_type="application/json",
        **_headers(alice_token),
    )
    assert vault_unlim.status_code == 201


@pytest.mark.django_db
def test_active_item_quotas_csv_imports_sold_downgrade_and_shared_owner_eval(
    api_client, user_a, user_b
):
    alice, alice_ws, alice_token = user_a
    bob, _, bob_token = user_b

    # 95 active entries (including multi-unit tube counted as 1 entry) + 3 SOLD items
    CollectionItem.objects.bulk_create(
        [
            CollectionItem(
                workspace=alice_ws,
                title=f"Eagle #{i}",
                quantity=20 if i == 0 else 1,
                status=CollectionItem.Status.IN_COLLECTION,
            )
            for i in range(95)
        ]
    )
    sold_item = CollectionItem.objects.create(
        workspace=alice_ws,
        title="Sold Sovereign",
        status=CollectionItem.Status.SOLD,
    )

    # CSV import with 10 active rows -> creates first 5 (reaches 100), records 5 quota errors
    csv_lines = ["category,title,status"] + [
        f"COIN,CSV Coin {idx},IN_COLLECTION" for idx in range(10)
    ]
    partial_import = api_client.post(
        "/api/v1/catalog/items/import/csv",
        data={
            "file": SimpleUploadedFile(
                "batch.csv",
                "\n".join(csv_lines).encode("utf-8"),
                content_type="text/csv",
            )
        },
        **_headers(alice_token, alice_ws.id),
    )
    assert partial_import.status_code == 200
    imp_body = partial_import.json()
    assert imp_body["created_count"] == 5
    assert len(imp_body["errors"]) == 5

    # Now at 100 active items: creating, duplicating, reactivating SOLD, and full mapped/raw CSV import -> 402
    assert (
        api_client.post(
            "/api/v1/catalog/items",
            data=json.dumps({"category": "COIN", "title": "101st Blocked"}),
            content_type="application/json",
            **_headers(alice_token, alice_ws.id),
        ).status_code
        == 402
    )
    existing_item = CollectionItem.objects.filter(
        workspace=alice_ws, status=CollectionItem.Status.IN_COLLECTION
    ).first()
    assert (
        api_client.post(
            f"/api/v1/catalog/items/{existing_item.id}/duplicate",
            **_headers(alice_token, alice_ws.id),
        ).status_code
        == 402
    )
    assert (
        api_client.patch(
            f"/api/v1/catalog/items/{sold_item.id}",
            data=json.dumps({"status": "IN_COLLECTION"}),
            content_type="application/json",
            **_headers(alice_token, alice_ws.id),
        ).status_code
        == 402
    )
    assert (
        api_client.post(
            "/api/v1/catalog/items/bulk-update",
            data=json.dumps(
                {"item_ids": [str(sold_item.id)], "status": "IN_COLLECTION"}
            ),
            content_type="application/json",
            **_headers(alice_token, alice_ws.id),
        ).status_code
        == 402
    )

    # Full-zero mapped CSV import returns HTTP 402
    assert (
        api_client.post(
            "/api/v1/catalog/items/import/mapped",
            data={
                "file": SimpleUploadedFile(
                    "mapped.csv",
                    b"title,category\nMapped Overflow,COIN\n",
                    content_type="text/csv",
                )
            },
            **_headers(alice_token, alice_ws.id),
        ).status_code
        == 402
    )

    # Creating a SOLD item while at 100 active is still permitted!
    sold_create = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps(
            {"category": "COIN", "title": "Already Sold Record", "status": "SOLD"}
        ),
        content_type="application/json",
        **_headers(alice_token, alice_ws.id),
    )
    assert sold_create.status_code == 201

    # Upgrade to PLUS -> add items above 100, share with FREE Bob (EDITOR) who can also add!
    AccountSubscription.objects.update_or_create(
        user=alice,
        defaults={
            "tier": PlanTier.PLUS,
            "source": AccountSubscription.Source.STRIPE,
            "status": AccountSubscription.Status.ACTIVE,
        },
    )
    WorkspaceMembership.objects.create(
        workspace=alice_ws,
        user=bob,
        role=WorkspaceMembership.Role.EDITOR,
    )
    bob_add = api_client.post(
        "/api/v1/catalog/items",
        data=json.dumps({"category": "COIN", "title": "Shared 101st via Owner PLUS"}),
        content_type="application/json",
        **_headers(bob_token, alice_ws.id),
    )
    assert bob_add.status_code == 201

    # Downgrade Alice back to FREE: all 101 items retained, readable & editable, no deletions
    AccountSubscription.objects.filter(user=alice).update(
        tier=PlanTier.FREE,
        status=AccountSubscription.Status.CANCELED,
    )
    assert (
        api_client.get(
            f"/api/v1/catalog/items/{existing_item.id}",
            **_headers(alice_token, alice_ws.id),
        ).status_code
        == 200
    )
    assert (
        api_client.patch(
            f"/api/v1/catalog/items/{existing_item.id}",
            data=json.dumps({"notes": "Still editable after downgrade"}),
            content_type="application/json",
            **_headers(alice_token, alice_ws.id),
        ).status_code
        == 200
    )
    assert (
        api_client.post(
            "/api/v1/catalog/items",
            data=json.dumps({"category": "COIN", "title": "102nd Blocked"}),
            content_type="application/json",
            **_headers(alice_token, alice_ws.id),
        ).status_code
        == 402
    )


@pytest.mark.django_db
def test_stripe_checkout_portal_webhook_and_override_precedence(
    api_client, user_a, settings
):
    alice, _, alice_token = user_a

    # Missing Stripe keys -> 503
    settings.STRIPE_SECRET_KEY = ""
    settings.STRIPE_WEBHOOK_SECRET = ""
    assert (
        api_client.post(
            "/api/v1/billing/checkout",
            data=json.dumps({"tier": "PLUS"}),
            content_type="application/json",
            **_headers(alice_token),
        ).status_code
        == 503
    )
    assert (
        api_client.post("/api/v1/billing/portal", **_headers(alice_token)).status_code
        == 503
    )
    assert (
        api_client.post(
            "/api/v1/billing/webhook",
            data=b"{}",
            content_type="application/json",
        ).status_code
        == 503
    )

    # Configure Stripe test secrets & price IDs
    settings.STRIPE_SECRET_KEY = "sk_test_123"
    settings.STRIPE_WEBHOOK_SECRET = "whsec_123"
    settings.STRIPE_PRICE_PLUS = "price_plus_999"
    settings.STRIPE_PRICE_UNLIMITED = "price_unlim_1999"
    settings.STRIPE_PRICE_DEDICATED = "price_ded_9999"

    with (
        patch(
            "apps.accounts.billing_api.stripe.Customer.create",
            return_value={"id": "cus_alice_123"},
        ) as mock_cust,
        patch(
            "apps.accounts.billing_api.stripe.checkout.Session.create",
            return_value={"id": "cs_test_1", "url": "https://checkout.stripe.com/pay/cs_test_1"},
        ) as mock_sess,
    ):
        co_resp = api_client.post(
            "/api/v1/billing/checkout",
            data=json.dumps({"tier": "DEDICATED", "requested_subdomain": "alice-vault"}),
            content_type="application/json",
            **_headers(alice_token),
        )
        assert co_resp.status_code == 200
        assert co_resp.json()["url"] == "https://checkout.stripe.com/pay/cs_test_1"
        assert mock_cust.called
        assert mock_sess.called
        assert DedicatedServerInstance.objects.filter(
            user=alice, requested_subdomain="alice-vault"
        ).exists()

    with patch(
        "apps.accounts.billing_api.stripe.billing_portal.Session.create",
        return_value={"url": "https://billing.stripe.com/session/bps_1"},
    ):
        portal_resp = api_client.post("/api/v1/billing/portal", **_headers(alice_token))
        assert portal_resp.status_code == 200
        assert portal_resp.json()["url"] == "https://billing.stripe.com/session/bps_1"

    # Invalid webhook signature -> 400
    with patch(
        "apps.accounts.billing_api.stripe.Webhook.construct_event",
        side_effect=ValueError("bad sig"),
    ):
        bad_wh = api_client.post(
            "/api/v1/billing/webhook",
            data=b"{}",
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="invalid",
        )
        assert bad_wh.status_code == 400

    # Valid checkout.session.completed upgrades tier to UNLIMITED
    completed_event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "customer": "cus_alice_123",
                "subscription": "sub_alice_123",
                "metadata": {"user_id": str(alice.id), "tier": "UNLIMITED"},
            }
        },
    }
    with patch(
        "apps.accounts.billing_api.stripe.Webhook.construct_event",
        return_value=completed_event,
    ):
        wh_ok = api_client.post(
            "/api/v1/billing/webhook",
            data=json.dumps(completed_event),
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="sig_ok",
        )
        assert wh_ok.status_code == 200

    sub = AccountSubscription.objects.get(user=alice)
    assert sub.tier == PlanTier.UNLIMITED
    assert sub.source == AccountSubscription.Source.STRIPE

    # customer.subscription.updated -> DEDICATED creates DedicatedServerInstance
    period_ts = int(datetime(2027, 1, 1, tzinfo=UTC).timestamp())
    updated_event = {
        "type": "customer.subscription.updated",
        "data": {
            "object": {
                "id": "sub_alice_123",
                "customer": "cus_alice_123",
                "status": "active",
                "cancel_at_period_end": False,
                "current_period_end": period_ts,
                "items": {"data": [{"price": {"id": "price_ded_9999"}}]},
            }
        },
    }
    with patch(
        "apps.accounts.billing_api.stripe.Webhook.construct_event",
        return_value=updated_event,
    ):
        assert (
            api_client.post(
                "/api/v1/billing/webhook",
                data=b"{}",
                content_type="application/json",
                HTTP_STRIPE_SIGNATURE="sig_ok",
            ).status_code
            == 200
        )

    sub.refresh_from_db()
    assert sub.tier == PlanTier.DEDICATED
    assert DedicatedServerInstance.objects.filter(user=alice).exists()

    # Global Admin sets ADMIN_OVERRIDE -> subsequent customer.subscription.deleted preserves override
    sub.source = AccountSubscription.Source.ADMIN_OVERRIDE
    sub.tier = PlanTier.DEDICATED
    sub.save()

    deleted_event = {
        "type": "customer.subscription.deleted",
        "data": {"object": {"id": "sub_alice_123", "customer": "cus_alice_123"}},
    }
    with patch(
        "apps.accounts.billing_api.stripe.Webhook.construct_event",
        return_value=deleted_event,
    ):
        assert (
            api_client.post(
                "/api/v1/billing/webhook",
                data=b"{}",
                content_type="application/json",
                HTTP_STRIPE_SIGNATURE="sig_ok",
            ).status_code
            == 200
        )

    sub.refresh_from_db()
    assert sub.tier == PlanTier.DEDICATED
    assert sub.source == AccountSubscription.Source.ADMIN_OVERRIDE

    # Normal Stripe subscription deletion (non-override) reverts to FREE
    sub.source = AccountSubscription.Source.STRIPE
    sub.save()
    with patch(
        "apps.accounts.billing_api.stripe.Webhook.construct_event",
        return_value=deleted_event,
    ):
        assert (
            api_client.post(
                "/api/v1/billing/webhook",
                data=b"{}",
                content_type="application/json",
                HTTP_STRIPE_SIGNATURE="sig_ok",
            ).status_code
            == 200
        )

    sub.refresh_from_db()
    assert sub.tier == PlanTier.FREE
    assert sub.status == AccountSubscription.Status.CANCELED


@pytest.mark.django_db
def test_delete_account_with_subscription_and_dedicated_instance(api_client):
    user = User.objects.create_user(email="cleanup@example.com", password="Password123!")
    create_default_workspace_for_user(user, name="Temp Vault")
    AccountSubscription.objects.create(user=user, tier=PlanTier.DEDICATED)
    DedicatedServerInstance.objects.create(user=user, requested_subdomain="temp")
    token = issue_access_token(user)

    resp = api_client.delete(
        "/api/v1/auth/me",
        data=json.dumps({"password": "Password123!"}),
        content_type="application/json",
        **_headers(token),
    )
    assert resp.status_code == 204
    assert not User.objects.filter(email="cleanup@example.com").exists()

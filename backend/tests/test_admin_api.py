import json
from decimal import Decimal

import pytest

from apps.accounts.auth import issue_access_token
from apps.accounts.models import User, create_default_workspace_for_user
from apps.catalog.models import CollectionItem


@pytest.mark.django_db
def test_admin_endpoints_reject_non_staff(client):
    user = User.objects.create_user(email="collector@example.com", password="password123")
    create_default_workspace_for_user(user)
    token = issue_access_token(user)
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    assert client.get("/api/v1/admin/overview", **headers).status_code == 403
    assert client.get("/api/v1/admin/users", **headers).status_code == 403
    assert client.get("/api/v1/admin/workspaces", **headers).status_code == 403


@pytest.mark.django_db
def test_global_admin_overview_users_and_workspaces(client):
    admin = User.objects.create_superuser(
        email="admin@stackerstash.com",
        password="password123",
        display_name="Global Admin",
    )
    admin_ws = create_default_workspace_for_user(admin, name="Admin Vault")

    member = User.objects.create_user(
        email="stacker@example.com",
        password="password123",
        display_name="Silver Stacker",
    )
    member_ws = create_default_workspace_for_user(member, name="Silver Safe")
    CollectionItem.objects.create(
        workspace=member_ws,
        title="2024 American Silver Eagle",
        category=CollectionItem.Category.COIN,
        metal_type=CollectionItem.MetalType.SILVER,
        quantity=10,
        melt_value_unit=Decimal("30.00"),
        market_value_unit=Decimal("35.00"),
    )

    token = issue_access_token(admin)
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    overview = client.get("/api/v1/admin/overview", **headers)
    assert overview.status_code == 200
    data = overview.json()
    assert data["total_users"] == 2
    assert data["active_users"] == 2
    assert data["admin_users"] == 1
    assert data["total_workspaces"] == 2
    assert data["total_items"] == 1
    assert data["total_market_value"] == "350.00"
    assert data["total_melt_value"] == "300.00"

    users_resp = client.get("/api/v1/admin/users?q=Silver", **headers)
    assert users_resp.status_code == 200
    users = users_resp.json()
    assert len(users) == 1
    assert users[0]["email"] == "stacker@example.com"
    assert users[0]["total_market_value"] == "350.00"

    # Suspend member
    patch_resp = client.patch(
        f"/api/v1/admin/users/{member.id}",
        data={"is_active": False, "is_staff": True},
        content_type="application/json",
        **headers,
    )
    assert patch_resp.status_code == 200
    patched = patch_resp.json()
    assert patched["is_active"] is False
    assert patched["is_staff"] is True

    # Cannot self-deactivate
    self_patch = client.patch(
        f"/api/v1/admin/users/{admin.id}",
        data={"is_active": False},
        content_type="application/json",
        **headers,
    )
    assert self_patch.status_code == 400

    # Workspaces list
    ws_resp = client.get("/api/v1/admin/workspaces", **headers)
    assert ws_resp.status_code == 200
    workspaces = ws_resp.json()
    assert len(workspaces) == 2
    assert any(w["id"] == str(admin_ws.id) for w in workspaces)


@pytest.mark.django_db
def test_admin_overview_reports_background_job_and_dependency_health(client):
    from apps.valuation.models import AppraisalJob
    from apps.vision.models import IdentificationJob

    admin = User.objects.create_superuser(email="ops@stackerstash.com", password="password123")
    ws = create_default_workspace_for_user(admin, name="Ops Vault")
    item = CollectionItem.objects.create(
        workspace=ws,
        title="Queued Eagle",
        ai_enrichment_pending=True,
    )
    AppraisalJob.objects.create(workspace=ws, item=item, status=AppraisalJob.Status.PENDING)
    AppraisalJob.objects.create(workspace=ws, item=item, status=AppraisalJob.Status.RUNNING)
    AppraisalJob.objects.create(workspace=ws, item=item, status=AppraisalJob.Status.FAILED)
    IdentificationJob.objects.create(workspace=ws, provider_used="mock")

    token = issue_access_token(admin)
    resp = client.get("/api/v1/admin/overview", HTTP_AUTHORIZATION=f"Bearer {token}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["pending_appraisals"] == 1
    assert body["running_appraisals"] == 1
    assert body["failed_appraisals_24h"] == 1
    assert body["deferred_ai_items"] == 1
    assert body["recent_identifications_24h"] == 1
    assert body["db_healthy"] is True
    assert isinstance(body["redis_healthy"], bool)


@pytest.mark.django_db
def test_admin_user_aggregates_metrics_across_multiple_vaults(client):
    from apps.accounts.models import Workspace, WorkspaceMembership
    from apps.catalog.models import Container

    admin = User.objects.create_superuser(email="multi_admin@stackerstash.com", password="password123")
    create_default_workspace_for_user(admin, name="Ops Vault")

    collector = User.objects.create_user(email="multivault@example.com", password="password123")
    v1 = create_default_workspace_for_user(collector, name="Personal")
    v2 = Workspace.objects.create(name="IRA Bullion", slug="ira-bullion", owner=collector, is_default=False)
    v3 = Workspace.objects.create(name="Trading Cards", slug="trading-cards", owner=collector, is_default=False)
    WorkspaceMembership.objects.create(workspace=v2, user=collector, role=WorkspaceMembership.Role.OWNER)
    WorkspaceMembership.objects.create(workspace=v3, user=collector, role=WorkspaceMembership.Role.OWNER)

    Container.objects.create(workspace=v1, name="Safe 1")
    Container.objects.create(workspace=v2, name="Safe 2")
    CollectionItem.objects.create(workspace=v1, title="Eagle", quantity=2, market_value_unit=Decimal("35.00"))
    CollectionItem.objects.create(workspace=v2, title="Buffalo", quantity=1, market_value_unit=Decimal("2600.00"))
    CollectionItem.objects.create(workspace=v3, title="Charizard", quantity=1, market_value_unit=Decimal("300.00"))

    token = issue_access_token(admin)
    resp = client.get("/api/v1/admin/users?q=multivault", HTTP_AUTHORIZATION=f"Bearer {token}")
    assert resp.status_code == 200
    row = resp.json()[0]
    assert row["workspace_count"] == 3
    assert row["primary_workspace"]["id"] == str(v1.id)
    assert row["item_count"] == 3
    assert row["container_count"] == 2
    assert row["total_market_value"] == "2970.00"
    assert row["tier"] == "FREE"
    assert row["owned_vault_count"] == 3
    assert row["active_item_count"] == 3


@pytest.mark.django_db
def test_admin_subscription_overrides_and_dedicated_instances(client):
    import json

    from apps.accounts.models import DedicatedServerInstance, PlanTier

    admin = User.objects.create_superuser(email="sub_admin@stackerstash.com", password="password123")
    create_default_workspace_for_user(admin, name="Ops Vault")
    collector = User.objects.create_user(email="vip@example.com", password="password123")
    create_default_workspace_for_user(collector, name="VIP Vault")

    headers = {"HTTP_AUTHORIZATION": f"Bearer {issue_access_token(admin)}"}

    # Override user to DEDICATED with subdomain
    patch_sub = client.patch(
        f"/api/v1/admin/users/{collector.id}/subscription",
        data=json.dumps({
            "tier": "DEDICATED",
            "requested_subdomain": "vip-stash",
            "admin_notes": "Enterprise onboarding",
        }),
        content_type="application/json",
        **headers,
    )
    assert patch_sub.status_code == 200
    sub_data = patch_sub.json()
    assert sub_data["tier"] == PlanTier.DEDICATED
    assert sub_data["subscription_source"] == "ADMIN_OVERRIDE"

    # Dedicated server instance automatically created & listed
    inst_resp = client.get("/api/v1/admin/dedicated-instances", **headers)
    assert inst_resp.status_code == 200
    instances = inst_resp.json()
    assert len(instances) == 1
    inst_id = instances[0]["id"]
    assert instances[0]["status"] == DedicatedServerInstance.Status.REQUESTED
    assert instances[0]["requested_subdomain"] == "vip-stash"

    # Reject bad URL
    assert (
        client.patch(
            f"/api/v1/admin/dedicated-instances/{inst_id}",
            data=json.dumps({"dedicated_url": "javascript:alert(1)"}),
            content_type="application/json",
            **headers,
        ).status_code
        == 400
    )

    # Mark ACTIVE with dedicated HTTPS URL
    act_resp = client.patch(
        f"/api/v1/admin/dedicated-instances/{inst_id}",
        data=json.dumps({
            "status": "ACTIVE",
            "dedicated_url": "https://vip.stackerstash.com",
            "admin_notes": "Deployed on dedicated node",
        }),
        content_type="application/json",
        **headers,
    )
    assert act_resp.status_code == 200
    act = act_resp.json()
    assert act["status"] == "ACTIVE"
    assert act["dedicated_url"] == "https://vip.stackerstash.com"
    assert act["provisioned_at"] is not None

    # Clear override reverts back to FREE
    clr_resp = client.patch(
        f"/api/v1/admin/users/{collector.id}/subscription",
        data=json.dumps({"clear_override": True}),
        content_type="application/json",
        **headers,
    )
    assert clr_resp.status_code == 200
    assert clr_resp.json()["tier"] == "FREE"
    assert clr_resp.json()["subscription_source"] == "DEFAULT"


@pytest.mark.django_db
def test_admin_filters_validation_and_edge_branches(client):
    from apps.accounts.models import AccountSubscription, DedicatedServerInstance, PlanTier

    su = User.objects.create_superuser(
        email="su-edge@stackerstash.com", password="password123", display_name="SU"
    )
    staff = User.objects.create_user(
        email="staff-edge@stackerstash.com", password="password123", is_staff=True
    )
    inactive = User.objects.create_user(
        email="inactive-edge@example.com", password="password123", is_active=False
    )
    create_default_workspace_for_user(su, name="SU Vault")
    create_default_workspace_for_user(staff, name="Staff Vault")

    su_headers = {"HTTP_AUTHORIZATION": f"Bearer {issue_access_token(su)}"}
    staff_headers = {"HTTP_AUTHORIZATION": f"Bearer {issue_access_token(staff)}"}
    bad_headers = {"HTTP_AUTHORIZATION": "Bearer invalid.jwt.token"}

    # Invalid JWT hits GlobalAdminAuth None return (line 39)
    assert client.get("/api/v1/admin/overview", **bad_headers).status_code == 401

    # Filter status branches (active, inactive, admins) + user with no workspaces (lines 173, 186)
    assert any(
        u["email"] == "inactive-edge@example.com" and u["primary_workspace"] is None
        for u in client.get("/api/v1/admin/users?status=inactive", **su_headers).json()
    )
    assert len(client.get("/api/v1/admin/users?status=active", **su_headers).json()) >= 2
    assert len(client.get("/api/v1/admin/users?status=admins", **su_headers).json()) >= 2

    # Workspaces query filter (line 303)
    assert len(client.get("/api/v1/admin/workspaces?q=Staff", **su_headers).json()) == 1

    # Missing user & permission guards on PATCH /users/{id}
    missing_id = "00000000-0000-0000-0000-000000000077"
    assert (
        client.patch(
            f"/api/v1/admin/users/{missing_id}",
            data=json.dumps({"display_name": "Nope"}),
            content_type="application/json",
            **su_headers,
        ).status_code
        == 404
    )
    # Non-superuser staff cannot strip own staff flag (lines 275-276)
    assert (
        client.patch(
            f"/api/v1/admin/users/{staff.id}",
            data=json.dumps({"is_staff": False}),
            content_type="application/json",
            **staff_headers,
        ).status_code
        == 400
    )
    # Non-superuser staff cannot deactivate superuser (line 279)
    assert (
        client.patch(
            f"/api/v1/admin/users/{su.id}",
            data=json.dumps({"is_active": False}),
            content_type="application/json",
            **staff_headers,
        ).status_code
        == 403
    )
    # Update display_name (lines 289-290)
    dn_resp = client.patch(
        f"/api/v1/admin/users/{inactive.id}",
        data=json.dumps({"display_name": "  Renamed Collector  "}),
        content_type="application/json",
        **su_headers,
    )
    assert dn_resp.status_code == 200 and dn_resp.json()["display_name"] == "Renamed Collector"

    # Subscription patch: 404, invalid tier 400, clear_override preserving Stripe subscription_id (line 366)
    assert (
        client.patch(
            f"/api/v1/admin/users/{missing_id}/subscription",
            data=json.dumps({"tier": "PLUS"}),
            content_type="application/json",
            **su_headers,
        ).status_code
        == 404
    )
    assert (
        client.patch(
            f"/api/v1/admin/users/{staff.id}/subscription",
            data=json.dumps({"tier": "NONEXISTENT"}),
            content_type="application/json",
            **su_headers,
        ).status_code
        == 400
    )
    AccountSubscription.objects.update_or_create(
        user=staff,
        defaults={
            "tier": PlanTier.PLUS,
            "source": AccountSubscription.Source.ADMIN_OVERRIDE,
            "stripe_subscription_id": "sub_existing_123",
        },
    )
    clr = client.patch(
        f"/api/v1/admin/users/{staff.id}/subscription",
        data=json.dumps({"clear_override": True}),
        content_type="application/json",
        **su_headers,
    )
    assert clr.status_code == 200 and clr.json()["subscription_source"] == "STRIPE"

    # Dedicated instance 404 and invalid status 400
    assert (
        client.patch(
            f"/api/v1/admin/dedicated-instances/{missing_id}",
            data=json.dumps({"status": "ACTIVE"}),
            content_type="application/json",
            **su_headers,
        ).status_code
        == 404
    )
    inst = DedicatedServerInstance.objects.create(user=staff)
    assert (
        client.patch(
            f"/api/v1/admin/dedicated-instances/{inst.id}",
            data=json.dumps({"status": "BOGUS"}),
            content_type="application/json",
            **su_headers,
        ).status_code
        == 400
    )


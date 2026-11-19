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

from __future__ import annotations

import pytest
from django.test import Client

from apps.accounts.auth import issue_access_token
from apps.accounts.models import User, create_default_workspace_for_user


@pytest.fixture(autouse=True)
def _media_root(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path / "media"


@pytest.fixture
def api_client() -> Client:
    return Client()


@pytest.fixture
def user_a(db):
    user = User.objects.create_user(email="alice@example.com", password="StrongPassword123!")
    ws = create_default_workspace_for_user(user, name="Alice")
    return user, ws, issue_access_token(user)


@pytest.fixture
def user_b(db):
    user = User.objects.create_user(email="bob@example.com", password="StrongPassword123!")
    ws = create_default_workspace_for_user(user, name="Bob")
    return user, ws, issue_access_token(user)


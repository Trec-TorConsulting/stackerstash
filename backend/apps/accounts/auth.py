from __future__ import annotations

import time
from typing import Any

import jwt
from django.conf import settings
from django.http import HttpRequest
from ninja.security import HttpBearer

from .models import User, Workspace, WorkspaceMembership


def issue_access_token(user: User) -> str:
    """Issue a signed HS256 JWT for the authenticated user."""
    now = int(time.time())
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "iat": now,
        "exp": now + settings.JWT_ACCESS_TTL_SECONDS,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def decode_access_token(token: str) -> dict[str, Any] | None:
    """Decode and validate an HS256 JWT access token."""
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


def resolve_user_workspace(user: User, workspace_id: str | None = None) -> Workspace | None:
    """Return the requested workspace if the user is a member, else their primary workspace."""
    memberships = WorkspaceMembership.objects.select_related("workspace").filter(user=user)
    if workspace_id:
        match = memberships.filter(workspace_id=workspace_id).first()
        return match.workspace if match else None
    first = memberships.order_by("created_at").first()
    return first.workspace if first else None


class WorkspaceAuth(HttpBearer):
    """Bearer JWT authentication that binds `request.auth_user` and `request.workspace`."""

    def authenticate(self, request: HttpRequest, token: str) -> User | None:
        payload = decode_access_token(token)
        if not payload or "sub" not in payload:
            return None
        user = User.objects.filter(id=payload["sub"], is_active=True).first()
        if not user:
            return None

        requested_ws_id = request.headers.get("X-Workspace-Id")
        workspace = resolve_user_workspace(user, requested_ws_id)
        if not workspace:
            return None

        request.user = user
        request.workspace = workspace  # type: ignore[attr-defined]
        return user


from __future__ import annotations

import time
import uuid
from typing import Any

import jwt
from django.conf import settings
from django.http import HttpRequest
from ninja.errors import HttpError
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
    """Return the requested workspace if the user is a member, else their default workspace."""
    memberships = WorkspaceMembership.objects.select_related("workspace").filter(user=user)
    if workspace_id:
        match = memberships.filter(workspace_id=workspace_id).first()
        return match.workspace if match else None
    preferred = memberships.order_by("-workspace__is_default", "created_at").first()
    return preferred.workspace if preferred else None


class WorkspaceAuth(HttpBearer):
    """Bearer JWT authentication that binds `request.user` and `request.workspace`."""

    def authenticate(self, request: HttpRequest, token: str) -> User | None:
        payload = decode_access_token(token)
        if not payload or "sub" not in payload:
            return None
        user = User.objects.filter(id=payload["sub"], is_active=True).first()
        if not user:
            return None

        requested_ws_id = (request.headers.get("X-Workspace-Id") or "").strip()
        if requested_ws_id:
            try:
                parsed_ws_id = str(uuid.UUID(requested_ws_id))
            except ValueError as exc:
                raise HttpError(400, "Invalid X-Workspace-Id header.") from exc
            workspace = resolve_user_workspace(user, parsed_ws_id)
            if workspace is None:
                raise HttpError(403, "Workspace access denied or vault unavailable.")
        else:
            workspace = resolve_user_workspace(user, None)
            if workspace is None:
                return None

        request.user = user
        request.workspace = workspace  # type: ignore[attr-defined]
        return user


from __future__ import annotations

import time
import uuid
from typing import Any

import jwt
from django.conf import settings
from django.db.models import Case, IntegerField, Value, When
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


def resolve_user_membership(
    user: User, workspace_id: str | None = None
) -> WorkspaceMembership | None:
    """Return the matching WorkspaceMembership for `user`, preferring owned default vaults."""
    memberships = WorkspaceMembership.objects.select_related(
        "workspace", "workspace__owner"
    ).filter(user=user)
    if workspace_id:
        return memberships.filter(workspace_id=workspace_id).first()
    return (
        memberships.annotate(
            is_owner_priority=Case(
                When(workspace__owner=user, then=Value(0)),
                default=Value(1),
                output_field=IntegerField(),
            )
        )
        .order_by("is_owner_priority", "-workspace__is_default", "created_at")
        .first()
    )


def resolve_user_workspace(user: User, workspace_id: str | None = None) -> Workspace | None:
    """Return the requested workspace if the user is a member, else their default workspace."""
    membership = resolve_user_membership(user, workspace_id)
    return membership.workspace if membership else None


def get_request_workspace_role(request: HttpRequest) -> str:
    """Resolve the active workspace role from the request context or membership lookup."""
    cached = getattr(request, "workspace_role", None)
    if cached:
        return cached
    workspace = getattr(request, "workspace", None)
    user = getattr(request, "user", None)
    if workspace is not None and user is not None:
        if getattr(workspace, "owner_id", None) == getattr(user, "id", None):
            return WorkspaceMembership.Role.OWNER
        membership = WorkspaceMembership.objects.filter(
            workspace=workspace, user=user
        ).first()
        if membership:
            return membership.role
    return WorkspaceMembership.Role.VIEWER


def require_editor(request: HttpRequest) -> str:
    """Ensure the caller holds OWNER or EDITOR permission in the active workspace."""
    role = get_request_workspace_role(request)
    if role not in {WorkspaceMembership.Role.OWNER, WorkspaceMembership.Role.EDITOR}:
        raise HttpError(403, "Editor or Owner access required in this vault.")
    return role


def require_owner(request: HttpRequest) -> str:
    """Ensure the caller is the OWNER of the active workspace."""
    role = get_request_workspace_role(request)
    if role != WorkspaceMembership.Role.OWNER:
        raise HttpError(403, "Owner access required for this vault.")
    return role


class WorkspaceAuth(HttpBearer):
    """Bearer JWT authentication that binds `request.user`, `request.workspace`, and role."""

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
            membership = resolve_user_membership(user, parsed_ws_id)
            if membership is None:
                raise HttpError(403, "Workspace access denied or vault unavailable.")
        else:
            membership = resolve_user_membership(user, None)
            if membership is None:
                return None

        workspace = membership.workspace
        effective_role = (
            WorkspaceMembership.Role.OWNER
            if workspace.owner_id == user.id
            else membership.role
        )
        request.user = user
        request.workspace = workspace  # type: ignore[attr-defined]
        request.workspace_membership = membership  # type: ignore[attr-defined]
        request.workspace_role = effective_role  # type: ignore[attr-defined]
        return user


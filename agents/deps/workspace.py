"""Workspace-scoped auth dependency.

Resolves the `X-Workspace-Id` header into a WorkspaceContext (user, workspace,
organization, role). Membership lookups are cached in Redis for 60s and
fail-open to the database on any Redis error.
"""

import json
from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status

from core.db import get_supabase_admin
from core.logger import logger
from core.redis_client import get_redis
from deps.auth import AuthUser, get_current_user

_CACHE_TTL_SECONDS = 60


@dataclass
class WorkspaceContext:
    user: AuthUser
    workspace_id: str
    organization_id: str
    role: str


def _cache_key(user_id: str, workspace_id: str) -> str:
    return f"wsctx:{user_id}:{workspace_id}"


def _cache_get(key: str) -> dict | None:
    try:
        raw = get_redis().get(key)
        return json.loads(raw) if raw else None
    except Exception as e:  # fail-open to DB
        logger.warning("workspace_ctx_cache_read_failed", error=str(e))
        return None


def _cache_set(key: str, value: dict) -> None:
    try:
        get_redis().setex(key, _CACHE_TTL_SECONDS, json.dumps(value))
    except Exception as e:
        logger.warning("workspace_ctx_cache_write_failed", error=str(e))


def invalidate_workspace_cache(user_id: str, workspace_id: str) -> None:
    """Drop the cached membership for a user/workspace pair (role change, removal)."""
    try:
        get_redis().delete(_cache_key(user_id, workspace_id))
    except Exception as e:
        logger.warning("workspace_ctx_cache_delete_failed", error=str(e))


def resolve_membership(user_id: str, workspace_id: str) -> dict:
    """Return {organization_id, role} for a user in a workspace.

    Raises HTTPException 404 (workspace missing) or 403 (not a member).
    """
    # Postgres raises 22P02 on a non-uuid id; treat it as "no such workspace"
    # rather than letting it surface as a 500.
    try:
        UUID(workspace_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    key = _cache_key(user_id, workspace_id)
    cached = _cache_get(key)
    if cached:
        return cached

    db = get_supabase_admin()

    ws = (
        db.table("workspaces")
        .select("id, organization_id")
        .eq("id", workspace_id)
        .limit(1)
        .execute()
    )
    if not ws.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    organization_id = ws.data[0]["organization_id"]

    membership = (
        db.table("memberships")
        .select("role")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not membership.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this workspace",
        )

    result = {"organization_id": organization_id, "role": membership.data[0]["role"]}
    _cache_set(key, result)
    return result


async def get_workspace_context(
    user: AuthUser = Depends(get_current_user),
    x_workspace_id: str | None = Header(default=None, alias="X-Workspace-Id"),
) -> WorkspaceContext:
    if not x_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing X-Workspace-Id header",
        )
    info = resolve_membership(user.id, x_workspace_id)
    return WorkspaceContext(
        user=user,
        workspace_id=x_workspace_id,
        organization_id=info["organization_id"],
        role=info["role"],
    )


def require_role(*roles: str):
    """Dependency factory: 403 unless the caller's workspace role is in `roles`."""

    async def _checker(ctx: WorkspaceContext = Depends(get_workspace_context)) -> WorkspaceContext:
        if ctx.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of roles: {', '.join(roles)}",
            )
        return ctx

    return _checker

"""Workspace, organization, membership and invite endpoints."""

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from core.db import get_supabase_admin
from core.logger import logger
from deps.auth import AuthUser, get_current_user
from deps.workspace import (
    WorkspaceContext,
    invalidate_workspace_cache,
    resolve_membership,
)
from schemas.workspaces import (
    ROLES,
    InviteCreateRequest,
    MemberRoleUpdateRequest,
    ProductProfileFields,
    WorkspaceCreateRequest,
    WorkspaceUpdateRequest,
)

router = APIRouter(prefix="/workspaces", tags=["workspaces"], dependencies=[Depends(get_current_user)])

INVITE_TTL_DAYS = 7


def _profile_row(fields: ProductProfileFields, *, partial: bool = False) -> dict:
    """Map API onboarding fields to product_profiles columns."""
    data = fields.model_dump(exclude_unset=partial)
    mapping = {
        "company_name": "name",
        "product_description": "description",
        "website": "website_url",
        "target_market": "target_market",
        "value_proposition": "value_proposition",
        "positioning": "positioning",
        "approved_stories": "approved_stories",
        "disallowed_claims": "disallowed_claims",
        "tone": "tone",
        "sender_name": "sender_name",
        "sender_title": "sender_title",
        "meeting_duration_minutes": "meeting_duration_minutes",
        "territory": "territory",
        "daily_send_limit": "daily_send_limit",
    }
    row = {col: data[api] for api, col in mapping.items() if api in data and data[api] is not None}
    return row


def _get_ctx(workspace_id: str, user: AuthUser) -> WorkspaceContext:
    info = resolve_membership(user.id, workspace_id)
    return WorkspaceContext(
        user=user,
        workspace_id=workspace_id,
        organization_id=info["organization_id"],
        role=info["role"],
    )


def _require_admin(ctx: WorkspaceContext):
    if ctx.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Requires owner or admin role")


def _ensure_user_row(db, user: AuthUser) -> None:
    """Make sure the public.users mirror row exists (FKs depend on it)."""
    db.table("users").upsert(
        {"id": user.id, "email": user.email}, on_conflict="id"
    ).execute()


@router.post("", status_code=201)
async def create_workspace(body: WorkspaceCreateRequest, user: AuthUser = Depends(get_current_user)):
    """Create organization + workspace + owner membership + product profile."""
    db = get_supabase_admin()
    _ensure_user_row(db, user)

    org_name = body.organization_name or body.company_name or body.name
    org = (
        db.table("organizations")
        .insert({"name": org_name, "created_by": user.id})
        .execute()
    ).data[0]

    workspace = (
        db.table("workspaces")
        .insert(
            {"organization_id": org["id"], "name": body.name, "created_by": user.id}
        )
        .execute()
    ).data[0]

    membership = (
        db.table("memberships")
        .insert(
            {
                "organization_id": org["id"],
                "workspace_id": workspace["id"],
                "user_id": user.id,
                "role": "owner",
                "created_by": user.id,
            }
        )
        .execute()
    ).data[0]

    profile_row = _profile_row(body)
    profile_row.setdefault("name", body.company_name or body.name)
    profile_row.update(
        {
            "organization_id": org["id"],
            "workspace_id": workspace["id"],
            "created_by": user.id,
        }
    )
    product_profile = db.table("product_profiles").insert(profile_row).execute().data[0]

    logger.info("workspace_created", workspace_id=workspace["id"], organization_id=org["id"])
    return {
        "organization": org,
        "workspace": workspace,
        "membership": {"role": membership["role"]},
        "product_profile": product_profile,
    }


@router.get("")
async def list_workspaces(user: AuthUser = Depends(get_current_user)):
    """List workspaces the caller belongs to, with role."""
    db = get_supabase_admin()
    memberships = (
        db.table("memberships")
        .select("role, workspace_id, organization_id, workspaces(id, name, organization_id, created_at)")
        .eq("user_id", user.id)
        .execute()
    ).data
    return {
        "workspaces": [
            {**(m.get("workspaces") or {"id": m["workspace_id"]}), "role": m["role"]}
            for m in memberships
        ]
    }


@router.get("/{workspace_id}")
async def get_workspace(workspace_id: str, user: AuthUser = Depends(get_current_user)):
    """Workspace details + product profile (members only)."""
    ctx = _get_ctx(workspace_id, user)
    db = get_supabase_admin()
    workspace = (
        db.table("workspaces").select("*").eq("id", workspace_id).limit(1).execute()
    ).data[0]
    profile = (
        db.table("product_profiles")
        .select("*")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    ).data
    return {
        "workspace": workspace,
        "product_profile": profile[0] if profile else None,
        "role": ctx.role,
    }


@router.patch("/{workspace_id}")
async def update_workspace(
    workspace_id: str, body: WorkspaceUpdateRequest, user: AuthUser = Depends(get_current_user)
):
    """Update workspace name and/or product profile (owner/admin)."""
    ctx = _get_ctx(workspace_id, user)
    _require_admin(ctx)
    db = get_supabase_admin()

    workspace = None
    if body.name is not None:
        workspace = (
            db.table("workspaces").update({"name": body.name}).eq("id", workspace_id).execute()
        ).data[0]

    profile = None
    if body.product_profile is not None:
        row = _profile_row(body.product_profile, partial=True)
        if row:
            existing = (
                db.table("product_profiles")
                .select("id")
                .eq("workspace_id", workspace_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            ).data
            if existing:
                profile = (
                    db.table("product_profiles")
                    .update(row)
                    .eq("id", existing[0]["id"])
                    .execute()
                ).data[0]
            else:
                row.setdefault("name", body.name or "Product")
                row.update(
                    {
                        "organization_id": ctx.organization_id,
                        "workspace_id": workspace_id,
                        "created_by": user.id,
                    }
                )
                profile = db.table("product_profiles").insert(row).execute().data[0]

    return {"workspace": workspace, "product_profile": profile}


# ── members ───────────────────────────────────────────────────────


@router.get("/{workspace_id}/members")
async def list_members(workspace_id: str, user: AuthUser = Depends(get_current_user)):
    _get_ctx(workspace_id, user)  # member check
    db = get_supabase_admin()
    members = (
        db.table("memberships")
        .select("user_id, role, created_at, users(id, email, full_name)")
        .eq("workspace_id", workspace_id)
        .execute()
    ).data
    return {
        "members": [
            {
                "user_id": m["user_id"],
                "role": m["role"],
                "joined_at": m["created_at"],
                "email": (m.get("users") or {}).get("email"),
                "full_name": (m.get("users") or {}).get("full_name"),
            }
            for m in members
        ]
    }


@router.patch("/{workspace_id}/members/{member_user_id}")
async def update_member_role(
    workspace_id: str,
    member_user_id: str,
    body: MemberRoleUpdateRequest,
    user: AuthUser = Depends(get_current_user),
):
    ctx = _get_ctx(workspace_id, user)
    _require_admin(ctx)
    if body.role not in ROLES:
        raise HTTPException(status_code=422, detail=f"role must be one of {ROLES}")
    db = get_supabase_admin()

    target = (
        db.table("memberships")
        .select("id, role")
        .eq("workspace_id", workspace_id)
        .eq("user_id", member_user_id)
        .limit(1)
        .execute()
    ).data
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    if target[0]["role"] == "owner" and ctx.role != "owner":
        raise HTTPException(status_code=403, detail="Only an owner can change an owner's role")

    updated = (
        db.table("memberships").update({"role": body.role}).eq("id", target[0]["id"]).execute()
    ).data[0]
    invalidate_workspace_cache(member_user_id, workspace_id)
    return {"user_id": member_user_id, "role": updated["role"]}


@router.delete("/{workspace_id}/members/{member_user_id}", status_code=204)
async def remove_member(
    workspace_id: str, member_user_id: str, user: AuthUser = Depends(get_current_user)
):
    ctx = _get_ctx(workspace_id, user)
    if ctx.role not in ("owner", "admin") and member_user_id != user.id:
        raise HTTPException(status_code=403, detail="Requires owner or admin role")
    db = get_supabase_admin()

    target = (
        db.table("memberships")
        .select("id, role")
        .eq("workspace_id", workspace_id)
        .eq("user_id", member_user_id)
        .limit(1)
        .execute()
    ).data
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    if target[0]["role"] == "owner":
        owners = (
            db.table("memberships")
            .select("id")
            .eq("workspace_id", workspace_id)
            .eq("role", "owner")
            .execute()
        ).data
        if len(owners) <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last owner")

    db.table("memberships").delete().eq("id", target[0]["id"]).execute()
    invalidate_workspace_cache(member_user_id, workspace_id)


# ── invites ───────────────────────────────────────────────────────


@router.post("/{workspace_id}/invites", status_code=201)
async def create_invite(
    workspace_id: str, body: InviteCreateRequest, user: AuthUser = Depends(get_current_user)
):
    ctx = _get_ctx(workspace_id, user)
    _require_admin(ctx)
    if body.role not in ROLES:
        raise HTTPException(status_code=422, detail=f"role must be one of {ROLES}")
    if body.role == "owner" and ctx.role != "owner":
        raise HTTPException(status_code=403, detail="Only an owner can invite an owner")

    db = get_supabase_admin()
    token = secrets.token_urlsafe(32)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=INVITE_TTL_DAYS)).isoformat()
    invite = (
        db.table("workspace_invites")
        .insert(
            {
                "organization_id": ctx.organization_id,
                "workspace_id": workspace_id,
                "email": body.email.lower(),
                "role": body.role,
                "token": token,
                "expires_at": expires_at,
                "created_by": user.id,
            }
        )
        .execute()
    ).data[0]
    return {
        "id": invite["id"],
        "email": invite["email"],
        "role": invite["role"],
        "token": token,
        "expires_at": invite["expires_at"],
        "status": invite["status"],
    }


@router.get("/{workspace_id}/invites")
async def list_invites(workspace_id: str, user: AuthUser = Depends(get_current_user)):
    ctx = _get_ctx(workspace_id, user)
    _require_admin(ctx)
    db = get_supabase_admin()
    invites = (
        db.table("workspace_invites")
        .select("id, email, role, status, expires_at, created_at")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=True)
        .execute()
    ).data
    return {"invites": invites}


# Note: accept endpoint lives outside the /workspaces/{id} scope on purpose —
# the invitee is not yet a member.
invites_router = APIRouter(tags=["workspaces"], dependencies=[Depends(get_current_user)])


@invites_router.get("/invites/accept")
async def accept_invite(token: str, user: AuthUser = Depends(get_current_user)):
    """Accept an invite while authenticated; joins the workspace/org."""
    db = get_supabase_admin()
    rows = (
        db.table("workspace_invites").select("*").eq("token", token).limit(1).execute()
    ).data
    if not rows:
        raise HTTPException(status_code=404, detail="Invite not found")
    invite = rows[0]

    if invite["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Invite is {invite['status']}")
    expires_at = datetime.fromisoformat(invite["expires_at"].replace("Z", "+00:00"))
    if expires_at < datetime.now(timezone.utc):
        db.table("workspace_invites").update({"status": "expired"}).eq("id", invite["id"]).execute()
        raise HTTPException(status_code=400, detail="Invite has expired")
    if user.email and invite["email"].lower() != user.email.lower():
        raise HTTPException(status_code=403, detail="Invite was issued for a different email")

    _ensure_user_row(db, user)

    existing = (
        db.table("memberships")
        .select("id")
        .eq("workspace_id", invite["workspace_id"])
        .eq("user_id", user.id)
        .limit(1)
        .execute()
    ).data
    if not existing:
        db.table("memberships").insert(
            {
                "organization_id": invite["organization_id"],
                "workspace_id": invite["workspace_id"],
                "user_id": user.id,
                "role": invite["role"],
                "created_by": invite["created_by"],
            }
        ).execute()

    db.table("workspace_invites").update(
        {
            "status": "accepted",
            "accepted_by": user.id,
            "accepted_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", invite["id"]).execute()
    invalidate_workspace_cache(user.id, invite["workspace_id"])

    return {
        "workspace_id": invite["workspace_id"],
        "organization_id": invite["organization_id"],
        "role": invite["role"],
    }

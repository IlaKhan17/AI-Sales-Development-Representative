"""ICP profiles and immutable versions (workspace-scoped)."""

from fastapi import APIRouter, Depends, HTTPException

from core.db import get_supabase_admin
from core.logger import logger
from deps.workspace import WorkspaceContext, get_workspace_context
from schemas.icp import (
    ICPProfileCreateRequest,
    ICPVersionCreateRequest,
    ICPVersionStatusUpdateRequest,
)

router = APIRouter(prefix="/icp", tags=["icp"], dependencies=[Depends(get_workspace_context)])


def _get_profile(db, ctx: WorkspaceContext, profile_id: str) -> dict:
    rows = (
        db.table("icp_profiles")
        .select("*")
        .eq("id", profile_id)
        .eq("workspace_id", ctx.workspace_id)
        .limit(1)
        .execute()
    ).data
    if not rows:
        raise HTTPException(status_code=404, detail="ICP profile not found")
    return rows[0]


@router.post("", status_code=201)
async def create_icp_profile(
    body: ICPProfileCreateRequest, ctx: WorkspaceContext = Depends(get_workspace_context)
):
    db = get_supabase_admin()
    profile = (
        db.table("icp_profiles")
        .insert(
            {
                "organization_id": ctx.organization_id,
                "workspace_id": ctx.workspace_id,
                "name": body.name,
                "created_by": ctx.user.id,
            }
        )
        .execute()
    ).data[0]
    return profile


@router.get("")
async def list_icp_profiles(ctx: WorkspaceContext = Depends(get_workspace_context)):
    db = get_supabase_admin()
    profiles = (
        db.table("icp_profiles")
        .select("*, icp_versions(id, version, status, definition, weights, notes, created_at)")
        .eq("workspace_id", ctx.workspace_id)
        .order("created_at", desc=True)
        .execute()
    ).data
    return {"profiles": profiles}


@router.post("/{profile_id}/versions", status_code=201)
async def create_icp_version(
    profile_id: str,
    body: ICPVersionCreateRequest,
    ctx: WorkspaceContext = Depends(get_workspace_context),
):
    db = get_supabase_admin()
    _get_profile(db, ctx, profile_id)

    latest = (
        db.table("icp_versions")
        .select("version")
        .eq("icp_profile_id", profile_id)
        .order("version", desc=True)
        .limit(1)
        .execute()
    ).data
    next_version = (latest[0]["version"] + 1) if latest else 1

    version = (
        db.table("icp_versions")
        .insert(
            {
                "organization_id": ctx.organization_id,
                "workspace_id": ctx.workspace_id,
                "icp_profile_id": profile_id,
                "version": next_version,
                "definition": body.definition.model_dump(),
                "weights": body.weights,
                "notes": body.notes,
                "status": "draft",
                "created_by": ctx.user.id,
            }
        )
        .execute()
    ).data[0]
    logger.info("icp_version_created", profile_id=profile_id, version=next_version)
    return version



def _find_version(db, profile_id: str, version: str, columns: str = "*") -> dict | None:
    """Look up a version by UUID id or by integer version number."""
    q = db.table("icp_versions").select(columns).eq("icp_profile_id", profile_id)
    if version.isdigit():
        q = q.eq("version", int(version))
    else:
        q = q.eq("id", version)
    rows = q.limit(1).execute().data
    return rows[0] if rows else None

@router.get("/{profile_id}/versions/{version}")
async def get_icp_version(
    profile_id: str, version: str, ctx: WorkspaceContext = Depends(get_workspace_context)
):
    db = get_supabase_admin()
    _get_profile(db, ctx, profile_id)
    row = _find_version(db, profile_id, version)
    if not row:
        raise HTTPException(status_code=404, detail="ICP version not found")
    return row


@router.patch("/{profile_id}/versions/{version}")
async def update_icp_version_status(
    profile_id: str,
    version: str,
    body: ICPVersionStatusUpdateRequest,
    ctx: WorkspaceContext = Depends(get_workspace_context),
):
    """Activate (archives the previously active version) or archive a version.

    Versions are immutable — only lifecycle status can change.
    """
    db = get_supabase_admin()
    _get_profile(db, ctx, profile_id)
    target = _find_version(db, profile_id, version, "id, status")
    if not target:
        raise HTTPException(status_code=404, detail="ICP version not found")

    if body.status == "active":
        # Archive any currently active version, then activate this one.
        db.table("icp_versions").update({"status": "archived"}).eq(
            "icp_profile_id", profile_id
        ).eq("status", "active").execute()
        updated = (
            db.table("icp_versions").update({"status": "active"}).eq("id", target["id"]).execute()
        ).data[0]
        db.table("icp_profiles").update({"active_version_id": target["id"]}).eq(
            "id", profile_id
        ).execute()
    else:  # archived
        updated = (
            db.table("icp_versions").update({"status": "archived"}).eq("id", target["id"]).execute()
        ).data[0]
        db.table("icp_profiles").update({"active_version_id": None}).eq("id", profile_id).eq(
            "active_version_id", target["id"]
        ).execute()

    return updated

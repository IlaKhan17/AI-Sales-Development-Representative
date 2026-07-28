"""Reply inbox + suppression list endpoints (workspace-scoped)."""

from fastapi import APIRouter, Depends, HTTPException

from core.db import get_supabase_admin
from deps.workspace import WorkspaceContext, get_workspace_context, require_role
from schemas.outreach import ReplyActionRequest, SuppressionCreateRequest
from services import outreach_service

router = APIRouter(tags=["replies"], dependencies=[Depends(get_workspace_context)])


@router.get("/replies")
async def list_replies(
    intent: str | None = None,
    requires_review: bool | None = None,
    ctx: WorkspaceContext = Depends(get_workspace_context),
):
    db = get_supabase_admin()
    q = db.table("replies").select("*").eq("workspace_id", ctx.workspace_id)
    if intent:
        q = q.eq("intent", intent)
    if requires_review is not None:
        q = q.eq("requires_human_review", requires_review)
    replies = q.order("created_at", desc=True).execute().data or []

    prospect_ids = list({r["prospect_id"] for r in replies if r.get("prospect_id")})
    if prospect_ids:
        prospects = (
            db.table("prospects_v2")
            .select("id, full_name, email")
            .in_("id", prospect_ids)
            .execute()
        ).data or []
        by_id = {p["id"]: p for p in prospects}
        for r in replies:
            r["prospect"] = by_id.get(r.get("prospect_id"))
    return {"replies": replies}


@router.post("/replies/{reply_id}/action")
async def reply_action(
    reply_id: str,
    body: ReplyActionRequest,
    ctx: WorkspaceContext = Depends(require_role("owner", "admin", "member", "reviewer")),
):
    """Generate a follow-up draft for a reply (goes through the same
    approval-gated flow as any other outbound message)."""
    db = get_supabase_admin()
    rows = (
        db.table("replies")
        .select("*")
        .eq("id", reply_id)
        .eq("workspace_id", ctx.workspace_id)
        .limit(1)
        .execute()
    ).data
    if not rows:
        raise HTTPException(status_code=404, detail="Reply not found")
    reply = rows[0]
    if not reply.get("prospect_id"):
        raise HTTPException(status_code=422, detail="Reply is not linked to a prospect")

    # Next step number = last outbound step for the prospect + 1
    messages = (
        db.table("messages")
        .select("step_number, enrollment_id")
        .eq("prospect_id", reply["prospect_id"])
        .eq("direction", "outbound")
        .order("step_number", desc=True)
        .limit(1)
        .execute()
    ).data or []
    next_step = (messages[0]["step_number"] + 1) if messages else 1
    enrollment_id = messages[0].get("enrollment_id") if messages else None

    draft = await outreach_service.create_draft(
        ctx,
        reply["prospect_id"],
        step_number=next_step,
        enrollment_id=enrollment_id,
        objective="Reply to their response: answer their questions directly and move toward a meeting.",
        reply_context=(reply.get("body") or "")[:2000],
    )
    return draft


@router.post("/suppression", status_code=201)
async def add_suppression(
    body: SuppressionCreateRequest,
    ctx: WorkspaceContext = Depends(require_role("owner", "admin", "member")),
):
    db = get_supabase_admin()
    entry = (
        db.table("suppression_entries")
        .upsert(
            {
                "organization_id": ctx.organization_id,
                "workspace_id": ctx.workspace_id,
                "email": body.email,
                "domain": body.email.split("@")[-1],
                "reason": body.reason,
                "created_by": ctx.user.id,
            },
            on_conflict="workspace_id,email",
        )
        .execute()
    ).data[0]
    return {"entry": entry}


@router.get("/suppression")
async def list_suppression(ctx: WorkspaceContext = Depends(get_workspace_context)):
    db = get_supabase_admin()
    entries = (
        db.table("suppression_entries")
        .select("*")
        .eq("workspace_id", ctx.workspace_id)
        .order("created_at", desc=True)
        .execute()
    ).data or []
    return {"entries": entries}


@router.delete("/suppression/{entry_id}")
async def delete_suppression(
    entry_id: str,
    ctx: WorkspaceContext = Depends(require_role("owner", "admin")),
):
    db = get_supabase_admin()
    rows = (
        db.table("suppression_entries")
        .select("id")
        .eq("id", entry_id)
        .eq("workspace_id", ctx.workspace_id)
        .limit(1)
        .execute()
    ).data
    if not rows:
        raise HTTPException(status_code=404, detail="Suppression entry not found")
    db.table("suppression_entries").delete().eq("id", entry_id).execute()
    return {"deleted": True}

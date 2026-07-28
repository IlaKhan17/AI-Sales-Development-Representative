"""Approval queue endpoints (workspace-scoped, message approvals)."""

from fastapi import APIRouter, Depends, HTTPException

from core.db import get_supabase_admin
from deps.workspace import WorkspaceContext, get_workspace_context, require_role
from schemas.outreach import ApprovalDecisionRequest
from services import outreach_service

router = APIRouter(
    prefix="/approvals", tags=["approvals"], dependencies=[Depends(get_workspace_context)]
)


def _hydrate_messages(db, workspace_id: str, approvals: list[dict]) -> None:
    """Attach {message: {..., prospect}} to each message approval."""
    message_ids = [a["subject_id"] for a in approvals if a.get("subject_type") == "message"]
    if not message_ids:
        return
    messages = (
        db.table("messages")
        .select("id, to_email, subject, body, status, prospect_id, step_number")
        .eq("workspace_id", workspace_id)
        .in_("id", message_ids)
        .execute()
    ).data or []
    by_id = {m["id"]: m for m in messages}

    prospect_ids = list({m["prospect_id"] for m in messages if m.get("prospect_id")})
    prospects = {}
    if prospect_ids:
        rows = (
            db.table("prospects_v2")
            .select("id, full_name, company_id")
            .in_("id", prospect_ids)
            .execute()
        ).data or []
        company_ids = list({r["company_id"] for r in rows if r.get("company_id")})
        companies = {}
        if company_ids:
            crows = (
                db.table("companies").select("id, name").in_("id", company_ids).execute()
            ).data or []
            companies = {c["id"]: c["name"] for c in crows}
        prospects = {
            r["id"]: {
                "full_name": r.get("full_name"),
                "company_name": companies.get(r.get("company_id")),
            }
            for r in rows
        }

    for a in approvals:
        msg = by_id.get(a.get("subject_id"))
        if msg:
            msg = dict(msg)
            msg["prospect"] = prospects.get(msg.get("prospect_id"))
        a["message"] = msg


@router.get("")
async def list_approvals(
    status: str = "pending", ctx: WorkspaceContext = Depends(get_workspace_context)
):
    db = get_supabase_admin()
    approvals = (
        db.table("approvals")
        .select("*")
        .eq("workspace_id", ctx.workspace_id)
        .eq("status", status)
        .eq("subject_type", "message")
        .order("created_at", desc=True)
        .execute()
    ).data or []
    _hydrate_messages(db, ctx.workspace_id, approvals)
    return {"approvals": approvals}


@router.get("/counts")
async def approval_counts(ctx: WorkspaceContext = Depends(get_workspace_context)):
    db = get_supabase_admin()
    rows = (
        db.table("approvals")
        .select("id")
        .eq("workspace_id", ctx.workspace_id)
        .eq("status", "pending")
        .eq("subject_type", "message")
        .execute()
    ).data or []
    return {"pending": len(rows)}


@router.post("/{approval_id}/decide")
async def decide_approval(
    approval_id: str,
    body: ApprovalDecisionRequest,
    ctx: WorkspaceContext = Depends(require_role("owner", "admin", "reviewer")),
):
    try:
        result = await outreach_service.decide(
            ctx,
            approval_id,
            body.decision,
            edited_subject=body.edited_subject,
            edited_body=body.edited_body,
        )
    except ValueError as e:
        raise HTTPException(status_code=404 if "not found" in str(e).lower() else 409, detail=str(e))
    return result

"""Evidence-grounded prospect endpoints (v2 pipeline, workspace-scoped)."""

from fastapi import APIRouter, Depends, HTTPException

from core.db import get_supabase_admin
from core.logger import logger
from deps.workspace import WorkspaceContext, get_workspace_context, require_role
from schemas.campaigns import ProspectStatusUpdateRequest

router = APIRouter(
    prefix="/v2/prospects", tags=["prospects-v2"], dependencies=[Depends(get_workspace_context)]
)


def _latest_scores(db, workspace_id: str, prospect_ids: list[str]) -> dict[str, dict]:
    """Latest score row per prospect."""
    if not prospect_ids:
        return {}
    rows = (
        db.table("prospect_scores")
        .select("prospect_id, total, status, scored_at, disqualification_reason")
        .eq("workspace_id", workspace_id)
        .in_("prospect_id", prospect_ids)
        .order("scored_at", desc=True)
        .execute()
    ).data or []
    latest: dict[str, dict] = {}
    for r in rows:  # ordered desc — first seen wins
        latest.setdefault(r["prospect_id"], r)
    return latest


@router.get("")
async def list_prospects(
    campaign_id: str | None = None,
    status: str | None = None,
    ctx: WorkspaceContext = Depends(get_workspace_context),
):
    db = get_supabase_admin()
    q = db.table("prospects_v2").select("*").eq("workspace_id", ctx.workspace_id)
    if campaign_id:
        q = q.eq("campaign_id", campaign_id)
    if status:
        q = q.eq("status", status)
    prospects = q.order("created_at", desc=True).execute().data or []

    scores = _latest_scores(db, ctx.workspace_id, [p["id"] for p in prospects])
    for p in prospects:
        s = scores.get(p["id"])
        p["score_total"] = s["total"] if s else None
    return {"prospects": prospects}


@router.get("/{prospect_id}")
async def get_prospect_dossier(
    prospect_id: str, ctx: WorkspaceContext = Depends(get_workspace_context)
):
    db = get_supabase_admin()
    rows = (
        db.table("prospects_v2")
        .select("*")
        .eq("id", prospect_id)
        .eq("workspace_id", ctx.workspace_id)
        .limit(1)
        .execute()
    ).data
    if not rows:
        raise HTTPException(status_code=404, detail="Prospect not found")
    prospect = rows[0]

    company = None
    if prospect.get("company_id"):
        c = (
            db.table("companies").select("*").eq("id", prospect["company_id"]).limit(1).execute()
        ).data
        company = c[0] if c else None

    evidence = (
        db.table("prospect_evidence")
        .select("*")
        .eq("prospect_id", prospect_id)
        .order("created_at")
        .execute()
    ).data or []

    signals = (
        db.table("prospect_signals")
        .select("*")
        .eq("prospect_id", prospect_id)
        .order("created_at")
        .execute()
    ).data or []

    score_rows = (
        db.table("prospect_scores")
        .select("*")
        .eq("prospect_id", prospect_id)
        .order("scored_at", desc=True)
        .limit(1)
        .execute()
    ).data or []

    return {
        "prospect": prospect,
        "company": company,
        "evidence": evidence,
        "signals": signals,
        "score": score_rows[0] if score_rows else None,
    }


@router.post("/{prospect_id}/status")
async def update_prospect_status(
    prospect_id: str,
    body: ProspectStatusUpdateRequest,
    ctx: WorkspaceContext = Depends(require_role("owner", "admin", "member")),
):
    """Manual status override (member and above); recorded in audit_logs."""
    db = get_supabase_admin()
    rows = (
        db.table("prospects_v2")
        .select("id, status")
        .eq("id", prospect_id)
        .eq("workspace_id", ctx.workspace_id)
        .limit(1)
        .execute()
    ).data
    if not rows:
        raise HTTPException(status_code=404, detail="Prospect not found")
    old_status = rows[0]["status"]

    updated = (
        db.table("prospects_v2").update({"status": body.status}).eq("id", prospect_id).execute()
    ).data[0]

    try:
        db.table("audit_logs").insert(
            {
                "workspace_id": ctx.workspace_id,
                "actor": ctx.user.id,
                "action": "prospect_status_override",
                "subject_type": "prospect_v2",
                "subject_id": prospect_id,
                "detail": {"from": old_status, "to": body.status},
            }
        ).execute()
    except Exception as e:
        logger.warning("audit_log_write_failed", error=str(e))

    return {"prospect": updated}

"""Sequence CRUD + enrollment endpoints (workspace-scoped)."""

from fastapi import APIRouter, Depends, HTTPException

from core.db import get_supabase_admin
from core.logger import logger
from deps.workspace import WorkspaceContext, get_workspace_context, require_role
from schemas.outreach import EnrollRequest, SequenceCreateRequest
from services import outreach_service

router = APIRouter(
    prefix="/sequences", tags=["sequences"], dependencies=[Depends(get_workspace_context)]
)

ENROLL_CAP = 20


def _get_sequence(db, workspace_id: str, sequence_id: str) -> dict:
    rows = (
        db.table("sequences")
        .select("*")
        .eq("id", sequence_id)
        .eq("workspace_id", workspace_id)
        .limit(1)
        .execute()
    ).data
    if not rows:
        raise HTTPException(status_code=404, detail="Sequence not found")
    return rows[0]


@router.post("", status_code=201)
async def create_sequence(
    body: SequenceCreateRequest,
    ctx: WorkspaceContext = Depends(require_role("owner", "admin", "member")),
):
    db = get_supabase_admin()
    campaign = (
        db.table("campaigns")
        .select("id")
        .eq("id", body.campaign_id)
        .eq("workspace_id", ctx.workspace_id)
        .limit(1)
        .execute()
    ).data
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    step_numbers = [s.step_number for s in body.steps]
    if len(set(step_numbers)) != len(step_numbers):
        raise HTTPException(status_code=422, detail="Duplicate step_number in steps")

    sequence = (
        db.table("sequences")
        .insert(
            {
                "organization_id": ctx.organization_id,
                "workspace_id": ctx.workspace_id,
                "campaign_id": body.campaign_id,
                "name": body.name,
                "status": "active",
                "created_by": ctx.user.id,
            }
        )
        .execute()
    ).data[0]

    steps = (
        db.table("sequence_steps")
        .insert(
            [
                {
                    "organization_id": ctx.organization_id,
                    "workspace_id": ctx.workspace_id,
                    "sequence_id": sequence["id"],
                    "step_number": s.step_number,
                    "objective": s.objective,
                    "delay_days": s.delay_days,
                }
                for s in body.steps
            ]
        )
        .execute()
    ).data
    return {"sequence": sequence, "steps": steps}


@router.get("")
async def list_sequences(
    campaign_id: str | None = None, ctx: WorkspaceContext = Depends(get_workspace_context)
):
    db = get_supabase_admin()
    q = db.table("sequences").select("*").eq("workspace_id", ctx.workspace_id)
    if campaign_id:
        q = q.eq("campaign_id", campaign_id)
    sequences = q.order("created_at", desc=True).execute().data or []

    if sequences:
        step_rows = (
            db.table("sequence_steps")
            .select("*")
            .in_("sequence_id", [s["id"] for s in sequences])
            .order("step_number")
            .execute()
        ).data or []
        for s in sequences:
            s["steps"] = [st for st in step_rows if st["sequence_id"] == s["id"]]
    return {"sequences": sequences}


@router.post("/{sequence_id}/enroll")
async def enroll_prospects(
    sequence_id: str,
    body: EnrollRequest,
    ctx: WorkspaceContext = Depends(require_role("owner", "admin", "member")),
):
    """Enroll qualified prospects and draft step 1 for each (approval-gated).

    Capped at 20 prospects per call.
    """
    if len(body.prospect_ids) > ENROLL_CAP:
        raise HTTPException(status_code=422, detail=f"Max {ENROLL_CAP} prospects per call")

    db = get_supabase_admin()
    sequence = _get_sequence(db, ctx.workspace_id, sequence_id)

    prospects = (
        db.table("prospects_v2")
        .select("id, status, email")
        .eq("workspace_id", ctx.workspace_id)
        .in_("id", body.prospect_ids)
        .execute()
    ).data or []
    by_id = {p["id"]: p for p in prospects}

    results = []
    for pid in body.prospect_ids:
        prospect = by_id.get(pid)
        if not prospect:
            results.append({"prospect_id": pid, "status": "error", "error": "not found"})
            continue
        if prospect["status"] != "qualified":
            results.append(
                {"prospect_id": pid, "status": "skipped", "error": "prospect not qualified"}
            )
            continue

        existing = (
            db.table("sequence_enrollments")
            .select("id")
            .eq("sequence_id", sequence_id)
            .eq("prospect_id", pid)
            .limit(1)
            .execute()
        ).data
        if existing:
            results.append({"prospect_id": pid, "status": "skipped", "error": "already enrolled"})
            continue

        enrollment = (
            db.table("sequence_enrollments")
            .insert(
                {
                    "organization_id": ctx.organization_id,
                    "workspace_id": ctx.workspace_id,
                    "sequence_id": sequence_id,
                    "prospect_id": pid,
                    "status": "active",
                    "current_step": 0,
                    "created_by": ctx.user.id,
                }
            )
            .execute()
        ).data[0]

        try:
            step1 = (
                db.table("sequence_steps")
                .select("objective")
                .eq("sequence_id", sequence_id)
                .eq("step_number", 1)
                .limit(1)
                .execute()
            ).data
            draft = await outreach_service.create_draft(
                ctx,
                pid,
                step_number=1,
                campaign_id=sequence["campaign_id"],
                enrollment_id=enrollment["id"],
                objective=step1[0]["objective"] if step1 else None,
            )
            results.append(
                {
                    "prospect_id": pid,
                    "status": "enrolled",
                    "enrollment_id": enrollment["id"],
                    "message_id": draft["message"]["id"],
                    "checks_failed": draft["checks_failed"],
                }
            )
        except Exception as e:
            logger.error("enroll_draft_failed", prospect_id=pid, error=str(e))
            results.append(
                {
                    "prospect_id": pid,
                    "status": "enrolled_draft_failed",
                    "enrollment_id": enrollment["id"],
                    "error": str(e),
                }
            )

    return {"results": results}


@router.get("/{sequence_id}/enrollments")
async def list_enrollments(
    sequence_id: str, ctx: WorkspaceContext = Depends(get_workspace_context)
):
    db = get_supabase_admin()
    _get_sequence(db, ctx.workspace_id, sequence_id)
    enrollments = (
        db.table("sequence_enrollments")
        .select("*")
        .eq("sequence_id", sequence_id)
        .order("created_at", desc=True)
        .execute()
    ).data or []

    prospect_ids = list({e["prospect_id"] for e in enrollments})
    if prospect_ids:
        prospects = (
            db.table("prospects_v2")
            .select("id, full_name, email, status")
            .in_("id", prospect_ids)
            .execute()
        ).data or []
        by_id = {p["id"]: p for p in prospects}
        for e in enrollments:
            e["prospect"] = by_id.get(e["prospect_id"])
    return {"enrollments": enrollments}

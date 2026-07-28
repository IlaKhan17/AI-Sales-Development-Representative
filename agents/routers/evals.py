"""Evaluation and business-outcome reporting endpoints.

Two different scopes live here:
  * /evals/outcomes — per-workspace production metrics (Suite G), read from
    the business_outcomes view.
  * /evals/runs — global eval-run history (dev asset, not workspace data),
    readable by any authenticated user.
"""

from fastapi import APIRouter, Depends, Query

from core.db import get_supabase_admin
from core.logger import logger
from deps.auth import get_current_user
from deps.workspace import WorkspaceContext, get_workspace_context

router = APIRouter(prefix="/evals", tags=["evals"])

# Zero-valued outcome row returned when the view has no entry for a workspace
# yet (nothing sent) or the migration has not been applied.
_EMPTY_OUTCOMES = {
    "emails_sent": 0,
    "bounced_count": 0,
    "delivery_rate": None,
    "bounce_rate": None,
    "reply_count": 0,
    "reply_rate": None,
    "positive_reply_count": 0,
    "positive_reply_rate": None,
    "meeting_booked_count": 0,
    "unsubscribe_rate": None,
    "approvals_pending": 0,
    "pct_approved_unchanged": None,
}


@router.get("/outcomes", dependencies=[Depends(get_workspace_context)])
async def get_business_outcomes(ctx: WorkspaceContext = Depends(get_workspace_context)):
    """Business outcomes for the active workspace (Suite G)."""
    db = get_supabase_admin()
    try:
        rows = (
            db.table("business_outcomes")
            .select("*")
            .eq("workspace_id", ctx.workspace_id)
            .limit(1)
            .execute()
        ).data
    except Exception as e:
        # View missing (migration 010 not applied) — report zeros rather than 500.
        logger.warning(f"business_outcomes unavailable: {e}")
        return {"outcomes": {"workspace_id": ctx.workspace_id, **_EMPTY_OUTCOMES}}

    outcomes = rows[0] if rows else {"workspace_id": ctx.workspace_id, **_EMPTY_OUTCOMES}
    return {"outcomes": outcomes}


@router.get("/runs", dependencies=[Depends(get_current_user)])
async def list_eval_runs(limit: int = Query(20, ge=1, le=100)):
    """Recent eval runs with their summary metrics."""
    db = get_supabase_admin()
    try:
        runs = (
            db.table("eval_runs")
            .select("*")
            .order("started_at", desc=True)
            .limit(limit)
            .execute()
        ).data or []
    except Exception as e:
        logger.warning(f"eval_runs unavailable: {e}")
        runs = []
    return {"runs": runs}

"""Agent run inspection endpoints."""

from fastapi import APIRouter, Depends, HTTPException

from core.db import get_supabase_admin
from core.logger import logger
from deps.auth import AuthUser, get_current_user

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("/runs/{run_id}")
async def get_run(run_id: str, user: AuthUser = Depends(get_current_user)):
    """Return an agent run (owned by the caller) with its recorded steps."""
    client = get_supabase_admin()
    try:
        run_resp = (
            client.table("agent_runs").select("*").eq("id", run_id).limit(1).execute()
        )
    except Exception as e:
        logger.error(f"Error fetching run {run_id}: {e}")
        raise HTTPException(status_code=500, detail="Could not fetch run")

    if not run_resp.data:
        raise HTTPException(status_code=404, detail="Run not found")

    run = run_resp.data[0]
    # Enforce ownership: runs carry user_id
    if run.get("user_id") and run["user_id"] != user.id:
        raise HTTPException(status_code=404, detail="Run not found")

    steps = []
    try:
        steps_resp = (
            client.table("agent_steps")
            .select("*")
            .eq("run_id", run_id)
            .order("created_at")
            .execute()
        )
        steps = steps_resp.data or []
    except Exception as e:
        logger.warning(f"Error fetching steps for run {run_id}: {e}")

    return {"run": run, "steps": steps}

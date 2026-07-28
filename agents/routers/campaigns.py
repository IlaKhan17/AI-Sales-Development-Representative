"""Campaign management endpoints (workspace-scoped)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException

from config import settings
from core.db import get_supabase_admin
from core.logger import logger
from deps.workspace import WorkspaceContext, get_workspace_context
from schemas.campaigns import CampaignCreateRequest

router = APIRouter(
    prefix="/campaigns", tags=["campaigns"], dependencies=[Depends(get_workspace_context)]
)

_arq_pool = None


async def _get_arq_pool():
    global _arq_pool
    if _arq_pool is None:
        from arq import create_pool
        from arq.connections import RedisSettings

        _arq_pool = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
    return _arq_pool


def _get_campaign(db, ctx: WorkspaceContext, campaign_id: str) -> dict:
    rows = (
        db.table("campaigns")
        .select("*")
        .eq("id", campaign_id)
        .eq("workspace_id", ctx.workspace_id)
        .limit(1)
        .execute()
    ).data
    if not rows:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return rows[0]


def _status_counts(db, workspace_id: str, campaign_ids: list[str]) -> dict[str, dict[str, int]]:
    """Prospect counts by status per campaign (single query)."""
    counts: dict[str, dict[str, int]] = {cid: {} for cid in campaign_ids}
    if not campaign_ids:
        return counts
    rows = (
        db.table("prospects_v2")
        .select("campaign_id, status")
        .eq("workspace_id", workspace_id)
        .in_("campaign_id", campaign_ids)
        .execute()
    ).data or []
    for r in rows:
        by_status = counts.setdefault(r["campaign_id"], {})
        by_status[r["status"]] = by_status.get(r["status"], 0) + 1
    return counts


@router.post("", status_code=201)
async def create_campaign(
    body: CampaignCreateRequest, ctx: WorkspaceContext = Depends(get_workspace_context)
):
    db = get_supabase_admin()

    icp = (
        db.table("icp_versions")
        .select("id, status")
        .eq("id", body.icp_version_id)
        .eq("workspace_id", ctx.workspace_id)
        .limit(1)
        .execute()
    ).data
    if not icp:
        raise HTTPException(status_code=404, detail="ICP version not found in this workspace")
    if icp[0]["status"] not in ("active", "draft"):
        raise HTTPException(
            status_code=400, detail="ICP version must be active or draft (archived not allowed)"
        )

    if body.product_profile_id:
        pp = (
            db.table("product_profiles")
            .select("id")
            .eq("id", body.product_profile_id)
            .eq("workspace_id", ctx.workspace_id)
            .limit(1)
            .execute()
        ).data
        if not pp:
            raise HTTPException(status_code=404, detail="Product profile not found in this workspace")

    campaign = (
        db.table("campaigns")
        .insert(
            {
                "organization_id": ctx.organization_id,
                "workspace_id": ctx.workspace_id,
                "name": body.name,
                "icp_version_id": body.icp_version_id,
                "product_profile_id": body.product_profile_id,
                "objective": body.objective,
                "region": body.region,
                "target_prospect_count": body.target_prospect_count,
                "allowed_sources": body.allowed_sources,
                "sequence_length": body.sequence_length,
                "daily_cap": body.daily_cap,
                "approval_policy": body.approval_policy,
                "status": "draft",
                "created_by": ctx.user.id,
            }
        )
        .execute()
    ).data[0]
    logger.info("campaign_created", campaign_id=campaign["id"], workspace_id=ctx.workspace_id)
    return {"campaign": campaign}


@router.get("")
async def list_campaigns(ctx: WorkspaceContext = Depends(get_workspace_context)):
    db = get_supabase_admin()
    campaigns = (
        db.table("campaigns")
        .select("*")
        .eq("workspace_id", ctx.workspace_id)
        .order("created_at", desc=True)
        .execute()
    ).data or []
    counts = _status_counts(db, ctx.workspace_id, [c["id"] for c in campaigns])
    for c in campaigns:
        c["counts"] = counts.get(c["id"], {})
    return {"campaigns": campaigns}


@router.get("/{campaign_id}")
async def get_campaign(campaign_id: str, ctx: WorkspaceContext = Depends(get_workspace_context)):
    db = get_supabase_admin()
    campaign = _get_campaign(db, ctx, campaign_id)
    counts = _status_counts(db, ctx.workspace_id, [campaign_id]).get(campaign_id, {})

    latest_run = None
    try:
        runs = (
            db.table("agent_runs")
            .select("*")
            .eq("graph_name", "campaign_discovery")
            .eq("thread_id", campaign_id)
            .order("started_at", desc=True)
            .limit(1)
            .execute()
        ).data
        latest_run = runs[0] if runs else None
    except Exception as e:
        logger.warning("latest_run_lookup_failed", error=str(e))

    return {"campaign": campaign, "counts": counts, "latest_run": latest_run}


@router.post("/{campaign_id}/start")
async def start_campaign(
    campaign_id: str,
    sync: bool = False,
    ctx: WorkspaceContext = Depends(get_workspace_context),
):
    """Start (or resume) a campaign run. Enqueues on the worker; `?sync=true`
    runs inline (dev fallback when no worker is available)."""
    db = get_supabase_admin()
    campaign = _get_campaign(db, ctx, campaign_id)
    if campaign["status"] == "running":
        raise HTTPException(status_code=409, detail="Campaign is already running")

    if not sync and not settings.REDIS_URL:
        raise HTTPException(
            status_code=503,
            detail="Async campaign runs unavailable: REDIS_URL is not configured. "
            "Retry with ?sync=true for inline execution.",
        )

    run_id = str(uuid.uuid4())
    try:
        db.table("agent_runs").insert(
            {
                "id": run_id,
                "workspace_id": ctx.workspace_id,
                "user_id": ctx.user.id,
                "graph_name": "campaign_discovery",
                "status": "queued",
                "thread_id": campaign_id,
                "trigger": "api",
                "model": settings.MODEL_NAME,
            }
        ).execute()
    except Exception as e:
        logger.warning("agent_run_insert_failed", error=str(e))

    db.table("campaigns").update({"status": "running"}).eq("id", campaign_id).execute()

    if sync:
        from worker.tasks import run_campaign as run_campaign_task

        try:
            await run_campaign_task({}, run_id, campaign_id, ctx.workspace_id, ctx.user.id)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Campaign run failed: {e}")
        return {"run_id": run_id, "mode": "sync"}

    try:
        pool = await _get_arq_pool()
        await pool.enqueue_job("run_campaign", run_id, campaign_id, ctx.workspace_id, ctx.user.id)
    except Exception as e:
        db.table("campaigns").update({"status": campaign["status"]}).eq("id", campaign_id).execute()
        logger.error("campaign_enqueue_failed", error=str(e))
        raise HTTPException(status_code=503, detail=f"Could not enqueue campaign run: {e}")

    return {"run_id": run_id}


@router.post("/{campaign_id}/pause")
async def pause_campaign(campaign_id: str, ctx: WorkspaceContext = Depends(get_workspace_context)):
    """Pause a running campaign. The worker polls campaigns.status between
    prospects and aborts gracefully."""
    db = get_supabase_admin()
    campaign = _get_campaign(db, ctx, campaign_id)
    if campaign["status"] != "running":
        raise HTTPException(status_code=409, detail="Only running campaigns can be paused")
    updated = (
        db.table("campaigns").update({"status": "paused"}).eq("id", campaign_id).execute()
    ).data[0]
    return {"campaign": updated}

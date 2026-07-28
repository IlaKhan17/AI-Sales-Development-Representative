"""arq task functions."""

from typing import Any

from core import run_recorder
from core.errors import classify_exception
from core.logger import logger
from schemas.prospects import ProspectDiscoveryRequest
from services.discovery_runner import run_discovery


async def run_campaign(
    ctx: dict,
    run_id: str,
    campaign_id: str,
    workspace_id: str,
    user_id: str | None,
) -> dict:
    """Execute a queued campaign discovery/scoring run."""
    from core.db import get_supabase_admin
    from services.campaign_runner import run_campaign_pipeline

    logger.info("worker_campaign_started", run_id=run_id, campaign_id=campaign_id)
    run_recorder.update_run(run_id, status="running")
    try:
        counts = await run_campaign_pipeline(run_id, campaign_id, workspace_id, user_id)
        run_recorder.finish_run(run_id, "completed")
        logger.info("worker_campaign_completed", run_id=run_id, **counts)
        return counts
    except Exception as e:
        logger.error("worker_campaign_failed", run_id=run_id, error=str(e))
        try:
            get_supabase_admin().table("campaigns").update({"status": "failed"}).eq(
                "id", campaign_id
            ).execute()
        except Exception as db_err:
            logger.warning("campaign_fail_status_update_failed", error=str(db_err))
        run_recorder.finish_run(
            run_id, "failed", error=str(e), error_class=classify_exception(e).value
        )
        raise


async def run_prospect_discovery(
    ctx: dict,
    run_id: str,
    workspace_id: str | None,
    user_id: str | None,
    request_payload: dict[str, Any],
) -> dict:
    """Execute prospect discovery for a queued agent run."""
    logger.info("worker_discovery_started", run_id=run_id, user_id=user_id)
    run_recorder.update_run(run_id, status="running")
    try:
        request = ProspectDiscoveryRequest(**request_payload)
        result = await run_discovery(request, user_id)
        run_recorder.record_step(
            run_id,
            "discovery",
            status="completed",
            output_summary={
                "prospects_found": len(result["prospects"]),
                "prospects_saved": len(result["saved"]),
            },
        )
        run_recorder.finish_run(run_id, "completed")
        logger.info(
            "worker_discovery_completed",
            run_id=run_id,
            prospects=len(result["prospects"]),
        )
        return {"prospects_found": len(result["prospects"]), "prospects_saved": len(result["saved"])}
    except Exception as e:
        logger.error("worker_discovery_failed", run_id=run_id, error=str(e))
        run_recorder.finish_run(
            run_id, "failed", error=str(e), error_class=classify_exception(e).value
        )
        raise


async def poll_replies(ctx: dict) -> dict:
    """arq cron wrapper around the reply polling job (also runnable via
    `python -m jobs.poll_replies` as a Railway cron)."""
    from jobs.poll_replies import poll_replies_once

    return await poll_replies_once()


async def process_due_enrollments(ctx: dict) -> dict:
    """Draft the next sequence step for enrollments whose next_send_at is due.

    Approval-first ALWAYS: every generated follow-up lands in the approval
    queue (messages.status pending_approval). TODO: campaign.approval_policy
    'auto' is currently treated exactly like 'manual' — auto-approval of
    follow-ups after a human-approved first email is deferred until the
    LangGraph interrupt/checkpointer flow lands.
    """
    from datetime import datetime, timezone
    from types import SimpleNamespace

    from core.db import get_supabase_admin
    from services.outreach_service import create_draft

    db = get_supabase_admin()
    now = datetime.now(timezone.utc).isoformat()
    due = (
        db.table("sequence_enrollments")
        .select("*")
        .eq("status", "active")
        .lte("next_send_at", now)
        .limit(50)
        .execute()
    ).data or []

    drafted, skipped, failed = 0, 0, 0
    for enrollment in due:
        try:
            steps = (
                db.table("sequence_steps")
                .select("step_number, objective")
                .eq("sequence_id", enrollment["sequence_id"])
                .order("step_number")
                .execute()
            ).data or []
            sequence_length = len(steps)
            next_step = int(enrollment.get("current_step") or 0) + 1
            if next_step > sequence_length:
                db.table("sequence_enrollments").update(
                    {"status": "completed", "next_send_at": None}
                ).eq("id", enrollment["id"]).execute()
                skipped += 1
                continue

            # Skip if a draft/approval for this step already exists (idempotent)
            idem = f"{enrollment['prospect_id']}:{next_step}"
            existing = (
                db.table("messages")
                .select("id, status")
                .eq("idempotency_key", idem)
                .limit(1)
                .execute()
            ).data
            if existing and existing[0]["status"] not in ("rejected", "failed"):
                skipped += 1
                continue

            step = next((s for s in steps if s["step_number"] == next_step), None)
            task_ctx = SimpleNamespace(
                workspace_id=enrollment["workspace_id"],
                organization_id=enrollment["organization_id"],
                user_id=enrollment.get("created_by"),
            )
            await create_draft(
                task_ctx,
                enrollment["prospect_id"],
                step_number=next_step,
                enrollment_id=enrollment["id"],
                objective=(step or {}).get("objective"),
            )
            # Clear the due timestamp; it is re-set when this step is sent
            db.table("sequence_enrollments").update({"next_send_at": None}).eq(
                "id", enrollment["id"]
            ).execute()
            drafted += 1
        except Exception as e:
            failed += 1
            logger.error(
                "enrollment_draft_failed", enrollment_id=enrollment.get("id"), error=str(e)
            )

    logger.info("process_due_enrollments_done", drafted=drafted, skipped=skipped, failed=failed)
    return {"due": len(due), "drafted": drafted, "skipped": skipped, "failed": failed}

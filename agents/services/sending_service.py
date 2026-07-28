"""Approved-message sending: policy checks → idempotent Gmail send → bookkeeping.

The ONLY code path that sends outbound email. Callers must hold an approved
messages row; every send is re-checked against core.policy immediately before
the Gmail call.
"""

from datetime import datetime, timedelta, timezone
from typing import Any

from core import policy, run_recorder
from core.db import get_supabase_admin
from core.errors import PolicyBlockedError, ToolError
from core.logger import logger
from core.redis_client import get_redis
from services.google_service import GoogleService


class PolicyError(PolicyBlockedError):
    """Raised when a send is blocked; carries the structured violation list."""

    def __init__(self, violations: list[dict]):
        super().__init__(policy.format_violations(violations))
        self.violations = violations


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _one(db, table: str, **eq) -> dict | None:
    q = db.table(table).select("*")
    for k, v in eq.items():
        q = q.eq(k, v)
    rows = q.limit(1).execute().data
    return rows[0] if rows else None


def _audit(db, workspace_id: str, actor: str | None, action: str, subject_id: str, detail: dict):
    try:
        db.table("audit_logs").insert(
            {
                "workspace_id": workspace_id,
                "actor": actor,
                "action": action,
                "subject_type": "message",
                "subject_id": subject_id,
                "detail": detail,
            }
        ).execute()
    except Exception as e:
        logger.warning("audit_log_write_failed", error=str(e))


def _advance_enrollment(db, message: dict) -> None:
    """After a successful send: bump the enrollment to this step and schedule
    the next step (next_send_at = now + delay_days of the next step). Marks the
    enrollment completed when there is no next step."""
    if not message.get("enrollment_id"):
        return
    enrollment = _one(db, "sequence_enrollments", id=message["enrollment_id"])
    if not enrollment:
        return

    step_number = int(message.get("step_number") or 1)
    steps = (
        db.table("sequence_steps")
        .select("step_number, delay_days")
        .eq("sequence_id", enrollment["sequence_id"])
        .order("step_number")
        .execute()
    ).data or []
    next_step = next((s for s in steps if s["step_number"] == step_number + 1), None)

    update: dict[str, Any] = {"current_step": step_number}
    if next_step:
        delay_days = int(next_step.get("delay_days") or 3)
        update["next_send_at"] = (
            datetime.now(timezone.utc) + timedelta(days=delay_days)
        ).isoformat()
    else:
        update["status"] = "completed"
        update["next_send_at"] = None
    db.table("sequence_enrollments").update(update).eq("id", enrollment["id"]).execute()


async def send_approved_message(message_id: str, ctx) -> dict:
    """Send an approved outbound message.

    ctx: any object with .workspace_id and .user.id (WorkspaceContext) — or a
    SimpleNamespace equivalent from the worker.

    Returns the updated message row. Raises PolicyError (POLICY_BLOCKED) or
    ToolError (Gmail failure).
    """
    db = get_supabase_admin()
    redis = get_redis()
    actor_id = getattr(getattr(ctx, "user", None), "id", None) or getattr(ctx, "user_id", None)

    message = _one(db, "messages", id=message_id, workspace_id=ctx.workspace_id)
    if not message:
        raise ValueError(f"Message {message_id} not found in workspace")

    campaign = (
        _one(db, "campaigns", id=message["campaign_id"]) if message.get("campaign_id") else None
    )

    result = policy.check_send_allowed(db, redis, ctx.workspace_id, campaign, message)
    if not result.allowed:
        _audit(
            db,
            ctx.workspace_id,
            actor_id,
            "message_send_blocked",
            message_id,
            {"violations": result.violations},
        )
        raise PolicyError(result.violations)

    sender_user_id = message.get("created_by") or actor_id
    google = GoogleService()
    try:
        sent = await google.send_email(
            user_id=sender_user_id,
            to=message["to_email"],
            subject=message["subject"] or "",
            body=message["body"] or "",
        )
    except Exception as e:
        logger.error("gmail_send_failed", message_id=message_id, error=str(e))
        db.table("messages").update({"status": "failed"}).eq("id", message_id).execute()
        _audit(
            db, ctx.workspace_id, actor_id, "message_send_failed", message_id, {"error": str(e)}
        )
        run_recorder.record_tool_call(
            message.get("run_id"),
            "gmail.send_email",
            args_summary={"to": message.get("to_email"), "message_id": message_id},
            result_summary={"error": str(e)},
            status="failed",
        )
        raise ToolError(f"Gmail send failed: {e}") from e

    now = _now()
    updated = (
        db.table("messages")
        .update(
            {
                "status": "sent",
                "gmail_message_id": sent["message_id"],
                "gmail_thread_id": sent.get("thread_id"),
                "sent_at": now,
                "sent_by": actor_id,
            }
        )
        .eq("id", message_id)
        .execute()
    ).data
    message_row = updated[0] if updated else {**message, "status": "sent"}

    # Thread bookkeeping (idempotent on gmail_thread_id)
    if sent.get("thread_id"):
        try:
            db.table("email_threads").upsert(
                {
                    "organization_id": message.get("organization_id"),
                    "workspace_id": ctx.workspace_id,
                    "prospect_id": message.get("prospect_id"),
                    "gmail_thread_id": sent["thread_id"],
                    "last_message_at": now,
                },
                on_conflict="gmail_thread_id",
            ).execute()
        except Exception as e:
            logger.warning("email_thread_upsert_failed", error=str(e))

    policy.record_send(redis, ctx.workspace_id)
    _advance_enrollment(db, message_row)

    _audit(
        db,
        ctx.workspace_id,
        actor_id,
        "message_sent",
        message_id,
        {"to": message.get("to_email"), "gmail_message_id": sent["message_id"]},
    )
    run_recorder.record_tool_call(
        message.get("run_id"),
        "gmail.send_email",
        args_summary={"to": message.get("to_email"), "message_id": message_id},
        result_summary={"gmail_message_id": sent["message_id"]},
        status="completed",
    )
    logger.info("message_sent", message_id=message_id, to=message.get("to_email"))
    return message_row

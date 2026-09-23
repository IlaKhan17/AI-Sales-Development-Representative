"""Outreach draft generation + approval-gated flow.

Phase 5 design note (state-machine vs LangGraph interrupt):
The plan calls for LangGraph ``interrupt()`` before any send. interrupt()
requires a durable checkpointer (langgraph-checkpoint-postgres) wired to the
live database so a paused graph can be resumed with ``Command(resume=...)``
across processes. Until that checkpointer is provisioned, this module
implements the *equivalent* approval-gated flow with explicit persisted
states: draft → pending_approval → approved → sent (messages.status) mirrored
by an approvals row (pending → approved/rejected). The public API
(create_draft / decide) is deliberately shaped so the interrupt-based graph
can replace these internals later without changing routers or callers.
"""

from datetime import datetime, timezone
from typing import Any

from core.db import get_supabase_admin
from core.errors import PolicyBlockedError
from core.logger import logger
from services import email_checks, sending_service
from services.email_service import EmailService
from services.sending_service import PolicyError

VALID_DECISIONS = ("approve", "reject")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _one(db, table: str, **eq) -> dict | None:
    q = db.table(table).select("*")
    for k, v in eq.items():
        q = q.eq(k, v)
    rows = q.limit(1).execute().data
    return rows[0] if rows else None


def _actor_id(ctx) -> str | None:
    return getattr(getattr(ctx, "user", None), "id", None) or getattr(ctx, "user_id", None)


def _audit(db, workspace_id, actor, action, subject_type, subject_id, detail):
    try:
        db.table("audit_logs").insert(
            {
                "workspace_id": workspace_id,
                "actor": actor,
                "action": action,
                "subject_type": subject_type,
                "subject_id": subject_id,
                "detail": detail,
            }
        ).execute()
    except Exception as e:
        logger.warning("audit_log_write_failed", error=str(e))


def _get_product_profile(db, workspace_id: str) -> dict | None:
    rows = (
        db.table("product_profiles")
        .select("*")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    ).data
    return rows[0] if rows else None


def _get_approved_claims(db, workspace_id: str, limit: int = 10) -> list[str]:
    """Only claims with review_status='approved' may be cited in outreach."""
    rows = (
        db.table("approved_claims")
        .select("claim")
        .eq("workspace_id", workspace_id)
        .eq("review_status", "approved")
        .limit(limit)
        .execute()
    ).data or []
    return [r["claim"] for r in rows if r.get("claim")]


def _build_prospect_dict(db, prospect: dict, profile: dict | None, claims: list[str]) -> dict:
    company_name, industry = "", ""
    if prospect.get("company_id"):
        company = _one(db, "companies", id=prospect["company_id"])
        if company:
            company_name = company.get("name") or ""
            industry = company.get("industry") or ""

    evidence = (
        db.table("prospect_evidence")
        .select("claim")
        .eq("prospect_id", prospect["id"])
        .limit(5)
        .execute()
    ).data or []
    signals = (
        db.table("prospect_signals")
        .select("signal_type, value")
        .eq("prospect_id", prospect["id"])
        .execute()
    ).data or []

    pain_points = []
    for s in signals:
        if s.get("signal_type") in ("pain_signal", "buying_signal"):
            v = s.get("value") or {}
            text = v.get("summary") or v.get("text") or v.get("claim")
            if text:
                pain_points.append(str(text))

    return {
        "author": prospect.get("full_name") or "",
        "role": prospect.get("role_title") or "Unknown",
        "company": company_name,
        "industry": industry,
        "pain_points": pain_points,
        "solution_fit": (profile or {}).get("value_proposition") or "",
        "insights": "; ".join(e["claim"] for e in evidence if e.get("claim")),
        "approved_claims": claims,
    }


async def create_draft(
    ctx,
    prospect_id: str,
    step_number: int = 1,
    *,
    campaign_id: str | None = None,
    enrollment_id: str | None = None,
    objective: str | None = None,
    reply_context: str | None = None,
) -> dict:
    """Generate an outbound email draft and gate it behind an approval.

    Flow: render via the email draft graph (restricted to approved_claims) →
    deterministic email checks → insert messages row → approvals row (only if
    all checks pass; otherwise status stays 'draft' with the checks report and
    no approval is created until the draft is regenerated or manually fixed).

    Returns {message, approval, checks_failed}.
    """
    db = get_supabase_admin()
    actor = _actor_id(ctx)

    prospect = _one(db, "prospects_v2", id=prospect_id, workspace_id=ctx.workspace_id)
    if not prospect:
        raise ValueError("Prospect not found in workspace")
    if not prospect.get("email"):
        raise ValueError("Prospect has no email address — cannot draft outreach")

    campaign_id = campaign_id or prospect.get("campaign_id")
    profile = _get_product_profile(db, ctx.workspace_id)
    claims = _get_approved_claims(db, ctx.workspace_id)

    prospect_dict = _build_prospect_dict(db, prospect, profile, claims)
    if objective:
        prospect_dict["solution_fit"] = f"{prospect_dict['solution_fit']}\nEmail objective: {objective}".strip()
    if reply_context:
        prospect_dict["insights"] = (
            f"{prospect_dict['insights']}\nThey replied to our previous email with: {reply_context}"
        ).strip()

    draft = await EmailService().process(
        prospect_dict,
        sender_name=(profile or {}).get("sender_name"),
        sender_title=(profile or {}).get("sender_title"),
        sender_company=(profile or {}).get("name"),
        user_id=actor,
        workspace_id=ctx.workspace_id,
    )
    subject = draft["email"]["subject"]
    body = draft["email"]["content"]
    to_email = prospect["email"]

    failures = email_checks.run_checks(
        subject, body, to_email, (profile or {}).get("disallowed_claims")
    )

    idempotency_key = f"{prospect_id}:{step_number}"
    status = "pending_approval" if not failures else "draft"

    message_payload = {
        "organization_id": ctx.organization_id,
        "workspace_id": ctx.workspace_id,
        "campaign_id": campaign_id,
        "prospect_id": prospect_id,
        "enrollment_id": enrollment_id,
        "step_number": step_number,
        "direction": "outbound",
        "to_email": to_email,
        "subject": subject,
        "body": body,
        "status": status,
        "idempotency_key": idempotency_key,
        "created_by": actor,
    }

    # Idempotency: one message per (prospect, step). Re-drafting reuses the
    # row unless it was already sent (duplicate-send prevention).
    existing = _one(db, "messages", idempotency_key=idempotency_key)
    if existing:
        if existing["status"] == "sent":
            raise PolicyBlockedError(
                f"Step {step_number} for this prospect was already sent (idempotency)"
            )
        message = (
            db.table("messages")
            .update({**message_payload, "approval_id": None})
            .eq("id", existing["id"])
            .execute()
        ).data[0]
        # Expire any stale pending approval for the old draft
        if existing.get("approval_id"):
            try:
                db.table("approvals").update({"status": "expired"}).eq(
                    "id", existing["approval_id"]
                ).eq("status", "pending").execute()
            except Exception as e:
                logger.warning("stale_approval_expire_failed", error=str(e))
    else:
        message = db.table("messages").insert(message_payload).execute().data[0]

    approval = None
    if not failures:
        approval = (
            db.table("approvals")
            .insert(
                {
                    "workspace_id": ctx.workspace_id,
                    "run_id": None,
                    "subject_type": "message",
                    "subject_id": message["id"],
                    "payload": {"to": to_email, "subject": subject, "body": body},
                    "status": "pending",
                    "requested_by": actor,
                }
            )
            .execute()
        ).data[0]
        db.table("messages").update({"approval_id": approval["id"]}).eq(
            "id", message["id"]
        ).execute()
        message["approval_id"] = approval["id"]
    else:
        logger.warning(
            "draft_failed_checks", message_id=message["id"], failures=[f["code"] for f in failures]
        )

    _audit(
        db,
        ctx.workspace_id,
        actor,
        "draft_created",
        "message",
        message["id"],
        {"step_number": step_number, "checks_failed": [f["code"] for f in failures]},
    )
    return {"message": message, "approval": approval, "checks_failed": failures}


async def decide(
    ctx,
    approval_id: str,
    decision: str,
    edited_subject: str | None = None,
    edited_body: str | None = None,
) -> dict:
    """Approve or reject a pending message approval.

    Role gating (owner/admin/reviewer) is enforced at the router. On approval
    the message is updated (with any human edits), marked 'approved', then
    immediately sent (auto-send-after-approval). Returns
    {approval, message, send_result}.
    """
    if decision not in VALID_DECISIONS:
        raise ValueError(f"decision must be one of {VALID_DECISIONS}")

    db = get_supabase_admin()
    actor = _actor_id(ctx)

    approval = _one(db, "approvals", id=approval_id, workspace_id=ctx.workspace_id)
    if not approval:
        raise ValueError("Approval not found in workspace")
    if approval["status"] != "pending":
        raise ValueError(f"Approval already decided ({approval['status']})")
    if approval["subject_type"] != "message":
        raise ValueError("Only message approvals are supported")

    message = _one(db, "messages", id=approval["subject_id"], workspace_id=ctx.workspace_id)
    if not message:
        raise ValueError("Approved message no longer exists")

    new_status = "approved" if decision == "approve" else "rejected"
    approval = (
        db.table("approvals")
        .update({"status": new_status, "decided_by": actor, "decided_at": _now()})
        .eq("id", approval_id)
        .execute()
    ).data[0]

    message_update: dict[str, Any] = {"status": new_status}
    if decision == "approve":
        if edited_subject is not None:
            message_update["subject"] = edited_subject
        if edited_body is not None:
            message_update["body"] = edited_body
    message = (
        db.table("messages").update(message_update).eq("id", message["id"]).execute()
    ).data[0]

    _audit(
        db,
        ctx.workspace_id,
        actor,
        f"approval_{new_status}",
        "approval",
        approval_id,
        {
            "message_id": message["id"],
            "edited": bool(edited_subject or edited_body),
        },
    )

    send_result = None
    if decision == "approve":
        try:
            sent_message = await sending_service.send_approved_message(message["id"], ctx)
            message = sent_message
            send_result = {"status": "sent"}
        except PolicyError as e:
            send_result = {"status": "blocked", "error": str(e), "violations": e.violations}
        except Exception as e:
            send_result = {"status": "failed", "error": str(e)}
            message = _one(db, "messages", id=message["id"]) or message

    return {"approval": approval, "message": message, "send_result": send_result}

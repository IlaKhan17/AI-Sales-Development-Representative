"""Send-policy guard layer.

Pure-ish functions with injected db (Supabase-style client) and redis so they
are unit-testable with fakes. Every violation maps to ErrorClass.POLICY_BLOCKED
when raised by callers (see PolicyBlockedError in core.errors).

Checks enforced by check_send_allowed:
  NOT_APPROVED          message.status must be 'approved'
  SUPPRESSED            recipient present in suppression_entries
  DAILY_CAP             workspace daily send counter at/over the cap
  DUPLICATE             a message with the same idempotency_key already sent
  ENROLLMENT_STOPPED    the prospect's enrollment is stopped/paused/completed
  LOW_CONFIDENCE_EMAIL  prospect.email_confidence in (unverifiable, unknown)
                        unless the message carries low_confidence_override
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone

from core.logger import logger

DEFAULT_DAILY_CAP = 50
_COUNTER_TTL_SECONDS = 48 * 3600
_LOW_CONFIDENCE = ("unverifiable", "unknown")
_STOPPED_STATUSES = (
    "stopped_reply",
    "stopped_unsubscribe",
    "stopped_bounce",
    "paused",
    "completed",
)


@dataclass
class PolicyResult:
    allowed: bool
    violations: list[dict] = field(default_factory=list)


def daily_counter_key(workspace_id: str, now: datetime | None = None) -> str:
    day = (now or datetime.now(timezone.utc)).strftime("%Y-%m-%d")
    return f"sends:{workspace_id}:{day}"


def _rows(query) -> list[dict]:
    result = query.execute()
    return result.data or []


def resolve_daily_cap(db, workspace_id: str, campaign: dict | None) -> int:
    """min(campaign.daily_cap, product_profile.daily_send_limit, default 50)."""
    candidates: list[int] = []
    if campaign and campaign.get("daily_cap"):
        candidates.append(int(campaign["daily_cap"]))
    try:
        profiles = _rows(
            db.table("product_profiles")
            .select("daily_send_limit")
            .eq("workspace_id", workspace_id)
            .order("created_at", desc=True)
            .limit(1)
        )
        if profiles and profiles[0].get("daily_send_limit"):
            candidates.append(int(profiles[0]["daily_send_limit"]))
    except Exception as e:  # missing table/column — fall back to defaults
        logger.warning("policy_profile_lookup_failed", error=str(e))
    candidates.append(DEFAULT_DAILY_CAP)
    return min(candidates)


def check_send_allowed(
    db,
    redis,
    workspace_id: str,
    campaign: dict | None,
    message: dict,
) -> PolicyResult:
    """Run all send-policy checks for an outbound message. Never raises for a
    policy reason — returns the full violation list so callers can surface it."""
    violations: list[dict] = []

    # 1. Approval state
    if message.get("status") != "approved":
        violations.append(
            {
                "code": "NOT_APPROVED",
                "detail": f"Message status is '{message.get('status')}', must be 'approved'",
            }
        )

    # 2. Suppression list
    to_email = (message.get("to_email") or "").strip().lower()
    if to_email:
        suppressed = _rows(
            db.table("suppression_entries")
            .select("id, reason")
            .eq("workspace_id", workspace_id)
            .eq("email", to_email)
            .limit(1)
        )
        if suppressed:
            violations.append(
                {
                    "code": "SUPPRESSED",
                    "detail": f"Recipient {to_email} is suppressed (reason: {suppressed[0].get('reason')})",
                }
            )

    # 3. Daily cap (Redis counter)
    cap = resolve_daily_cap(db, workspace_id, campaign)
    try:
        raw = redis.get(daily_counter_key(workspace_id))
        sent_today = int(raw) if raw else 0
    except Exception as e:
        logger.warning("policy_redis_read_failed", error=str(e))
        sent_today = 0  # fail-open on infra error; the counter is best-effort
    if sent_today >= cap:
        violations.append(
            {
                "code": "DAILY_CAP",
                "detail": f"Daily cap reached ({sent_today}/{cap} sends today)",
            }
        )

    # 4. Duplicate send (idempotency key already sent)
    idem = message.get("idempotency_key")
    if idem:
        dupes = _rows(
            db.table("messages")
            .select("id")
            .eq("idempotency_key", idem)
            .eq("status", "sent")
            .limit(2)
        )
        if any(d["id"] != message.get("id") for d in dupes):
            violations.append(
                {
                    "code": "DUPLICATE",
                    "detail": f"A message with idempotency_key '{idem}' was already sent",
                }
            )

    # 5. Enrollment must still be active
    if message.get("enrollment_id"):
        enrollments = _rows(
            db.table("sequence_enrollments")
            .select("id, status")
            .eq("id", message["enrollment_id"])
            .limit(1)
        )
        if enrollments and enrollments[0]["status"] in _STOPPED_STATUSES:
            violations.append(
                {
                    "code": "ENROLLMENT_STOPPED",
                    "detail": f"Enrollment is '{enrollments[0]['status']}'",
                }
            )

    # 6. Email confidence gate
    if not message.get("low_confidence_override"):
        prospects = _rows(
            db.table("prospects_v2")
            .select("id, email_confidence")
            .eq("id", message.get("prospect_id"))
            .limit(1)
        )
        if prospects:
            confidence = (prospects[0].get("email_confidence") or "unknown").lower()
            if confidence in _LOW_CONFIDENCE:
                violations.append(
                    {
                        "code": "LOW_CONFIDENCE_EMAIL",
                        "detail": f"Prospect email confidence is '{confidence}' and no override was set",
                    }
                )

    return PolicyResult(allowed=not violations, violations=violations)


def record_send(redis, workspace_id: str) -> None:
    """Increment today's send counter (48h TTL so it survives TZ edges)."""
    key = daily_counter_key(workspace_id)
    try:
        redis.incr(key)
        redis.expire(key, _COUNTER_TTL_SECONDS)
    except Exception as e:
        logger.warning("policy_record_send_failed", error=str(e))


def format_violations(violations: list[dict]) -> str:
    return "; ".join(f"{v['code']}: {v['detail']}" for v in violations)


__all__: list[str] = [
    "PolicyResult",
    "check_send_allowed",
    "record_send",
    "resolve_daily_cap",
    "daily_counter_key",
    "format_violations",
    "DEFAULT_DAILY_CAP",
]

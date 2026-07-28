"""Reply polling job.

For every connected Google account: fetch recent inbound messages, match them
to our outbound threads, classify intent (12-intent classifier), persist a
replies row and enforce stop conditions:

  - unsubscribe            → suppression entry + enrollments stopped_unsubscribe
  - automatic (bounce)     → suppression entry + enrollments stopped_bounce
  - ANY reply              → prospect's active enrollments stopped_reply
                             (stop-on-reply; the sent message row stays 'sent')

Runnable standalone (Railway cron):   python -m jobs.poll_replies
Also registered as an arq cron (worker/main.py) every 10 minutes so either
deployment mode works.
"""

import asyncio
import re
from datetime import datetime, timezone

from core.db import get_supabase_admin
from core.logger import logger
from services.google_service import GoogleService
from services.reply_classifier_service import classify_reply

_EMAIL_IN_HEADER = re.compile(r"<([^>]+)>")
_BOUNCE_SENDERS = ("mailer-daemon", "postmaster", "mail delivery subsystem")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _extract_email(header_value: str) -> str:
    m = _EMAIL_IN_HEADER.search(header_value or "")
    return (m.group(1) if m else (header_value or "")).strip().lower()


def _is_bounce(from_email: str, subject: str) -> bool:
    probe = f"{from_email} {subject}".lower()
    return any(s in probe for s in _BOUNCE_SENDERS) or "delivery status notification" in probe


def _stop_enrollments(db, prospect_id: str, status: str) -> None:
    try:
        db.table("sequence_enrollments").update({"status": status, "next_send_at": None}).eq(
            "prospect_id", prospect_id
        ).eq("status", "active").execute()
    except Exception as e:
        logger.warning("enrollment_stop_failed", prospect_id=prospect_id, error=str(e))


def _suppress(db, org_id, workspace_id, email: str, reason: str) -> None:
    try:
        db.table("suppression_entries").upsert(
            {
                "organization_id": org_id,
                "workspace_id": workspace_id,
                "email": email.lower(),
                "domain": email.split("@")[-1].lower() if "@" in email else None,
                "reason": reason,
            },
            on_conflict="workspace_id,email",
        ).execute()
    except Exception as e:
        logger.warning("suppression_insert_failed", email=email, error=str(e))


async def _process_inbound(db, msg: dict) -> bool:
    """Handle one inbound Gmail message. Returns True if a replies row was created."""
    gmail_id = msg["id"]
    existing = (
        db.table("replies").select("id").eq("gmail_message_id", gmail_id).limit(1).execute()
    ).data
    if existing:
        return False

    # Match to one of our outbound messages by Gmail thread
    thread_id = msg.get("threadId")
    matched = None
    if thread_id:
        rows = (
            db.table("messages")
            .select("*")
            .eq("gmail_thread_id", thread_id)
            .eq("direction", "outbound")
            .eq("status", "sent")
            .limit(1)
            .execute()
        ).data
        matched = rows[0] if rows else None
    if not matched:
        return False  # not a reply to our outreach

    from_email = _extract_email(msg.get("from", ""))
    subject = msg.get("subject", "")
    body = msg.get("body") or msg.get("snippet") or ""

    if _is_bounce(from_email, subject):
        classification = {
            "intent": "automatic",
            "confidence": 1.0,
            "questions": [],
            "recommended_action": "suppress",
            "requires_human_review": False,
        }
    else:
        classification = await classify_reply(body, subject=subject, from_email=from_email)

    db.table("replies").insert(
        {
            "organization_id": matched.get("organization_id"),
            "workspace_id": matched.get("workspace_id"),
            "prospect_id": matched.get("prospect_id"),
            "message_id": matched["id"],
            "gmail_message_id": gmail_id,
            "from_email": from_email,
            "subject": subject,
            "body": body,
            "intent": classification["intent"],
            "intent_confidence": classification["confidence"],
            "requires_human_review": classification["requires_human_review"],
            "recommended_action": classification["recommended_action"],
            "classified_at": _now(),
        }
    ).execute()

    prospect_id = matched.get("prospect_id")
    workspace_id = matched.get("workspace_id")
    org_id = matched.get("organization_id")
    recipient = matched.get("to_email") or from_email

    if classification["intent"] == "unsubscribe":
        _suppress(db, org_id, workspace_id, recipient, "unsubscribe")
        if prospect_id:
            _stop_enrollments(db, prospect_id, "stopped_unsubscribe")
    elif _is_bounce(from_email, subject):
        _suppress(db, org_id, workspace_id, recipient, "bounce")
        db.table("messages").update({"status": "bounced"}).eq("id", matched["id"]).execute()
        if prospect_id:
            _stop_enrollments(db, prospect_id, "stopped_bounce")
    elif prospect_id:
        # Stop-on-reply: any human reply pauses further automated sends
        _stop_enrollments(db, prospect_id, "stopped_reply")

    # Thread bookkeeping
    if thread_id:
        try:
            db.table("email_threads").update({"last_message_at": _now()}).eq(
                "gmail_thread_id", thread_id
            ).execute()
        except Exception as e:
            logger.warning("thread_touch_failed", error=str(e))

    logger.info(
        "reply_recorded",
        gmail_message_id=gmail_id,
        intent=classification["intent"],
        prospect_id=prospect_id,
    )
    return True


async def poll_replies_once() -> dict:
    """One polling pass over every connected Google account."""
    db = get_supabase_admin()
    google = GoogleService()
    tokens = (db.table("google_tokens").select("user_id").execute()).data or []

    accounts, new_replies = 0, 0
    for row in tokens:
        user_id = row["user_id"]
        try:
            inbound = await google.get_replies_for_sent_emails(user_id, max_results=25)
        except Exception as e:
            logger.warning("reply_fetch_failed", user_id=user_id, error=str(e))
            continue
        accounts += 1
        for msg in inbound:
            try:
                if await _process_inbound(db, msg):
                    new_replies += 1
            except Exception as e:
                logger.error("reply_process_failed", gmail_id=msg.get("id"), error=str(e))

    logger.info("poll_replies_done", accounts=accounts, new_replies=new_replies)
    return {"accounts": accounts, "new_replies": new_replies}


if __name__ == "__main__":
    asyncio.run(poll_replies_once())

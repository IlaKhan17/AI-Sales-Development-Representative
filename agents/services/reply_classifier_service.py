"""12-intent reply classifier (prompt: reply_intent).

Output contract:
    {intent, confidence, questions, recommended_action, requires_human_review}

requires_human_review is forced true when confidence < 0.7 or the intent is
one of objection / referral / ambiguous / wrong_person, regardless of what
the model says.
"""

from core.logger import logger
from core.prompts import load_prompt, render
from services.llm_service import LLMService

INTENTS = {
    "interested",
    "meeting_requested",
    "needs_information",
    "objection",
    "referral",
    "not_now",
    "not_interested",
    "unsubscribe",
    "out_of_office",
    "wrong_person",
    "automatic",
    "ambiguous",
}
ACTIONS = {"reply_draft", "schedule", "escalate", "suppress", "none"}
REVIEW_INTENTS = {"objection", "referral", "ambiguous", "wrong_person"}
REVIEW_CONFIDENCE_THRESHOLD = 0.7

_DEFAULT_ACTION = {
    "unsubscribe": "suppress",
    "meeting_requested": "schedule",
    "interested": "reply_draft",
    "needs_information": "reply_draft",
    "objection": "escalate",
    "referral": "escalate",
    "wrong_person": "escalate",
    "ambiguous": "escalate",
    "out_of_office": "none",
    "automatic": "none",
    "not_now": "none",
    "not_interested": "none",
}


def prompt_version() -> int:
    return load_prompt("reply_intent").version


async def classify_reply(body: str, subject: str = "", from_email: str = "") -> dict:
    """Classify a single reply. Never raises — falls back to ambiguous."""
    rp = render("reply_intent", body=body or "", subject=subject or "", from_email=from_email or "")
    try:
        raw = await LLMService().get_json_response(
            rp.system,
            rp.user,
            {
                "intent": "string",
                "confidence": "number 0-1",
                "questions": ["string"],
                "recommended_action": "string",
            },
        )
    except Exception as e:
        logger.error("reply_classification_failed", error=str(e))
        raw = {}

    intent = str(raw.get("intent", "")).strip().lower()
    if intent not in INTENTS:
        intent = "ambiguous"
    try:
        confidence = max(0.0, min(1.0, float(raw.get("confidence", 0.0))))
    except (TypeError, ValueError):
        confidence = 0.0
    questions = [str(q) for q in raw.get("questions") or [] if q]
    action = str(raw.get("recommended_action", "")).strip().lower()
    if action not in ACTIONS:
        action = _DEFAULT_ACTION.get(intent, "escalate")

    requires_human_review = (
        confidence < REVIEW_CONFIDENCE_THRESHOLD or intent in REVIEW_INTENTS
    )
    return {
        "intent": intent,
        "confidence": confidence,
        "questions": questions,
        "recommended_action": action,
        "requires_human_review": requires_human_review,
    }

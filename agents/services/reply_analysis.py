"""Interim reply analysis helpers.

Replaces the legacy reply_tracker module (which hardcoded a specific company
and the author's personal calendar link). Will be superseded by the full
12-intent reply classifier in the reply graph.
"""

from typing import Tuple

from core.logger import logger
from core.prompts import render
from services.llm_service import LLMService


async def analyze_sentiment(body: str) -> Tuple[str, str]:
    """Classify a reply's sentiment and intent.

    Returns (sentiment, intent) where sentiment is one of
    Positive/Neutral/Negative and intent is one of
    "Follow-Up Required", "Interested", "Not Interested", "Needs Information".

    Uses prompt registry id 'reply_classify'.
    """
    llm = LLMService()
    rp = render("reply_classify", body=body)
    try:
        result = await llm.get_json_response(
            rp.system,
            rp.user,
            {"sentiment": "string", "intent": "string"},
        )
        return result.get("sentiment", "Neutral"), result.get("intent", "Follow-Up Required")
    except Exception as e:
        logger.error(f"Error analyzing reply sentiment: {e}")
        return "Neutral", "Follow-Up Required"


async def generate_followup_email(sender: str, subject: str, body: str) -> str:
    """Draft a follow-up reply to an email response. Generic — no invented
    claims, no meeting links; scheduling is proposed in plain text only.

    Uses prompt registry id 'reply_followup'."""
    llm = LLMService()
    rp = render("reply_followup", sender=sender, subject=subject, body=body)
    try:
        return await llm.get_text_response(rp.system, rp.user)
    except Exception as e:
        logger.error(f"Error generating follow-up email: {e}")
        return ""

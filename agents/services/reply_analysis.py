"""Interim reply analysis helpers.

Replaces the legacy reply_tracker module (which hardcoded a specific company
and the author's personal calendar link). Will be superseded by the full
12-intent reply classifier in the reply graph.
"""

from typing import Tuple

from core.logger import logger
from services.llm_service import LLMService


async def analyze_sentiment(body: str) -> Tuple[str, str]:
    """Classify a reply's sentiment and intent.

    Returns (sentiment, intent) where sentiment is one of
    Positive/Neutral/Negative and intent is one of
    "Follow-Up Required", "Interested", "Not Interested", "Needs Information".
    """
    llm = LLMService()
    system_prompt = (
        "You are a sales assistant analyzing a reply to an outbound sales email. "
        "Classify its sentiment and intent."
    )
    user_prompt = f"""
Email reply:
{body}

Return JSON:
{{
  "sentiment": "Positive" | "Neutral" | "Negative",
  "intent": "Interested" | "Follow-Up Required" | "Needs Information" | "Not Interested"
}}
"""
    try:
        result = await llm.get_json_response(
            system_prompt,
            user_prompt,
            {"sentiment": "string", "intent": "string"},
        )
        return result.get("sentiment", "Neutral"), result.get("intent", "Follow-Up Required")
    except Exception as e:
        logger.error(f"Error analyzing reply sentiment: {e}")
        return "Neutral", "Follow-Up Required"


async def generate_followup_email(sender: str, subject: str, body: str) -> str:
    """Draft a follow-up reply to an email response. Generic — no invented
    claims, no meeting links; scheduling is proposed in plain text only."""
    llm = LLMService()
    system_prompt = (
        "You are a helpful sales development representative writing a short, "
        "professional follow-up reply. Address the sender's questions directly. "
        "Do not invent product claims, customer names, or metrics. Do not include "
        "links. If a meeting makes sense, propose finding a time by reply."
    )
    user_prompt = f"""
Original subject: {subject}
From: {sender}

Their reply:
{body}

Write the follow-up email body only (no subject line).
"""
    try:
        return await llm.get_text_response(system_prompt, user_prompt)
    except Exception as e:
        logger.error(f"Error generating follow-up email: {e}")
        return ""

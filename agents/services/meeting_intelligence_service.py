"""Sales-oriented meeting intelligence.

Extracts grounded insights (objections, competitors, budget signals, timeline,
decision criteria, requirements, questions, action items) from a meeting
transcript via the versioned ``meeting_insights`` prompt, and persists them to
``meeting_insights`` / ``action_items``.
"""

from datetime import datetime, timezone

from core.db import get_supabase_admin
from core.logger import logger
from core.prompts import load_prompt, render
from services.llm_service import LLMService

JSON_STRUCTURE = {
    "summary": "string",
    "objections": [{"text": "string", "speaker": "string|null"}],
    "competitors": [{"name": "string", "context": "string"}],
    "budget_signals": ["string"],
    "timeline": "string|null",
    "decision_criteria": ["string"],
    "requirements": ["string"],
    "questions_asked": ["string"],
    "action_items": [
        {"description": "string", "owner": "string|null", "due_hint": "string|null"}
    ],
}

_LIST_KEYS = (
    "objections",
    "competitors",
    "budget_signals",
    "decision_criteria",
    "requirements",
    "questions_asked",
    "action_items",
)


class MeetingIntelligenceService:
    prompt_id = "meeting_insights"

    def __init__(self, llm_service: LLMService | None = None):
        self.llm = llm_service or LLMService()
        self.prompt_version = load_prompt(self.prompt_id).version

    async def analyze(self, transcript: str, meeting_meta: dict) -> dict:
        """Run the meeting_insights prompt over a transcript.

        ``meeting_meta``: at least {title}; optional {scheduled_at/created_at}.
        Returns the normalized insights dict (JSON_STRUCTURE shape).
        """
        rp = render(
            self.prompt_id,
            title=meeting_meta.get("title") or "Untitled Meeting",
            date=meeting_meta.get("scheduled_at")
            or meeting_meta.get("created_at")
            or datetime.now(timezone.utc).date().isoformat(),
            transcript=transcript or "",
        )
        raw = await self.llm.get_json_response(
            system_prompt=rp.system,
            user_prompt=rp.user,
            json_structure=JSON_STRUCTURE,
        )
        return self._normalize(raw if isinstance(raw, dict) else {})

    def _normalize(self, raw: dict) -> dict:
        out: dict = {
            "summary": raw.get("summary") or "",
            "timeline": raw.get("timeline") or None,
        }
        for key in _LIST_KEYS:
            val = raw.get(key)
            out[key] = val if isinstance(val, list) else []
        # Drop malformed action items
        out["action_items"] = [
            ai
            for ai in out["action_items"]
            if isinstance(ai, dict) and ai.get("description")
        ]
        return out

    def store(
        self,
        meeting_id: str,
        organization_id: str,
        workspace_id: str,
        insights: dict,
        *,
        run_id: str | None = None,
        model: str | None = None,
    ) -> None:
        """Persist insights + action items rows for a meeting."""
        db = get_supabase_admin()
        db.table("meeting_insights").upsert(
            {
                "meeting_id": meeting_id,
                "organization_id": organization_id,
                "workspace_id": workspace_id,
                "summary": insights.get("summary") or "",
                "objections": insights.get("objections") or [],
                "competitors": insights.get("competitors") or [],
                "budget_signals": insights.get("budget_signals") or [],
                "timeline": insights.get("timeline"),
                "decision_criteria": insights.get("decision_criteria") or [],
                "requirements": insights.get("requirements") or [],
                "questions_asked": insights.get("questions_asked") or [],
                "run_id": run_id,
                "prompt_version": self.prompt_version,
                "model": model,
            },
            on_conflict="meeting_id",
        ).execute()

        items = [
            {
                "meeting_id": meeting_id,
                "organization_id": organization_id,
                "workspace_id": workspace_id,
                "description": str(ai.get("description")),
                "owner": ai.get("owner"),
                "due_hint": ai.get("due_hint"),
                "status": "open",
            }
            for ai in (insights.get("action_items") or [])
            if isinstance(ai, dict) and ai.get("description")
        ]
        if items:
            db.table("action_items").insert(items).execute()
        logger.info(
            "meeting_insights_stored",
            meeting_id=meeting_id,
            action_items=len(items),
        )

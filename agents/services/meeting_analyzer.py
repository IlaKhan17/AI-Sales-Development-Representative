import logging
from typing import Any, Dict

from core.prompts import render
from services.llm_service import LLMService

logger = logging.getLogger(__name__)

class MeetingAnalyzer:
    def __init__(self):
        self.llm_service = LLMService()
    async def analyze_meeting(self, transcript: str, meeting_info: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze meeting transcript and generate insights.

        Uses prompt registry id 'meeting_summary'."""
        try:
            rp = render(
                "meeting_summary",
                title=meeting_info['title'],
                date=meeting_info['date'],
                transcript=transcript,
            )
            # Define the expected JSON structure
            json_structure = {
                "ai_summary": "",
                "action_items": [],
                "main_topics": [],
                "insights": [],
                "formatted_transcript": ""
            }

            # Call the LLM service to get the response
            ai_analysis = await self.llm_service.get_json_response(
                system_prompt=rp.system,
                user_prompt=rp.user,
                json_structure=json_structure
            )

            # Return structured analysis
            return {
                "ai_summary": ai_analysis.get("ai_summary", ""),
                "action_items": ai_analysis.get("action_items", []),
                "main_topics": ai_analysis.get("main_topics", []),
                "insights": ai_analysis.get("insights", []),
                "formatted_transcript": ai_analysis.get("formatted_transcript", "")
            }

        except Exception as e:
            logger.error(f"Error analyzing meeting: {str(e)}")
            raise

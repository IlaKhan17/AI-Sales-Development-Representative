import json
from typing import Any, Dict, List, Optional, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph

from config import settings
from core import run_recorder
from core.errors import classify_exception
from core.logger import logger
from core.prompts import load_prompt, render
from core.tracing import step_span

from .llm_service import LLMService

GRAPH_NAME = "outreach_email_draft"
EMAIL_PROMPT_IDS = ["email_subject", "email_content", "email_refine", "email_final"]


def _email_prompt_versions() -> Dict[str, int]:
    return {pid: load_prompt(pid).version for pid in EMAIL_PROMPT_IDS}

# Used only when the workspace has no product profile (legacy endpoints, evals).
DEFAULT_SENDER_COMPANY = "our team"


def _fallback_subject(state: "EmailState") -> str:
    return f"A quick idea for {state['prospect']['company'] or 'your team'}"


def _fallback_content(state: "EmailState") -> str:
    p = state["prospect"]
    pains = ", ".join(p["pain_points"]) or "your current priorities"
    sign_off = "\n".join(
        v for v in (state.get("sender_name"), state.get("sender_title"), state["sender_company"]) if v
    )
    return (
        f"Dear {p['author']},\n\nI noticed your focus on {pains} at {p['company']}. "
        f"{state['sender_company']} may be able to help with these challenges.\n\n"
        f"Could we schedule a brief call to discuss?\n\nBest regards,\n{sign_off}"
    )


def _strip_subject_line(text: str) -> str:
    """Drop a leading 'Subject: ...' line the model sometimes echoes into the body."""
    lines = text.lstrip().splitlines()
    if lines and lines[0].lower().startswith("subject:"):
        lines = lines[1:]
    return "\n".join(lines).lstrip()


class ProspectData(TypedDict):
    author: str
    role: str
    company: str
    alignment_score: float
    industry: str
    pain_points: List[str]
    solution_fit: str
    insights: str
    approved_claims: List[str]

class EmailState(TypedDict):
    subject: str
    content: str
    refined_content: str
    final_email: str
    prospect: ProspectData
    attempts: int
    should_continue: bool
    run_id: Optional[str]
    sender_name: Optional[str]
    sender_title: Optional[str]
    sender_company: str
    prompt_versions: Dict[str, int]

class EmailDraft(TypedDict):
    prospect: ProspectData
    email: Dict[str, str]

class EmailService:
    def __init__(self):
        self.llm_service = LLMService()
        self.max_attempts = 2
        self.workflow = self.build_workflow()

    def build_workflow(self) -> StateGraph:
        """Creates the email workflow graph"""
        workflow = StateGraph(EmailState)

        # Add nodes with async functions (wrapped with tracing step spans)
        workflow.add_node("create_subject", self._traced("create_subject", self.subject_agent))
        workflow.add_node("build_content", self._traced("build_content", self.content_builder_agent))
        workflow.add_node("refine_content", self._traced("refine_content", self.content_refiner_agent))
        workflow.add_node("create_final", self._traced("create_final", self.final_draft_agent))

        # Define edges
        workflow.add_edge("create_subject", "build_content")
        workflow.add_edge("build_content", "refine_content")

        # Conditional edge for refinement loop
        workflow.add_conditional_edges(
            "refine_content",
            lambda x: "refine_content" if x["should_continue"] else "create_final",
            {
                "refine_content": "refine_content",
                "create_final": "create_final"
            }
        )

        workflow.set_entry_point("create_subject")
        workflow.add_edge("create_final", END)

        return workflow.compile()

    @staticmethod
    def _format_approved_claims(claims: List[str]) -> str:
        """Render approved claims as a bullet list for the content prompt."""
        claims = [c for c in (claims or []) if c]
        if not claims:
            return "(none)"
        return "\n".join(f"                  - {c}" for c in claims)

    @staticmethod
    def _traced(node_name: str, fn):
        """Wrap a node so each execution is recorded as a step span."""
        async def wrapper(state: "EmailState") -> "EmailState":
            async with step_span(state.get("run_id"), node_name):
                return await fn(state)
        return wrapper

    async def subject_agent(self, state: EmailState) -> EmailState:
        """Agent responsible for creating email subject"""
        try:
            rp = render(
                "email_subject",
                author=state['prospect']['author'],
                role=state['prospect']['role'],
                company=state['prospect']['company'],
                pain_points=', '.join(state['prospect']['pain_points']),
                industry=state['prospect']['industry'],
                solution_fit=state['prospect']['solution_fit'],
                insights=state['prospect']['insights'],
                sender_company=state['sender_company'],
            )
            messages = [SystemMessage(content=rp.system), HumanMessage(content=rp.user)]

            response = await self.llm_service.llm.ainvoke(messages)

            # Clean the response
            cleaned_response = response.content.strip()
            if cleaned_response.startswith('```json'):
                cleaned_response = cleaned_response.replace('```json', '').replace('```', '').strip()
            elif cleaned_response.startswith('```'):
                cleaned_response = cleaned_response.replace('```', '').strip()

            # Log the cleaned response for debugging
            logger.debug(f"Cleaned subject response: {cleaned_response}")

            try:
                state['subject'] = json.loads(cleaned_response)["subject"]
            except json.JSONDecodeError as e:
                logger.error(f"JSON decode error in subject agent: {str(e)}")
                logger.error(f"Raw response: {response.content}")
                # Fallback: use a default subject or extract it from text
                if "subject" in cleaned_response.lower():
                    # Try to extract subject from text format
                    try:
                        subject_text = cleaned_response.split("subject")[1].strip()
                        # Remove any quotes, colons, etc.
                        subject_text = subject_text.strip('":,\n {}').strip()
                        state['subject'] = subject_text
                    except Exception:
                        state['subject'] = _fallback_subject(state)
                else:
                    state['subject'] = _fallback_subject(state)

            return state

        except Exception as e:
            logger.error(f"Error in subject agent: {str(e)}")
            logger.error(f"State: {state}")
            logger.error(f"Response: {response.content if 'response' in locals() else 'No response'}")
            # Provide a fallback subject
            state['subject'] = _fallback_subject(state)
            return state

    async def content_builder_agent(self, state: EmailState) -> EmailState:
        """Agent responsible for creating initial email content"""
        try:
            rp = render(
                "email_content",
                author=state['prospect']['author'],
                role=state['prospect']['role'],
                company=state['prospect']['company'],
                pain_points=', '.join(state['prospect']['pain_points']),
                industry=state['prospect']['industry'],
                solution_fit=state['prospect']['solution_fit'],
                insights=state['prospect']['insights'],
                subject=state['subject'],
                approved_claims=self._format_approved_claims(
                    state['prospect'].get('approved_claims', [])
                ),
            )
            messages = [SystemMessage(content=rp.system), HumanMessage(content=rp.user)]

            response = await self.llm_service.llm.ainvoke(messages)

            # Clean the response
            cleaned_response = response.content.strip()
            if cleaned_response.startswith('```json'):
                cleaned_response = cleaned_response.replace('```json', '').replace('```', '').strip()
            elif cleaned_response.startswith('```'):
                cleaned_response = cleaned_response.replace('```', '').strip()

            # Log the cleaned response for debugging
            logger.debug(f"Cleaned content response: {cleaned_response}")

            try:
                state['content'] = json.loads(cleaned_response)["content"]
            except json.JSONDecodeError as e:
                logger.error(f"JSON decode error in content builder agent: {str(e)}")
                logger.error(f"Raw response: {response.content}")
                # Fallback: use the raw response if it seems to contain email content
                if "Dear" in cleaned_response or state['prospect']['author'] in cleaned_response:
                    state['content'] = cleaned_response
                else:
                    state['content'] = _fallback_content(state)

            return state

        except Exception as e:
            logger.error(f"Error in content builder agent: {str(e)}")
            logger.error(f"State: {state}")
            logger.error(f"Response: {response.content if 'response' in locals() else 'No response'}")
            # Fallback: provide a generic content
            state['content'] = _fallback_content(state)
            return state

    async def content_refiner_agent(self, state: EmailState) -> EmailState:
        """Agent responsible for refining email content"""
        try:
            rp = render(
                "email_refine",
                subject=state['subject'],
                content=state['content'],
                role=state['prospect']['role'],
                industry=state['prospect']['industry'],
            )
            messages = [SystemMessage(content=rp.system), HumanMessage(content=rp.user)]

            response = await self.llm_service.llm.ainvoke(messages)

            # Clean the response
            cleaned_response = response.content.strip()
            if cleaned_response.startswith('```json'):
                cleaned_response = cleaned_response.replace('```json', '').replace('```', '').strip()

            # Log the cleaned response for debugging
            logger.debug(f"Cleaned response: {cleaned_response}")

            try:
                result = json.loads(cleaned_response)
            except json.JSONDecodeError as e:
                logger.error(f"JSON decode error: {str(e)}")
                logger.error(f"Raw response: {response.content}")
                # Fallback: keep the content as is
                result = {
                    "refined_content": state['content'],
                    "needs_another_iteration": False
                }

            state['refined_content'] = result.get('refined_content', state['content'])
            state['should_continue'] = result.get('needs_another_iteration', False) and state['attempts'] < self.max_attempts
            state['attempts'] += 1
            return state

        except Exception as e:
            logger.error(f"Error in content refiner agent: {str(e)}")
            logger.error(f"State: {state}")
            logger.error(f"Response: {response.content if 'response' in locals() else 'No response'}")
            # Fallback: return state without refinement
            state['refined_content'] = state['content']
            state['should_continue'] = False
            state['attempts'] += 1
            return state

    async def final_draft_agent(self, state: EmailState) -> EmailState:
        """Agent responsible for creating the final email draft"""
        try:
            sender_lines = "\n".join(
                f"                  {label}: {value}"
                for label, value in (
                    ("Name", state.get("sender_name")),
                    ("Title", state.get("sender_title")),
                    ("Company", state["sender_company"]),
                )
                if value
            )
            rp = render(
                "email_final",
                subject=state['subject'],
                refined_content=state['refined_content'],
                author=state['prospect']['author'],
                role=state['prospect']['role'],
                company=state['prospect']['company'],
                sender_lines=sender_lines,
            )
            messages = [SystemMessage(content=rp.system), HumanMessage(content=rp.user)]

            response = await self.llm_service.llm.ainvoke(messages)

            # Simply use the raw response content without JSON parsing
            state['final_email'] = _strip_subject_line(response.content.strip())

            # Log for debugging
            logger.debug(f"Final email content: {state['final_email']}")

            return state

        except Exception as e:
            logger.error(f"Error in final draft agent: {str(e)}")
            logger.error(f"State: {state}")
            logger.error(f"Response: {response.content if 'response' in locals() else 'No response'}")
            # Fallback: use the refined content if final formatting fails
            state['final_email'] = state.get('refined_content', '')
            return state

    async def process(
        self,
        prospect: Dict,
        sender_name: Optional[str] = None,
        sender_title: Optional[str] = None,
        sender_company: Optional[str] = None,
        user_id: Optional[str] = None,
        workspace_id: Optional[str] = None,
    ) -> EmailDraft:
        """Process a single prospect through the workflow"""
        prompt_versions = _email_prompt_versions()
        run_id = run_recorder.start_run(
            GRAPH_NAME,
            user_id=user_id,
            workspace_id=workspace_id,
            trigger="api",
            model=settings.MODEL_NAME,
            prompt_versions=prompt_versions,
        )
        try:
            # Sanitize and validate prospect data
            sanitized_prospect = {
                "author": prospect.get("author", ""),
                "role": prospect.get("role", "Unknown"),
                "company": prospect.get("company", ""),
                "alignment_score": prospect.get("alignment_score", 0.0),
                "industry": prospect.get("industry", ""),
                "pain_points": prospect.get("pain_points", []),
                "solution_fit": prospect.get("solution_fit", ""),
                "insights": prospect.get("insights", ""),
                "approved_claims": prospect.get("approved_claims", []),
            }

            initial_state: EmailState = {
                "subject": "",
                "content": "",
                "refined_content": "",
                "final_email": "",
                "prospect": sanitized_prospect,
                "attempts": 0,
                "should_continue": True,
                "run_id": run_id,
                "sender_name": sender_name,
                "sender_title": sender_title,
                "sender_company": sender_company or DEFAULT_SENDER_COMPANY,
                "prompt_versions": prompt_versions,
            }

            final_state = await self.workflow.ainvoke(initial_state)

            run_recorder.finish_run(run_id, "completed")
            return {
                "prospect": sanitized_prospect,
                "email": {
                    "subject": final_state["subject"],
                    "content": final_state["final_email"]
                }
            }

        except Exception as e:
            logger.error(f"Error processing email for prospect: {str(e)}")
            logger.error(f"Prospect data: {prospect}")
            run_recorder.finish_run(
                run_id, "failed", error=str(e), error_class=classify_exception(e).value
            )
            raise

    async def process_with_streaming(self, prospect: Dict):
        """Process a single prospect through the workflow with streaming updates"""
        try:
            stages = {
                "create_subject": {"subject": ""},
                "build_content": {"content": ""},
                "refine_content": {"refined_content": ""},
                "create_final": {"final_email": ""}
            }

            sanitized_prospect = {
                "author": prospect.get("author", ""),
                "role": prospect.get("role", "Unknown"),
                "company": prospect.get("company", ""),
                "alignment_score": prospect.get("alignment_score", 0.0),
                "industry": prospect.get("industry", ""),
                "pain_points": prospect.get("pain_points", []),
                "solution_fit": prospect.get("solution_fit", ""),
                "insights": prospect.get("insights", ""),
                "approved_claims": prospect.get("approved_claims", []),
            }

            initial_state: EmailState = {
                "subject": "",
                "content": "",
                "refined_content": "",
                "final_email": "",
                "prospect": sanitized_prospect,
                "attempts": 0,
                "should_continue": True,
                "run_id": None,
                "sender_name": None,
                "sender_title": None,
                "sender_company": DEFAULT_SENDER_COMPANY,
                "prompt_versions": _email_prompt_versions(),
            }

            async for stream_type, chunk in self.workflow.astream(
                initial_state,
                stream_mode=["updates"]
            ):
                if isinstance(chunk, dict):
                    node_name = list(chunk.keys())[0]
                    if node_name in stages:
                        formatted_chunk = {
                            node_name: self._format_chunk_data(chunk[node_name], stages[node_name])
                        }
                        yield "updates", formatted_chunk

        except Exception as e:
            logger.error(f"Error in streaming process: {str(e)}")
            logger.error(f"Prospect data: {prospect}")
            yield "error", {"error": str(e)}

    def _format_chunk_data(self, chunk_data: Any, stage_structure: Dict) -> Dict:
        """Format chunk data according to the stage structure"""
        if isinstance(chunk_data, (str, int, float, bool)):
            return chunk_data

        if isinstance(chunk_data, (list, tuple)):
            return list(chunk_data)

        if isinstance(chunk_data, dict):
            return chunk_data

        if hasattr(chunk_data, '__dict__'):
            return chunk_data.__dict__

        return str(chunk_data)

    async def send_email(self, email_drafts: List[Dict]):
        """Method to send the drafted emails"""

        # TODO: Implement email sending functionality
        # This would integrate with your email service provider
        pass

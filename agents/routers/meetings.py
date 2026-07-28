"""Meeting bot and knowledge-base endpoints."""

import json
from datetime import datetime
from typing import Dict, Optional

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from config import settings
from core.db import get_supabase, get_supabase_admin
from core.logger import logger
from deps.auth import AuthUser, get_current_user
from deps.workspace import WorkspaceContext, get_workspace_context
from schemas.meetings import ActionItemStatusRequest, AddBotV2Request
from services.llm_service import LLMService
from services.vector_service import VectorService

router = APIRouter(dependencies=[Depends(get_current_user)])

supabase = get_supabase()


def create_meetingbaas_bot(meeting_url: str) -> str:
    """Create a MeetingBaaS bot for a meeting URL; returns the bot_id.

    Raises HTTPException on configuration or provider errors.
    """
    if not settings.BOT_API_KEY:
        raise HTTPException(status_code=503, detail="Meeting bot integration is not configured")

    response = requests.post(
        "https://api.meetingbaas.com/bots",
        json={
            "meeting_url": meeting_url,
            "bot_name": "AI Notetaker",
            "recording_mode": "speaker_view",
            "entry_message": "Hi, I'm Davis — an AI notetaker for this meeting.",
            "reserved": False,
            "speech_to_text": {"provider": "Default"},
            "automatic_leave": {"waiting_room_timeout": 600},
        },
        headers={
            "Content-Type": "application/json",
            "x-meeting-baas-api-key": settings.BOT_API_KEY,
        },
    )
    if response.status_code >= 400:
        logger.error(f"MeetingBaaS error {response.status_code}: {response.text}")
        raise HTTPException(status_code=502, detail=f"Meeting bot provider error: {response.status_code}")
    bot_id = response.json().get("bot_id")
    if not bot_id:
        raise HTTPException(status_code=500, detail="Bot ID not found in response")
    return bot_id


class MeetingRequest(BaseModel):
    meeting_url: str
    title: str


class SearchQuery(BaseModel):
    query: str
    max_results: Optional[int] = 5


@router.post("/add-bot")
async def add_bot(meeting: MeetingRequest, user: AuthUser = Depends(get_current_user)):
    """Add a bot to the meeting and store meeting details"""
    try:
        if not settings.BOT_API_KEY:
            raise HTTPException(status_code=503, detail="Meeting bot integration is not configured")

        logger.info(f"Adding bot to meeting: {meeting.meeting_url}")

        url = "https://api.meetingbaas.com/bots"
        headers = {
            "Content-Type": "application/json",
            'x-meeting-baas-api-key': settings.BOT_API_KEY
        }

        config = {
            "meeting_url": meeting.meeting_url,
            "bot_name": "AI Notetaker",
            "recording_mode": "speaker_view",
            "entry_message": "Hi, I'm Davis — an AI notetaker for this meeting.",
            "reserved": False,
            "speech_to_text": {
                "provider": "Default"
            },
            "automatic_leave": {
                "waiting_room_timeout": 600
            }
        }

        # Create bot
        response = requests.post(url, json=config, headers=headers)
        if response.status_code >= 400:
            logger.error(f"MeetingBaaS error {response.status_code}: {response.text}")
            raise HTTPException(status_code=502, detail=f"Meeting bot provider error: {response.status_code}")
        data = response.json()

        logger.info(f"Bot creation response: {data}")

        bot_id = data.get('bot_id')
        if not bot_id:
            raise HTTPException(status_code=500, detail="Bot ID not found in response")

        # Create meeting record in Supabase
        meeting_data = {
            "id": f"meet_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{bot_id[:8]}",
            "bot_id": bot_id,
            "meeting_url": meeting.meeting_url,
            "title": meeting.title,
            "status": "active",
            "user_id": user.id,
        }

        try:
            result = supabase.table("meetings").insert(meeting_data).execute()
            created_meeting = result.data[0]
            logger.info(f"Meeting created in Supabase with ID: {created_meeting['id']}")

            return {
                "status": "success",
                "meeting": {
                    "id": created_meeting["id"],
                    "botId": created_meeting["bot_id"],
                    "meeting_url": created_meeting["meeting_url"],
                    "status": created_meeting["status"],
                }
            }

        except Exception as e:
            logger.error(f"Error creating meeting in Supabase: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to create meeting record")

    except Exception as e:
        logger.error(f"Error in add_bot: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/remove-bot")
async def remove_bot(meeting: Dict):
    if not settings.BOT_API_KEY:
        raise HTTPException(status_code=503, detail="Meeting bot integration is not configured")
    url = f"https://api.meetingbaas.com/bots/{meeting['bot_id']}"  # Use bot_id from the meeting dictionary
    headers = {
        "Content-Type": "application/json",
        "x-meeting-baas-api-key": settings.BOT_API_KEY
    }

    response = requests.delete(url, headers=headers)  # Send DELETE request
    if response.status_code == 200:
        data = response.json()
        return {"status": "success", "data": data}
    else:
        return {"status": "error", "message": response.text}


@router.post("/search-knowledge-base")
async def search_knowledge_base(
    search_query: SearchQuery,
    user: AuthUser = Depends(get_current_user)
):
    """Search the meeting knowledge base using RAG"""
    try:
        user_id = user.id
        logger.info(f"Searching knowledge base for user {user_id}: {search_query.query}")

        vector_service = VectorService()
        llm_service = LLMService()

        # Use the RAG method to generate a response
        response = await vector_service.generate_rag_response(
            query=search_query.query,
            llm_service=llm_service,
            user_id=user_id,
            top_k=search_query.max_results
        )

        return {
            "status": "success",
            "response": response["answer"],
            "sources": response["sources"]
        }

    except Exception as e:
        logger.error(f"Error searching knowledge base: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/meetings")
async def get_meetings(status: Optional[str] = Query(None, description="Filter by meeting status (active/completed)"), user: AuthUser = Depends(get_current_user)):
    """
    Get all meetings or filter by status

    Returns a list of meetings with their metadata and analysis results
    """
    try:
        logger.info(f"Fetching meetings with status filter: {status}")

        # Build the query (legacy rows with NULL user_id stay visible)
        query = supabase.table("meetings").select("*").or_(
            f"user_id.eq.{user.id},user_id.is.null"
        )

        # Apply status filter if provided
        if status:
            query = query.eq("status", status)

        # Execute the query and get results
        response = query.execute()

        if hasattr(response, "error") and response.error is not None:
            logger.error(f"Supabase error: {response.error}")
            raise HTTPException(status_code=500, detail=f"Database error: {response.error}")

        meetings = response.data if hasattr(response, "data") else []

        # Process the meetings to ensure consistency
        processed_meetings = []
        for meeting in meetings:
            # Ensure all expected fields exist
            processed_meeting = {
                "id": meeting.get("id", ""),
                "bot_id": meeting.get("bot_id", ""),
                "meeting_url": meeting.get("meeting_url", ""),
                "status": meeting.get("status", "completed"),
                "title": meeting.get("title", "Untitled Meeting"),
                "date": meeting.get("date"),
                "transcript": meeting.get("transcript", ""),
                "ai_summary": meeting.get("ai_summary", "")
            }

            # Handle action items and insights (ensure they're properly formatted)
            if "action_items" in meeting:
                # If stored as string, keep as is; if stored as list, convert to JSON string
                if isinstance(meeting["action_items"], list):
                    processed_meeting["action_items"] = json.dumps(meeting["action_items"])
                else:
                    processed_meeting["action_items"] = meeting["action_items"]

            if "insights" in meeting:
                # If stored as string, keep as is; if stored as list, convert to JSON string
                if isinstance(meeting["insights"], list):
                    processed_meeting["insights"] = json.dumps(meeting["insights"])
                else:
                    processed_meeting["insights"] = meeting["insights"]

            processed_meetings.append(processed_meeting)

        return {
            "status": "success",
            "meetings": processed_meetings
        }

    except Exception as e:
        logger.error(f"Error fetching meetings: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Workspace-scoped meetings v2 ─────────────────────────────────────────────

v2_router = APIRouter(tags=["meetings-v2"], dependencies=[Depends(get_workspace_context)])


@v2_router.post("/v2/meetings/add-bot")
async def add_bot_v2(
    body: AddBotV2Request,
    ctx: WorkspaceContext = Depends(get_workspace_context),
):
    """Send the notetaker bot to a meeting and create a meetings_v2 record."""
    db = get_supabase_admin()

    if body.prospect_id:
        rows = (
            db.table("prospects_v2")
            .select("id")
            .eq("id", body.prospect_id)
            .eq("workspace_id", ctx.workspace_id)
            .limit(1)
            .execute()
        ).data
        if not rows:
            raise HTTPException(status_code=404, detail="Prospect not found in this workspace")

    bot_id = create_meetingbaas_bot(body.meeting_url)

    row = {
        "organization_id": ctx.organization_id,
        "workspace_id": ctx.workspace_id,
        "prospect_id": body.prospect_id,
        "campaign_id": body.campaign_id,
        "bot_id": bot_id,
        "meeting_url": body.meeting_url,
        "title": body.title,
        "status": "active",
        "created_by": ctx.user.id,
    }
    result = db.table("meetings_v2").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create meeting record")
    meeting = result.data[0]
    logger.info(f"meetings_v2 created {meeting['id']} (bot {bot_id})")
    return {"meeting": meeting}


@v2_router.get("/v2/meetings")
async def list_meetings_v2(
    status: Optional[str] = Query(None, description="active | completed | failed"),
    ctx: WorkspaceContext = Depends(get_workspace_context),
):
    db = get_supabase_admin()
    q = db.table("meetings_v2").select("*").eq("workspace_id", ctx.workspace_id)
    if status:
        q = q.eq("status", status)
    meetings = q.order("created_at", desc=True).execute().data or []

    meeting_ids = [m["id"] for m in meetings]
    with_insights: set = set()
    if meeting_ids:
        rows = (
            db.table("meeting_insights")
            .select("meeting_id")
            .in_("meeting_id", meeting_ids)
            .execute()
        ).data or []
        with_insights = {r["meeting_id"] for r in rows}
    for m in meetings:
        m["has_insights"] = m["id"] in with_insights
    return {"meetings": meetings}


@v2_router.get("/v2/meetings/{meeting_id}")
async def get_meeting_v2(
    meeting_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
):
    db = get_supabase_admin()
    rows = (
        db.table("meetings_v2")
        .select("*")
        .eq("id", meeting_id)
        .eq("workspace_id", ctx.workspace_id)
        .limit(1)
        .execute()
    ).data
    if not rows:
        raise HTTPException(status_code=404, detail="Meeting not found")
    meeting = rows[0]

    transcript_rows = (
        db.table("meeting_transcripts")
        .select("*")
        .eq("meeting_id", meeting_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    ).data or []
    insight_rows = (
        db.table("meeting_insights")
        .select("*")
        .eq("meeting_id", meeting_id)
        .limit(1)
        .execute()
    ).data or []
    action_items = (
        db.table("action_items")
        .select("*")
        .eq("meeting_id", meeting_id)
        .order("created_at")
        .execute()
    ).data or []

    return {
        "meeting": meeting,
        "transcript": transcript_rows[0] if transcript_rows else None,
        "insights": insight_rows[0] if insight_rows else None,
        "action_items": action_items,
    }


@v2_router.post("/v2/meetings/{meeting_id}/action-items/{item_id}/status")
async def set_action_item_status(
    meeting_id: str,
    item_id: str,
    body: ActionItemStatusRequest,
    ctx: WorkspaceContext = Depends(get_workspace_context),
):
    db = get_supabase_admin()
    result = (
        db.table("action_items")
        .update({"status": body.status})
        .eq("id", item_id)
        .eq("meeting_id", meeting_id)
        .eq("workspace_id", ctx.workspace_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Action item not found")
    return {"action_item": result.data[0]}

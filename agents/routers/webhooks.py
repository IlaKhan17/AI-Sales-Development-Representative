"""External webhooks (MeetingBaaS). Verified by shared secret header, not user auth."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from config import settings
from core import run_recorder
from core.db import get_supabase, get_supabase_admin
from core.logger import logger
from services.meeting_analyzer import MeetingAnalyzer
from services.meeting_intelligence_service import MeetingIntelligenceService
from services.vector_service import VectorService

router = APIRouter()

supabase = get_supabase()


async def _process_meeting_v2_complete(meeting: dict, data: dict) -> dict:
    """Handle a MeetingBaaS 'complete' event for a meetings_v2 row: store the
    transcript, run sales intelligence, persist insights + action items, and
    index transcript chunks in the workspace Pinecone namespace."""
    db = get_supabase_admin()
    meeting_id = meeting["id"]
    org_id = meeting["organization_id"]
    ws_id = meeting["workspace_id"]
    transcript = data.get("transcript") or ""
    if not isinstance(transcript, str):
        # Some providers deliver structured transcripts; flatten to text.
        try:
            transcript = "\n".join(
                f"{seg.get('speaker', 'Speaker')}: {' '.join(w.get('text', '') for w in seg.get('words', []))}"
                if isinstance(seg, dict) else str(seg)
                for seg in transcript
            )
        except Exception:
            transcript = str(transcript)

    db.table("meeting_transcripts").insert(
        {
            "organization_id": org_id,
            "workspace_id": ws_id,
            "meeting_id": meeting_id,
            "transcript": transcript,
            "speakers": data.get("speakers") or [],
            "mp4_url": data.get("mp4"),
        }
    ).execute()

    # Sales intelligence extraction, recorded as an agent run.
    service = MeetingIntelligenceService()
    run_id = run_recorder.start_run(
        "meeting_intelligence",
        workspace_id=ws_id,
        user_id=meeting.get("created_by"),
        trigger="webhook",
        model=settings.MODEL_NAME,
        prompt_versions={service.prompt_id: service.prompt_version},
    )
    try:
        insights = await service.analyze(transcript, meeting)
        service.store(
            meeting_id,
            org_id,
            ws_id,
            insights,
            run_id=run_id,
            model=settings.MODEL_NAME,
        )
        run_recorder.update_run(
            run_id,
            status="completed",
            finished_at=datetime.now(timezone.utc).isoformat(),
        )
    except Exception as e:
        logger.error(f"meeting_intelligence failed for {meeting_id}: {e}")
        run_recorder.update_run(
            run_id,
            status="failed",
            error=str(e)[:500],
            finished_at=datetime.now(timezone.utc).isoformat(),
        )

    # Index transcript chunks in the workspace namespace (best-effort).
    if transcript:
        try:
            vector_service = VectorService()
            chunks = vector_service.chunk_text(transcript)
            vectors = []
            for i, chunk in enumerate(chunks):
                values = await vector_service.create_embedding(chunk)
                vectors.append(
                    {
                        "id": f"meeting_{meeting_id}_chunk_{i}",
                        "values": values,
                        "metadata": {
                            "workspace_id": ws_id,
                            "meeting_id": meeting_id,
                            "chunk_index": i,
                            "title": meeting.get("title") or "Untitled Meeting",
                            "text": chunk,
                        },
                    }
                )
            if vectors:
                vector_service.upsert_chunks(f"ws_{ws_id}", vectors)
        except Exception as e:
            logger.error(f"Vector indexing failed for meeting {meeting_id}: {e}")

    duration = data.get("duration")
    update = {"status": "completed"}
    try:
        if duration is not None:
            update["duration_minutes"] = max(1, round(int(duration) / 60))
    except (TypeError, ValueError):
        pass
    db.table("meetings_v2").update(update).eq("id", meeting_id).execute()
    logger.info(f"meetings_v2 {meeting_id} completed and analyzed")
    return {"status": "success", "meeting_id": meeting_id}


@router.post("/webhook")
async def meeting_webhook(request: Request):
    # Validate the API key from the header. Reject outright if the shared
    # secret isn't configured — otherwise None == None would let any request in.
    api_key = request.headers.get("x-meeting-baas-api-key")
    if not settings.BOT_API_KEY or api_key != settings.BOT_API_KEY:
        logger.error("Webhook rejected: missing or invalid API key")
        raise HTTPException(status_code=403, detail="Invalid API key")

    # Parse the incoming JSON data
    payload = await request.json()
    event_type = payload.get("event")
    data = payload.get("data", {})

    # Process different event types
    if event_type == "bot.status_change":
        bot_id = data.get("bot_id")
        status = data.get("status", {})
        code = status.get("code")
        created_at = status.get("created_at")
        logger.info(f"Bot {bot_id} status changed to {code} at {created_at}")
        # Optionally, store or process the live status updates

    elif event_type == "complete":
        bot_id = data.get("bot_id")
        mp4_url = data.get("mp4")
        speakers = data.get("speakers")
        transcript = data.get("transcript")
        logger.info(f"Meeting complete for bot {bot_id}. Recording URL: {mp4_url}")

        # v2 (workspace-scoped) meetings take precedence over legacy rows.
        v2_result = (
            get_supabase_admin()
            .table("meetings_v2")
            .select("*")
            .eq("bot_id", bot_id)
            .execute()
        )
        if v2_result.data:
            return await _process_meeting_v2_complete(v2_result.data[0], data)

        result = supabase.table("meetings").select("*").eq("bot_id", bot_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail=f"No meeting found for bot_id: {bot_id}")

        meeting = result.data[0]
        # Analyze meeting
        analyzer = MeetingAnalyzer()
        logger.info(f"Analyzing transcript (speakers: {speakers})")
        analysis = await analyzer.analyze_meeting(transcript, meeting)

        meeting_id = meeting['id']

        logger.info(f"Found meeting: {meeting_id} for bot_id: {bot_id}")

        # Update meeting with analysis
        update_data = {
                "status": "completed",
                "transcript": transcript,
                "ai_summary": analysis["ai_summary"],
                "date": datetime.now().isoformat(),
                "duration": int(data.get('duration', 0)),
            }
        # Update the meeting record
        result = supabase.table("meetings").update(update_data).eq("id", meeting_id).execute()
        updated_meeting = result.data[0]
        logger.info(f"Updated meeting {meeting_id} with transcript and summary")
        # Store transcript chunks in the vector knowledge base, namespaced by
        # the user who added the bot.
        owner_id = updated_meeting.get("user_id") or meeting.get("user_id")
        if owner_id:
            vector_service = VectorService()
            await vector_service.store_meeting_data(updated_meeting, owner_id)
        else:
            logger.warning(
                f"Meeting {meeting_id} has no user_id; skipping vector storage"
            )

        return {"status": "success", "meeting_id": meeting["id"]}

    elif event_type == "failed":
        bot_id = data.get("bot_id")
        error_msg = data.get("error")
        logger.error(f"Meeting failed for bot {bot_id}: {error_msg}")
        try:
            get_supabase_admin().table("meetings_v2").update(
                {"status": "failed"}
            ).eq("bot_id", bot_id).execute()
        except Exception as e:
            logger.warning(f"Failed to mark meetings_v2 failed for bot {bot_id}: {e}")

    else:
        logger.error(f"Unknown event type received: {event_type}")
        raise HTTPException(status_code=400, detail="Unknown event type")

    return {"status": "success"}

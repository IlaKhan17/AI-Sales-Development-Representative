"""Email drafting, sending (Gmail), and reply endpoints."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from core.db import get_supabase
from core.logger import logger
from deps.auth import AuthUser, get_current_user
from routers.google_auth import google_service
from schemas.emails import SendEmailRequest
from schemas.prospects import Prospect
from services.email_service import EmailService
from services.reply_analysis import analyze_sentiment, generate_followup_email

router = APIRouter(dependencies=[Depends(get_current_user)])

supabase = get_supabase()


@router.post("/draft-emails")
async def draft_emails(prospect: Prospect):
    try:
        logger.info(f"prospect 1: {prospect}")
        email_service = EmailService()
        draft = await email_service.process(prospect=prospect.dict())
        return draft
    except Exception as e:
        logger.error(f"Error in draft_emails endpoint: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate email draft: {str(e)}"
        )


@router.post("/emails/send")
async def send_email_gmail(
    request: SendEmailRequest,
    user: AuthUser = Depends(get_current_user),
):
    """Send an email via the user's connected Gmail account."""
    try:
        user_id = user.id
        logger.info(f"User {user_id} sending email to {request.to}")

        # Send via Gmail
        result = await google_service.send_email(
            user_id=user_id,
            to=request.to,
            subject=request.subject,
            body=request.body,
            html=request.html,
        )

        # Store in Supabase emails table
        email_record = {
            "user_id": user_id,
            "recipient": request.to,
            "subject": request.subject,
            "body": request.body,
            "status": "sent",
            "sent_at": datetime.now().isoformat(),
            "gmail_message_id": result["message_id"],
            "gmail_thread_id": result["thread_id"],
        }
        if request.prospect_id:
            email_record["prospect_id"] = request.prospect_id

        supabase.table("emails").insert(email_record).execute()

        return {
            "status": "success",
            "message": f"Email sent to {request.to}",
            "gmail_message_id": result["message_id"],
            "gmail_thread_id": result["thread_id"],
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error sending email: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/emails/replies")
async def get_email_replies(user: AuthUser = Depends(get_current_user)):
    """Fetch real email replies from Gmail and analyze them."""
    try:
        user_id = user.id
        logger.info(f"Fetching email replies for user {user_id}")

        replies_raw = await google_service.get_replies_for_sent_emails(
            user_id=user_id, max_results=20
        )

        # Analyze each reply with AI
        analyzed_emails = []
        for reply in replies_raw:
            body = reply.get("body", reply.get("snippet", ""))
            if not body:
                continue

            sentiment, intent = await analyze_sentiment(body)

            analyzed_email = {
                "email": {
                    "from": reply["from"],
                    "subject": reply["subject"],
                    "body": body,
                    "date": reply.get("date", ""),
                    "gmail_id": reply["id"],
                    "thread_id": reply.get("threadId", ""),
                },
                "analysis": {
                    "sentiment": sentiment,
                    "intent": intent,
                },
            }

            if intent == "Follow-Up Required":
                follow_up = await generate_followup_email(
                    reply["from"], reply["subject"], body
                )
                analyzed_email["suggested_followup"] = follow_up

            analyzed_emails.append(analyzed_email)

        return {
            "status": "success",
            "message": f"{len(analyzed_emails)} replies analyzed",
            "analyzed_emails": analyzed_emails,
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error fetching replies: {e}")
        raise HTTPException(status_code=500, detail=str(e))

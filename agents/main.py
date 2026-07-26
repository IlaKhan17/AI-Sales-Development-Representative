import json
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import RedirectResponse
import os
from dotenv import load_dotenv

# Load environment variables early
load_dotenv()

from fastapi.middleware.cors import CORSMiddleware
import requests


from services.reply_analysis import analyze_sentiment, generate_followup_email
from services.google_service import GoogleService
from services.prospect_discovery_service import ProspectDiscoveryService
from services.email_service import EmailService
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from typing import Dict, List, Optional
from core.logger import logger
from supabase import create_client, Client
from redis import Redis
import logging

from datetime import datetime
from services.vector_service import VectorService
from services.meeting_analyzer import MeetingAnalyzer
from services.llm_service import LLMService
from services.email_discovery_service import EmailDiscoveryService
from services.scraper_router_service import ScraperRouterService


# Configure logging
logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Updated Pydantic model with optional fields
class Prospect(BaseModel):
    author: Optional[str] = None
    role: Optional[str] = "Unknown"
    company: Optional[str] = None
    isProspect: Optional[bool] = False
    alignment_score: Optional[float] = 0.0
    industry: Optional[str] = None
    pain_points: Optional[List[str]] = []
    solution_fit: Optional[str] = None
    insights: Optional[str] = None

    class Config:
        extra = "allow"


app = FastAPI()

# Comma-separated list of allowed frontend origins, e.g.
# ALLOWED_ORIGINS=https://ai.mohdjami.com,http://localhost:3000
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

redis_client = Redis(host=os.getenv("REDIS_HOST"), 
                    port=6379, 
                    db=0,
                    password=os.getenv("REDIS_PASSWORD"),
                    ssl=True,
                    decode_responses=True
                    )

CACHE_EXPIRY = 7 * 24 * 3600  # 7 days

SUPABASE_URL=os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY=os.getenv("SUPABASE_ANON_KEY")

# Initialize supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

from fastapi import Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify the Supabase JWT and return the user ID"""
    token = credentials.credentials
    try:
        user = supabase.auth.get_user(token)
        if not user or not user.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return user.user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Auth error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

@app.get("/")
def home():
    return {"message": "Welcome to the AI SDR!"}


# Request models
class ICPConfig(BaseModel):
    """Structured Ideal Customer Profile definition for more precise lead scoring."""
    target_industries: Optional[List[str]] = []
    company_size: Optional[str] = ""        # e.g. "50-500 employees", "Series A-C startups"
    funding_stage: Optional[str] = ""       # e.g. "Seed", "Series A", "Series B-C"
    tech_stack_signals: Optional[List[str]] = []  # Keywords indicating right tech stack
    pain_points_to_target: Optional[List[str]] = []  # Specific pain points to look for
    geography: Optional[List[str]] = []
    deal_breakers: Optional[List[str]] = []  # Auto-disqualify if any match (e.g. "agency", "consulting")
    value_proposition: Optional[str] = ""   # Your product's key value prop


class ProspectDiscoveryRequest(BaseModel):
    company_description: str
    goal: str
    job_titles: List[str]
    icp: Optional[ICPConfig] = None
    enable_playwright: Optional[bool] = True
    enable_email_discovery: Optional[bool] = True
    keyword_hint: Optional[str] = ""

class EmailDiscoveryRequest(BaseModel):
    first_name: str
    last_name: str
    company_domain: str
    max_candidates: Optional[int] = 5

class ScrapeSourceRequest(BaseModel):
    source: str  # "product_hunt" | "g2" | "hacker_news" | "github" | "crunchbase" | "wellfound" | "yc_directory" | "angellist"
    keyword: Optional[str] = ""
    role: Optional[str] = ""
    org_name: Optional[str] = ""
    competitor_slug: Optional[str] = ""
    market: Optional[str] = ""
    batch: Optional[str] = ""
    limit: Optional[int] = 10

@app.post('/prospects/discover')
async def discover_prospects_endpoint(request: ProspectDiscoveryRequest, user: object = Depends(get_current_user)):
    """Discover prospects using Google Search and Reddit"""
    try:
        logger.info(f"Discovering prospects for goal: {request.goal}")

        service = ProspectDiscoveryService()
        prospects = await service.discover_prospects(
            company_description=request.company_description,
            goal=request.goal,
            job_titles=request.job_titles,
            enable_playwright=request.enable_playwright if request.enable_playwright is not None else True,
            enable_email_discovery=request.enable_email_discovery if request.enable_email_discovery is not None else True,
            keyword_hint=request.keyword_hint or "",
            icp_config=request.icp.model_dump() if request.icp else None,
        )
        
        # 3. Save to Supabase (CRITICAL STEP)
        saved_prospects = []
        if prospects:
            for p in prospects:
                try:
                    # Normalise name field: pipeline returns 'name', legacy returns 'author'
                    author = p.get("name") or p.get("author") or "Unknown"

                    # Base row — columns guaranteed to exist in the DB schema
                    base_row = {
                        "author":           author,
                        "role":             p.get("role") or "Unknown",
                        "company":          p.get("company") or "Unknown",
                        "alignment_score":  float(p.get("alignment_score", 0)),
                        "pain_points":      p.get("pain_points", []),
                        "industry":         p.get("industry", ""),
                        "solution_fit":     p.get("solution_fit", ""),
                        "insights":         p.get("insights", ""),
                        "is_prospect":      bool(p.get("is_prospect", True)),
                        "status":           "new",
                        "search_query":     request.goal,
                        "email":            p.get("email"),
                        "email_confidence": p.get("email_confidence"),
                        "source":           p.get("source"),
                        "url":              p.get("url"),
                        "raw_data":         p,
                    }

                    # Extended row — columns added by migration (may not exist yet)
                    extended_row = {
                        **base_row,
                        "user_id":                  user.id,
                        "selection_reasoning":      p.get("selection_reasoning", ""),
                        "icp_score_breakdown":      p.get("icp_score_breakdown", {}),
                        "disqualification_signals": p.get("disqualification_signals", []),
                    }

                    logger.info(f"Saving prospect: {base_row['author']} for goal: {base_row['search_query']}")
                    try:
                        result = supabase.table("prospects").insert(extended_row).execute()
                    except Exception as ext_error:
                        # Extended columns not yet migrated — fall back to base row
                        logger.warning(f"Extended insert failed ({ext_error}), retrying with base columns only")
                        result = supabase.table("prospects").insert(base_row).execute()

                    if result.data:
                        saved_prospects.append(result.data[0])

                except Exception as insert_error:
                    logger.error(f"Error saving prospect {p.get('name') or p.get('author')}: {str(insert_error)}")

            # Update cache
            redis_client.setex("discovered_prospects", 3600, json.dumps(prospects))

        return {"prospects": prospects}

    except Exception as e:
        import traceback
        logger.error(f"Error discovering prospects: {str(e)}")
        logger.error(f"Full traceback:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get('/discovery-jobs')
async def get_discovery_jobs(user: object = Depends(get_current_user)):
    """Get list of past discovery jobs (folders/projects), grouped by search_query."""
    try:
        response = (
            supabase.table("prospects")
            .select("id, search_query, created_at, company")
            .not_.is_("search_query", "null")
            .or_(f"user_id.eq.{user.id},user_id.is.null")
            .order("created_at", desc=True)
            .execute()
        )

        if not response.data:
            return []

        projects: dict = {}
        for p in response.data:
            goal = p.get("search_query") or "Unknown Project"
            if goal not in projects:
                projects[goal] = {
                    "id": goal,
                    "name": goal,
                    "date": p.get("created_at"),
                    "prospect_count": 0,
                    "companies": set(),
                }
            projects[goal]["prospect_count"] += 1
            if p.get("company"):
                projects[goal]["companies"].add(p["company"])

        result = []
        for val in projects.values():
            val["companies"] = list(val["companies"])[:3]
            result.append(val)

        # Sort newest project first
        result.sort(key=lambda x: x.get("date") or "", reverse=True)
        return result

    except Exception as e:
        logger.error(f"Error fetching jobs: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

def _remap_prospect(p: dict) -> dict:
    """
    Remap DB column names to frontend Prospect type.
    DB has: is_prospect (bool), author (text)
    Frontend expects: isProspect (bool), author + name both set
    """
    return {
        **p,
        "name":       p.get("author") or "",
        "isProspect": bool(p.get("is_prospect", True)),
    }

@app.get('/discovery-jobs/{goal_id}/prospects')
async def get_job_prospects(goal_id: str, user: object = Depends(get_current_user)):
    """Get saved prospects for a specific project."""
    try:
        if goal_id == "Unknown Project":
            response = (
                supabase.table("prospects").select("*")
                .is_("search_query", "null")
                .or_(f"user_id.eq.{user.id},user_id.is.null")
                .execute()
            )
        else:
            response = (
                supabase.table("prospects")
                .select("*")
                .eq("search_query", goal_id)
                .or_(f"user_id.eq.{user.id},user_id.is.null")
                .order("alignment_score", desc=True)
                .execute()
            )

        prospects = [_remap_prospect(p) for p in (response.data or [])]
        return {"prospects": prospects}

    except Exception as e:
        logger.error(f"Error fetching job prospects: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class AutoFillRequest(BaseModel):
    job_description: str

@app.post('/prospects/autofill')
async def autofill_preferences(request: AutoFillRequest, user: object = Depends(get_current_user)):
    """Generate search preferences and ICP config from a job description"""
    try:
        llm_service = LLMService()
        system_prompt = "You are an expert SDR manager. Analyze the job description and extract the ideal prospect persona and ICP configuration."
        user_prompt = f"""
        Job Description:
        {request.job_description}

        Based on this JD, extract:
        1. company_description — what the hiring company does/sells
        2. goal — a one-sentence prospecting goal (who they want to sell to)
        3. job_titles — list of seniority-appropriate buyer titles
        4. icp — Ideal Customer Profile config:
           - target_industries: list of relevant industries (e.g. "SaaS", "FinTech")
           - company_size: target size range (e.g. "50-500 employees")
           - funding_stage: target stage (e.g. "Series A-C") or empty string if unknown
           - pain_points_to_target: list of pain points the product solves
           - deal_breakers: list of company types to exclude (e.g. "agency", "consulting", "government")

        Return JSON:
        {{
            "company_description": "...",
            "goal": "...",
            "job_titles": ["Title 1", "Title 2"],
            "icp": {{
                "target_industries": ["Industry 1"],
                "company_size": "...",
                "funding_stage": "...",
                "pain_points_to_target": ["Pain point 1"],
                "deal_breakers": ["agency", "consulting"]
            }}
        }}
        """

        json_structure = {
            "company_description": "string",
            "goal": "string",
            "job_titles": ["string"],
            "icp": {
                "target_industries": ["string"],
                "company_size": "string",
                "funding_stage": "string",
                "pain_points_to_target": ["string"],
                "deal_breakers": ["string"],
            }
        }

        result = await llm_service.get_json_response(system_prompt, user_prompt, json_structure)
        return result

    except Exception as e:
        logger.error(f"Error in autofill: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/prospects/find-email')
async def find_prospect_email(request: EmailDiscoveryRequest, user: object = Depends(get_current_user)):
    """
    Discover and verify email addresses for a prospect.
    Generates 10 pattern candidates, checks MX records, and probes via SMTP.
    Optionally uses Hunter.io if HUNTER_API_KEY is configured.
    """
    try:
        service = EmailDiscoveryService()
        candidates = await service.find_best_email(
            first_name=request.first_name,
            last_name=request.last_name,
            company_domain=request.company_domain,
            max_candidates=request.max_candidates or 5,
        )
        # Also return the best single guess at the top
        best = next((c for c in candidates if c["confidence"] in ("verified", "likely")), None)
        return {
            "best_email": best["address"] if best else None,
            "confidence": best["confidence"] if best else "unknown",
            "all_candidates": candidates,
        }
    except Exception as e:
        logger.error(f"Error in find_prospect_email: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/prospects/scrape-source')
async def scrape_single_source(request: ScrapeSourceRequest, user: object = Depends(get_current_user)):
    """
    Trigger a single Playwright scraper on demand.
    Useful for testing individual sources or targeted scraping.
    source options: product_hunt, g2, hacker_news, github,
                    crunchbase, wellfound, yc_directory, angellist
    """
    try:
        scraper = ScraperRouterService()
        source = request.source.lower().strip()

        # Build the call spec for the single scraper
        kwargs_map = {
            "product_hunt":  {"keyword": request.keyword or "AI", "limit": request.limit},
            "g2":            {"competitor_slug": request.competitor_slug or request.keyword or "salesforce", "limit": request.limit},
            "hacker_news":   {"keyword": request.keyword or "hiring", "limit": request.limit},
            "github":        {"org_name": request.org_name or request.keyword or "openai", "limit": request.limit},
            "crunchbase":    {"keyword": request.keyword or "SaaS", "limit": request.limit},
            "wellfound":     {"role": request.role or "founder", "keyword": request.keyword, "limit": request.limit},
            "yc_directory":  {"keyword": request.keyword or "AI", "batch": request.batch, "limit": request.limit},
            "angellist":     {"market": request.market or request.keyword or "SaaS", "role": request.role or "founder", "limit": request.limit},
        }

        if source not in kwargs_map:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown source '{source}'. Valid: {list(kwargs_map.keys())}"
            )

        call_spec = [{"scraper": source, "kwargs": kwargs_map[source]}]
        prospects = await scraper.playwright_service.run_scrapers(call_spec)
        await scraper.close()

        return {
            "source": source,
            "count": len(prospects),
            "prospects": prospects,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in scrape_single_source: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/prospects')
async def get_prospects(min_alignment_score: float = 0.7, user: object = Depends(get_current_user)):
    # Check for discovered prospects in Redis first
    cached_discovered = redis_client.get("discovered_prospects")
    if cached_discovered:
        return {"prospects": json.loads(cached_discovered)}

    response = (
        supabase.table("prospects")
        .select("*")
        .gte("alignment_score", min_alignment_score)
        .or_(f"user_id.eq.{user.id},user_id.is.null")
        .order("alignment_score", desc=True)
        .execute()
    )
    prospects = [_remap_prospect(p) for p in (response.data or [])]
    return {"prospects": prospects}


@app.post('/draft-emails')
async def draft_emails(prospect: Prospect, user: object = Depends(get_current_user)):
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
    
EXPECTED_API_KEY = os.getenv("BOT_API_KEY")  # Set this to your expected API key
# Define the request model
class MeetingRequest(BaseModel):
    meeting_url: str
    title: str

@app.post("/add-bot")
async def add_bot(meeting: MeetingRequest, user: object = Depends(get_current_user)):
    """Add a bot to the meeting and store meeting details"""
    try:
        if not EXPECTED_API_KEY:
            raise HTTPException(status_code=503, detail="Meeting bot integration is not configured")

        logger.info(f"Adding bot to meeting: {meeting.meeting_url}")

        url = "https://api.meetingbaas.com/bots"
        headers = {
            "Content-Type": "application/json",
            'x-meeting-baas-api-key': EXPECTED_API_KEY
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

@app.post('/remove-bot')
async def remove_bot(meeting: Dict, user: object = Depends(get_current_user)):
    if not EXPECTED_API_KEY:
        raise HTTPException(status_code=503, detail="Meeting bot integration is not configured")
    url = f"https://api.meetingbaas.com/bots/{meeting['bot_id']}"  # Use bot_id from the meeting dictionary
    headers = {
        "Content-Type": "application/json",
        "x-meeting-baas-api-key": EXPECTED_API_KEY
    }

    response = requests.delete(url, headers=headers)  # Send DELETE request
    if response.status_code == 200:
        data = response.json()
        return {"status": "success", "data": data}
    else:
        return {"status": "error", "message": response.text}

@app.post("/webhook")
async def meeting_webhook(request: Request):
    # Validate the API key from the header. Reject outright if the shared
    # secret isn't configured — otherwise None == None would let any request in.
    api_key = request.headers.get("x-meeting-baas-api-key")
    if not EXPECTED_API_KEY or api_key != EXPECTED_API_KEY:
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
        logger.info("Bot %s status changed to %s at %s", bot_id, code, created_at)
        # Optionally, store or process the live status updates

    elif event_type == "complete":
        bot_id = data.get("bot_id")
        mp4_url = data.get("mp4")
        speakers = data.get("speakers")
        transcript = data.get("transcript")
        logger.info("Meeting complete for bot %s. Recording URL: %s", bot_id, mp4_url, transcript)

        result = supabase.table("meetings").select("*").eq("bot_id", bot_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail=f"No meeting found for bot_id: {bot_id}")
            
        meeting = result.data[0]
                    # Analyze meeting
        analyzer = MeetingAnalyzer()
        logger.info(transcript, speakers)
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
        logger.error("Meeting failed for bot %s: %s", bot_id, error_msg)
        # Handle failure (log, notify user, etc.)

    else:
        logger.error("Unknown event type received: %s", event_type)
        raise HTTPException(status_code=400, detail="Unknown event type")

    return {"status": "success"}


# Add this near your other model definitions
class SearchQuery(BaseModel):
    query: str
    max_results: Optional[int] = 5

# Add this endpoint to your FastAPI app
@app.post("/search-knowledge-base")
async def search_knowledge_base(
    search_query: SearchQuery,
    user: object = Depends(get_current_user)
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


# Add this endpoint to get all meetings
@app.get("/meetings")
async def get_meetings(status: Optional[str] = Query(None, description="Filter by meeting status (active/completed)"), user: object = Depends(get_current_user)):
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

@app.get("/health")
def health_check():
    """
    Health check endpoint to verify the service is running
    
    Returns basic service status information
    """
    return {
        "status": "healthy",
        "service": "AI SDR",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat()
    }

# ── Google OAuth Endpoints ──────────────────────────────────────

google_service = GoogleService()


class SendEmailRequest(BaseModel):
    to: str
    subject: str
    body: str
    html: bool = False
    prospect_id: Optional[str] = None


class CreateEventRequest(BaseModel):
    summary: str
    start_time: str
    end_time: str
    description: str = ""
    attendees: Optional[List[str]] = None
    location: str = ""


@app.get("/auth/google")
async def google_auth(user: object = Depends(get_current_user)):
    """Generate Google OAuth consent URL for the authenticated user."""
    try:
        state = user.id
        auth_url = google_service.get_auth_url(state=state)
        return {"auth_url": auth_url}
    except Exception as e:
        logger.error(f"Error generating Google auth URL: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/auth/google/callback")
async def google_callback(code: str, state: str = ""):
    """Handle Google OAuth callback and store tokens."""
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    try:
        user_id = state
        if not user_id:
            raise HTTPException(status_code=400, detail="Missing user state")

        await google_service.exchange_code(code, user_id)
        logger.info(f"Google account connected for user {user_id}")
        return RedirectResponse(url=f"{frontend_url}/dashboard?google_connected=true")
    except Exception as e:
        # Never reflect exception internals into the redirect URL — they can
        # contain token-exchange details. Log server-side, return a generic code.
        logger.error(f"Google OAuth callback error: {e}", exc_info=True)
        return RedirectResponse(
            url=f"{frontend_url}/dashboard?google_error=connection_failed"
        )


@app.get("/auth/google/status")
async def google_status(user: object = Depends(get_current_user)):
    """Check if the user has connected their Google account."""
    try:
        status = await google_service.get_connection_status(user.id)
        return status
    except Exception as e:
        logger.error(f"Error checking Google status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/auth/google/disconnect")
async def google_disconnect(user: object = Depends(get_current_user)):
    """Disconnect the user's Google account."""
    try:
        await google_service.disconnect(user.id)
        return {"status": "disconnected"}
    except Exception as e:
        logger.error(f"Error disconnecting Google: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Email Endpoints (Gmail API) ─────────────────────────────────


@app.post("/emails/send")
async def send_email_gmail(
    request: SendEmailRequest,
    user: object = Depends(get_current_user),
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


@app.get("/emails/replies")
async def get_email_replies(user: object = Depends(get_current_user)):
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


# ── Calendar Endpoints ──────────────────────────────────────────


@app.get("/calendar/events")
async def list_calendar_events(
    max_results: int = 10,
    user: object = Depends(get_current_user),
):
    """List upcoming Google Calendar events."""
    try:
        events = await google_service.list_events(
            user_id=user.id, max_results=max_results
        )
        return {"status": "success", "events": events}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error listing calendar events: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/calendar/events")
async def create_calendar_event(
    request: CreateEventRequest,
    user: object = Depends(get_current_user),
):
    """Create a new Google Calendar event with optional Google Meet link."""
    try:
        event = await google_service.create_event(
            user_id=user.id,
            summary=request.summary,
            start_time=request.start_time,
            end_time=request.end_time,
            description=request.description,
            attendees=request.attendees,
            location=request.location,
        )
        return {"status": "success", "event": event}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error creating calendar event: {e}")
        raise HTTPException(status_code=500, detail=str(e))

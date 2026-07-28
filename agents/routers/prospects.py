"""Prospect discovery and management endpoints."""

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException

from config import settings
from core.db import get_supabase, get_supabase_admin
from core.logger import logger
from core.prompts import render
from core.redis_client import redis_client
from deps.auth import AuthUser, get_current_user
from schemas.prospects import (
    AutoFillRequest,
    EmailDiscoveryRequest,
    ProspectDiscoveryRequest,
    ScrapeSourceRequest,
)
from services.discovery_runner import run_discovery
from services.email_discovery_service import EmailDiscoveryService
from services.llm_service import LLMService
from services.scraper_router_service import ScraperRouterService

router = APIRouter(dependencies=[Depends(get_current_user)])

supabase = get_supabase()

_arq_pool = None


async def _get_arq_pool():
    """Lazily create the shared arq Redis pool."""
    global _arq_pool
    if _arq_pool is None:
        from arq import create_pool
        from arq.connections import RedisSettings

        _arq_pool = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
    return _arq_pool


@router.post("/prospects/discover")
async def discover_prospects_endpoint(
    request: ProspectDiscoveryRequest, user: AuthUser = Depends(get_current_user)
):
    """Discover prospects using Google Search and Reddit"""
    try:
        result = await run_discovery(request, user.id)
        return {"prospects": result["prospects"]}

    except Exception as e:
        import traceback
        logger.error(f"Error discovering prospects: {str(e)}")
        logger.error(f"Full traceback:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/prospects/discover-async")
async def discover_prospects_async(
    request: ProspectDiscoveryRequest, user: AuthUser = Depends(get_current_user)
):
    """Enqueue prospect discovery on the worker; returns a run_id for polling
    GET /runs/{run_id}."""
    if not settings.REDIS_URL:
        raise HTTPException(
            status_code=503,
            detail="Async discovery unavailable: REDIS_URL is not configured",
        )

    run_id = str(uuid.uuid4())
    try:
        get_supabase_admin().table("agent_runs").insert(
            {
                "id": run_id,
                "user_id": user.id,
                "graph_name": "prospect_discovery",
                "status": "queued",
                "trigger": "api",
                "model": settings.MODEL_NAME,
            }
        ).execute()
    except Exception as e:
        logger.warning(f"Could not create agent_runs row (run tracking degraded): {e}")

    try:
        pool = await _get_arq_pool()
        await pool.enqueue_job(
            "run_prospect_discovery",
            run_id,
            None,  # workspace_id
            user.id,
            request.model_dump(),
        )
    except Exception as e:
        logger.error(f"Failed to enqueue discovery job: {e}")
        raise HTTPException(status_code=503, detail=f"Could not enqueue job: {e}")

    return {"run_id": run_id}


@router.get("/discovery-jobs")
async def get_discovery_jobs(user: AuthUser = Depends(get_current_user)):
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


@router.get("/discovery-jobs/{goal_id}/prospects")
async def get_job_prospects(goal_id: str, user: AuthUser = Depends(get_current_user)):
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


@router.post("/prospects/autofill")
async def autofill_preferences(request: AutoFillRequest):
    """Generate search preferences and ICP config from a job description"""
    try:
        llm_service = LLMService()
        # Prompt registry id 'icp_autofill'
        rp = render("icp_autofill", job_description=request.job_description)

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

        result = await llm_service.get_json_response(rp.system, rp.user, json_structure)
        return result

    except Exception as e:
        logger.error(f"Error in autofill: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/prospects/find-email")
async def find_prospect_email(request: EmailDiscoveryRequest):
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


@router.post("/prospects/scrape-source")
async def scrape_single_source(request: ScrapeSourceRequest):
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


@router.get("/prospects")
async def get_prospects(min_alignment_score: float = 0.7, user: AuthUser = Depends(get_current_user)):
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

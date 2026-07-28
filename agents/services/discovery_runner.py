"""Shared prospect-discovery execution: run the pipeline and persist results.

Used by both the synchronous /prospects/discover endpoint and the arq worker
task, so behavior (saving, caching) stays identical in both paths.
"""

import json

from core.db import get_supabase
from core.logger import logger
from core.redis_client import redis_client
from schemas.prospects import ProspectDiscoveryRequest
from services.prospect_discovery_service import ProspectDiscoveryService


async def run_discovery(request: ProspectDiscoveryRequest, user_id: str | None) -> dict:
    """Run prospect discovery and save results to Supabase.

    Returns {"prospects": [...], "saved": [...]}.
    """
    supabase = get_supabase()
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

    # Save to Supabase (CRITICAL STEP)
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
                    "user_id":                  user_id,
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
        try:
            redis_client.setex("discovered_prospects", 3600, json.dumps(prospects))
        except Exception as cache_error:
            logger.warning(f"Failed to cache discovered prospects: {cache_error}")

    return {"prospects": prospects, "saved": saved_prospects}

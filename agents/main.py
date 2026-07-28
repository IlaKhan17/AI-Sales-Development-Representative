"""Davis AI SDR — FastAPI application entrypoint."""

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from core.db import get_supabase
from core.logger import logger
from core.prompts import sync_prompt_versions
from core.redis_client import get_redis
from core.tracing import init_tracing
from routers import (
    approvals,
    calendar,
    campaigns,
    emails,
    evals,
    google_auth,
    icp,
    knowledge,
    meetings,
    prospects,
    prospects_v2,
    replies,
    runs,
    sequences,
    webhooks,
    workspaces,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        init_tracing()
    except Exception as e:
        logger.warning(f"init_tracing failed: {e}")
    try:
        # Upsert prompt registry into prompt_versions (best-effort)
        await asyncio.to_thread(sync_prompt_versions)
    except Exception as e:
        logger.warning(f"sync_prompt_versions failed: {e}")
    yield


app = FastAPI(title="Davis AI SDR", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(prospects.router)
app.include_router(emails.router)
app.include_router(google_auth.router)
app.include_router(calendar.router)
app.include_router(meetings.router)
app.include_router(meetings.v2_router)
app.include_router(webhooks.router)
app.include_router(workspaces.router)
app.include_router(workspaces.invites_router)
app.include_router(icp.router)
app.include_router(knowledge.router)
app.include_router(runs.router)
app.include_router(campaigns.router)
app.include_router(prospects_v2.router)
app.include_router(approvals.router)
app.include_router(sequences.router)
app.include_router(replies.router)
app.include_router(evals.router)


@app.get("/")
def home():
    return {"message": "Welcome to the AI SDR!"}


@app.get("/health")
def health_check(deep: bool = False):
    """Health check endpoint.

    Shallow by default; `?deep=true` pings Supabase and Redis and reports
    per-dependency status.
    """
    result = {
        "status": "healthy",
        "service": "AI SDR",
        "version": "2.0.0",
        "env": settings.ENV,
        "timestamp": datetime.now().isoformat(),
    }

    if deep:
        deps: dict[str, str] = {}

        try:
            get_supabase().table("prospects").select("id").limit(1).execute()
            deps["supabase"] = "ok"
        except Exception as e:
            logger.error(f"Health check: supabase failed: {e}")
            deps["supabase"] = f"error: {type(e).__name__}"

        try:
            get_redis().ping()
            deps["redis"] = "ok"
        except Exception as e:
            logger.error(f"Health check: redis failed: {e}")
            deps["redis"] = f"error: {type(e).__name__}"

        result["dependencies"] = deps
        if any(v != "ok" for v in deps.values()):
            result["status"] = "degraded"

    return result

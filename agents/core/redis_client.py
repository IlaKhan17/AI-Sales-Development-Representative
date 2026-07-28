"""Single Redis client for the whole app.

Prefers settings.REDIS_URL; falls back to legacy REDIS_HOST/REDIS_PASSWORD
(always TLS, matching the previous hardcoded behavior) if REDIS_URL is unset.
"""

from redis import Redis

from config import settings
from core.logger import logger

_client: Redis | None = None


def _resolve_url() -> str:
    if settings.REDIS_URL:
        return settings.REDIS_URL
    if settings.REDIS_HOST:
        logger.warning("REDIS_URL not set — building URL from legacy REDIS_HOST/REDIS_PASSWORD")
        auth = f":{settings.REDIS_PASSWORD}@" if settings.REDIS_PASSWORD else ""
        # Legacy config always used ssl=True on port 6379
        return f"rediss://{auth}{settings.REDIS_HOST}:6379/0"
    logger.warning("No Redis configuration found — defaulting to redis://localhost:6379/0")
    return "redis://localhost:6379/0"


def get_redis() -> Redis:
    """Return the shared Redis client (decode_responses=True; TLS if rediss://)."""
    global _client
    if _client is None:
        url = _resolve_url()
        _client = Redis.from_url(url, decode_responses=True)
    return _client


# Module-level singleton for existing call sites
redis_client = get_redis()

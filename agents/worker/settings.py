"""arq Redis settings derived from app settings."""

from arq.connections import RedisSettings

from config import settings


def get_redis_settings() -> RedisSettings:
    """Build arq RedisSettings from settings.REDIS_URL; fail loudly if unset."""
    if not settings.REDIS_URL:
        raise RuntimeError(
            "REDIS_URL is not set — the worker requires a Redis instance. "
            "Set REDIS_URL (e.g. redis://localhost:6379/0) and restart the worker."
        )
    return RedisSettings.from_dsn(settings.REDIS_URL)

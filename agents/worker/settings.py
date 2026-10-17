"""arq Redis settings derived from app settings."""

from arq.connections import RedisSettings
from redis.asyncio.retry import Retry
from redis.backoff import ExponentialBackoff
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import TimeoutError as RedisTimeoutError

from config import settings


def get_redis_settings() -> RedisSettings:
    """Build arq RedisSettings from settings.REDIS_URL; fail loudly if unset."""
    if not settings.REDIS_URL:
        raise RuntimeError(
            "REDIS_URL is not set — the worker requires a Redis instance. "
            "Set REDIS_URL (e.g. redis://localhost:6379/0) and restart the worker."
        )
    rs = RedisSettings.from_dsn(settings.REDIS_URL)
    # Upstash closes idle connections, so arq's poll loop reconnects often.
    # arq's default 1s connect timeout is shorter than a TLS handshake to
    # Upstash can take, which crashed the worker every few minutes in prod.
    rs.conn_timeout = 10
    rs.retry_on_timeout = True
    rs.retry_on_error = [RedisConnectionError, RedisTimeoutError]
    rs.retry = Retry(ExponentialBackoff(cap=10, base=1), retries=5)
    return rs

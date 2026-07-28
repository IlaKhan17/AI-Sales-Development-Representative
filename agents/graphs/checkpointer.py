"""LangGraph Postgres checkpointer scaffold (wired into graphs in Phase 5).

Uses langgraph-checkpoint-postgres against settings.SUPABASE_DB_URL.
"""

import asyncio

from config import settings
from core.logger import logger

_checkpointer = None
_lock = asyncio.Lock()


async def get_checkpointer():
    """Return a shared AsyncPostgresSaver, or None (with a warning) if
    SUPABASE_DB_URL is unset. setup() is run lazily exactly once."""
    global _checkpointer
    if not settings.SUPABASE_DB_URL:
        logger.warning("checkpointer_unavailable", reason="SUPABASE_DB_URL not set")
        return None
    if _checkpointer is not None:
        return _checkpointer

    async with _lock:
        if _checkpointer is not None:
            return _checkpointer
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
        from psycopg import AsyncConnection
        from psycopg.rows import dict_row

        conn = await AsyncConnection.connect(
            settings.SUPABASE_DB_URL, autocommit=True, row_factory=dict_row
        )
        saver = AsyncPostgresSaver(conn)
        await saver.setup()
        _checkpointer = saver
        logger.info("checkpointer_initialized")
        return _checkpointer

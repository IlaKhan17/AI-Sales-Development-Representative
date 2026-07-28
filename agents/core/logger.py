"""Structured logging via structlog.

JSON output in prod, pretty console output in dev. Keeps exporting the name
`logger` so all existing `from core.logger import logger` imports keep working.
"""

import logging
import sys

import structlog

from config import settings


def _configure() -> None:
    level = logging.INFO

    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=level,
    )

    shared_processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    if settings.is_prod:
        renderer = structlog.processors.JSONRenderer()
        shared_processors.append(structlog.processors.format_exc_info)
    else:
        renderer = structlog.dev.ConsoleRenderer()

    structlog.configure(
        processors=shared_processors + [renderer],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


_configure()

logger = structlog.get_logger("davis")


def get_logger(name: str = "davis"):
    """Return a named structlog logger."""
    return structlog.get_logger(name)

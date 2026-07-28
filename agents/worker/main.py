"""arq worker entrypoint.

Run from the agents/ directory:

    arq worker.main.WorkerSettings
"""

from arq import cron

from core.tracing import init_tracing
from worker.settings import get_redis_settings
from worker.tasks import (
    poll_replies,
    process_due_enrollments,
    run_campaign,
    run_prospect_discovery,
)


async def startup(ctx: dict) -> None:
    init_tracing()


class WorkerSettings:
    functions = [run_prospect_discovery, run_campaign, process_due_enrollments]
    cron_jobs = [
        # Reply polling every 10 minutes (also runnable as `python -m jobs.poll_replies`)
        cron(poll_replies, minute={0, 10, 20, 30, 40, 50}, run_at_startup=False),
        # Follow-up scheduling: draft due sequence steps hourly
        cron(process_due_enrollments, minute={5}, run_at_startup=False),
    ]
    redis_settings = get_redis_settings()
    on_startup = startup
    max_jobs = 5
    job_timeout = 1800  # discovery can take a while

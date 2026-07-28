"""Fire-and-forget recording of agent runs, steps and tool calls to Supabase.

All writes are best-effort: they run in background tasks (or threads when no
event loop is running) and degrade to no-ops with a single warning if the
tables are missing or Supabase is unreachable.
"""

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any

from core.logger import logger

_disabled = False  # set after first hard failure so we only warn once


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _write(table: str, op: str, payload: dict, match: dict | None = None) -> None:
    """Synchronous Supabase write (runs in a worker thread)."""
    global _disabled
    if _disabled:
        return
    try:
        from core.db import get_supabase_admin

        query = get_supabase_admin().table(table)
        if op == "insert":
            query.insert(payload).execute()
        elif op == "update":
            q = query.update(payload)
            for k, v in (match or {}).items():
                q = q.eq(k, v)
            q.execute()
    except Exception as e:
        if not _disabled:
            _disabled = True
            logger.warning(
                "run_recorder_disabled",
                table=table,
                error=str(e),
                hint="agent ops tables missing? run migrations/005_agent_ops.sql",
            )


def _submit(table: str, op: str, payload: dict, match: dict | None = None) -> None:
    """Fire-and-forget: background thread via the running loop, or inline."""
    try:
        loop = asyncio.get_running_loop()
        task = loop.create_task(asyncio.to_thread(_write, table, op, payload, match))
        task.add_done_callback(lambda t: t.exception())  # swallow, _write already logs
    except RuntimeError:
        # No running event loop (e.g. sync context) — write inline, still guarded
        _write(table, op, payload, match)


def start_run(
    graph_name: str,
    *,
    workspace_id: str | None = None,
    user_id: str | None = None,
    trigger: str | None = None,
    model: str | None = None,
    prompt_versions: dict[str, int] | None = None,
    thread_id: str | None = None,
    status: str = "running",
    run_id: str | None = None,
) -> str:
    """Insert an agent_runs row; returns the run id immediately."""
    run_id = run_id or str(uuid.uuid4())
    _submit(
        "agent_runs",
        "insert",
        {
            "id": run_id,
            "workspace_id": workspace_id,
            "user_id": user_id,
            "graph_name": graph_name,
            "status": status,
            "thread_id": thread_id,
            "trigger": trigger,
            "prompt_versions": prompt_versions or {},
            "model": model,
            "started_at": _now(),
        },
    )
    return run_id


def update_run(run_id: str, **fields: Any) -> None:
    _submit("agent_runs", "update", fields, match={"id": run_id})


def record_step(
    run_id: str | None,
    node: str,
    *,
    status: str = "completed",
    input_summary: dict | None = None,
    output_summary: dict | None = None,
    latency_ms: int | None = None,
    tokens_in: int | None = None,
    tokens_out: int | None = None,
    cost_usd: float | None = None,
    error_class: str | None = None,
) -> str | None:
    if not run_id:
        return None
    step_id = str(uuid.uuid4())
    _submit(
        "agent_steps",
        "insert",
        {
            "id": step_id,
            "run_id": run_id,
            "node": node,
            "status": status,
            "input_summary": input_summary,
            "output_summary": output_summary,
            "latency_ms": latency_ms,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "cost_usd": cost_usd,
            "error_class": error_class,
        },
    )
    return step_id


def record_tool_call(
    run_id: str | None,
    tool: str,
    *,
    step_id: str | None = None,
    args_summary: dict | None = None,
    result_summary: dict | None = None,
    status: str = "completed",
    latency_ms: int | None = None,
) -> None:
    if not run_id:
        return
    _submit(
        "tool_calls",
        "insert",
        {
            "id": str(uuid.uuid4()),
            "run_id": run_id,
            "step_id": step_id,
            "tool": tool,
            "args_summary": args_summary,
            "result_summary": result_summary,
            "status": status,
            "latency_ms": latency_ms,
        },
    )


def finish_run(
    run_id: str | None,
    status: str = "completed",
    *,
    error: str | None = None,
    error_class: str | None = None,
) -> None:
    if not run_id:
        return
    update_run(
        run_id,
        status=status,
        finished_at=_now(),
        error=error,
        error_class=error_class,
    )

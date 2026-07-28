"""Braintrust tracing: init, LangChain callback handler, and step spans.

Everything degrades to a no-op when BRAINTRUST_API_KEY is unset.
"""

import time
from contextlib import asynccontextmanager
from typing import Any
from uuid import UUID

from langchain_core.callbacks import AsyncCallbackHandler

from config import settings
from core import run_recorder
from core.errors import classify_exception
from core.logger import logger

# USD per 1M tokens: (input, output)
MODEL_PRICES: dict[str, tuple[float, float]] = {
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4o-mini": (0.15, 0.60),
}

_bt_logger = None
_initialized = False


def init_tracing() -> None:
    """Initialise the Braintrust logger (no-op without an API key)."""
    global _bt_logger, _initialized
    if _initialized:
        return
    _initialized = True
    if not settings.BRAINTRUST_API_KEY:
        logger.info("tracing_disabled", reason="BRAINTRUST_API_KEY not set")
        return
    try:
        import braintrust

        _bt_logger = braintrust.init_logger(
            project="davis-2.0", api_key=settings.BRAINTRUST_API_KEY
        )
        logger.info("tracing_initialized", project="davis-2.0")
    except Exception as e:
        logger.warning("tracing_init_failed", error=str(e))


def estimate_cost(model: str | None, tokens_in: int | None, tokens_out: int | None) -> float | None:
    """Cost in USD, or None for unknown models / missing usage."""
    if not model or tokens_in is None or tokens_out is None:
        return None
    # Normalize versioned model ids like gpt-4o-mini-2024-07-18
    price = MODEL_PRICES.get(model)
    if price is None:
        for known, p in MODEL_PRICES.items():
            if model.startswith(known):
                price = p
                break
    if price is None:
        return None
    return (tokens_in * price[0] + tokens_out * price[1]) / 1_000_000


class BraintrustCallbackHandler(AsyncCallbackHandler):
    """Hand-rolled LangChain -> Braintrust bridge (braintrust-langchain not pinned).

    Captures prompt, completion, model, token usage, latency and cost per LLM call.
    """

    def __init__(self) -> None:
        self._calls: dict[UUID, dict[str, Any]] = {}

    # --- starts -----------------------------------------------------------
    async def on_llm_start(self, serialized, prompts, *, run_id: UUID, **kwargs) -> None:
        self._start(run_id, prompts, serialized, kwargs)

    async def on_chat_model_start(self, serialized, messages, *, run_id: UUID, **kwargs) -> None:
        prompts = [
            "\n".join(f"{m.type}: {m.content}" for m in batch) for batch in messages
        ]
        self._start(run_id, prompts, serialized, kwargs)

    def _start(self, run_id: UUID, prompts, serialized, kwargs) -> None:
        invocation = kwargs.get("invocation_params") or {}
        model = (
            invocation.get("model")
            or invocation.get("model_name")
            or (serialized or {}).get("kwargs", {}).get("model")
        )
        self._calls[run_id] = {"start": time.monotonic(), "prompts": prompts, "model": model}

    # --- end / error ------------------------------------------------------
    async def on_llm_end(self, response, *, run_id: UUID, **kwargs) -> None:
        call = self._calls.pop(run_id, None)
        if call is None or _bt_logger is None:
            return
        latency_ms = int((time.monotonic() - call["start"]) * 1000)

        llm_output = response.llm_output or {}
        usage = llm_output.get("token_usage") or llm_output.get("usage") or {}
        tokens_in = usage.get("prompt_tokens")
        tokens_out = usage.get("completion_tokens")
        model = llm_output.get("model_name") or call.get("model")

        completions = []
        for gen_list in response.generations:
            for gen in gen_list:
                completions.append(getattr(gen, "text", "") or str(gen))
                if tokens_in is None:
                    msg = getattr(gen, "message", None)
                    meta = getattr(msg, "usage_metadata", None) if msg else None
                    if meta:
                        tokens_in = meta.get("input_tokens")
                        tokens_out = meta.get("output_tokens")

        cost = estimate_cost(model, tokens_in, tokens_out)
        try:
            with _bt_logger.start_span(name="llm", type="llm") as span:
                span.log(
                    input=call["prompts"],
                    output=completions,
                    metrics={
                        k: v
                        for k, v in {
                            "prompt_tokens": tokens_in,
                            "completion_tokens": tokens_out,
                            "latency_ms": latency_ms,
                        }.items()
                        if v is not None
                    },
                    metadata={"model": model, "cost_usd": cost},
                )
        except Exception as e:
            logger.warning("braintrust_llm_span_failed", error=str(e))

    async def on_llm_error(self, error: BaseException, *, run_id: UUID, **kwargs) -> None:
        call = self._calls.pop(run_id, None)
        if call is None or _bt_logger is None:
            return
        latency_ms = int((time.monotonic() - call["start"]) * 1000)
        try:
            with _bt_logger.start_span(name="llm", type="llm") as span:
                span.log(
                    input=call["prompts"],
                    error=str(error),
                    metrics={"latency_ms": latency_ms},
                    metadata={"model": call.get("model"), "error_class": classify_exception(error).value},
                )
        except Exception as e:
            logger.warning("braintrust_llm_span_failed", error=str(e))


_handler: BraintrustCallbackHandler | None = None


def get_callback_handler() -> BraintrustCallbackHandler:
    """Shared callback handler instance for LLM clients."""
    global _handler
    if _handler is None:
        _handler = BraintrustCallbackHandler()
    return _handler


@asynccontextmanager
async def step_span(run_id: str | None, node: str, input_summary: dict | None = None):
    """Trace one graph node: Braintrust span + agent_steps row."""
    start = time.monotonic()
    span = None
    if _bt_logger is not None:
        try:
            span = _bt_logger.start_span(name=node, type="task")
        except Exception as e:
            logger.warning("braintrust_step_span_failed", error=str(e))
            span = None
    try:
        yield span
    except Exception as exc:
        latency_ms = int((time.monotonic() - start) * 1000)
        error_class = classify_exception(exc).value
        if span is not None:
            try:
                span.log(error=str(exc), metadata={"error_class": error_class, "run_id": run_id})
                span.end()
            except Exception:
                pass
        run_recorder.record_step(
            run_id,
            node,
            status="failed",
            input_summary=input_summary,
            latency_ms=latency_ms,
            error_class=error_class,
        )
        raise
    else:
        latency_ms = int((time.monotonic() - start) * 1000)
        if span is not None:
            try:
                span.log(metadata={"run_id": run_id}, metrics={"latency_ms": latency_ms})
                span.end()
            except Exception:
                pass
        run_recorder.record_step(
            run_id,
            node,
            status="completed",
            input_summary=input_summary,
            latency_ms=latency_ms,
        )

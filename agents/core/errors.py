"""Error taxonomy for agent runs and services."""

from enum import Enum


class ErrorClass(str, Enum):
    LLM_TIMEOUT = "LLM_TIMEOUT"
    LLM_RATE_LIMIT = "LLM_RATE_LIMIT"
    LLM_INVALID_OUTPUT = "LLM_INVALID_OUTPUT"
    TOOL_ERROR = "TOOL_ERROR"
    POLICY_BLOCKED = "POLICY_BLOCKED"
    DATA_ERROR = "DATA_ERROR"
    AUTH_ERROR = "AUTH_ERROR"
    UNKNOWN = "UNKNOWN"


class DavisError(Exception):
    """Base application error carrying an ErrorClass."""

    error_class: ErrorClass = ErrorClass.UNKNOWN

    def __init__(self, message: str, error_class: ErrorClass | None = None):
        super().__init__(message)
        if error_class is not None:
            self.error_class = error_class


class PolicyBlockedError(DavisError):
    error_class = ErrorClass.POLICY_BLOCKED


class DataError(DavisError):
    error_class = ErrorClass.DATA_ERROR


class ToolError(DavisError):
    error_class = ErrorClass.TOOL_ERROR


def classify_exception(exc: BaseException) -> ErrorClass:
    """Best-effort mapping of an arbitrary exception to an ErrorClass."""
    if isinstance(exc, DavisError):
        return exc.error_class

    name = type(exc).__name__.lower()
    text = str(exc).lower()

    # Auth
    if "401" in text or "unauthorized" in text or "invalid token" in text or "jwt" in text:
        return ErrorClass.AUTH_ERROR

    # Rate limits
    if "ratelimit" in name or "rate limit" in text or "429" in text or "too many requests" in text:
        return ErrorClass.LLM_RATE_LIMIT

    # Timeouts
    if isinstance(exc, TimeoutError) or "timeout" in name or "timed out" in text:
        return ErrorClass.LLM_TIMEOUT

    # Invalid / unparseable model output
    if "validationerror" in name or "jsondecode" in name or "outputparser" in name:
        return ErrorClass.LLM_INVALID_OUTPUT

    # Data-shaped problems
    if isinstance(exc, (KeyError, ValueError, TypeError)):
        return ErrorClass.DATA_ERROR

    # External tool / IO failures
    if isinstance(exc, (ConnectionError, OSError)) or "http" in name or "request" in name:
        return ErrorClass.TOOL_ERROR

    return ErrorClass.UNKNOWN

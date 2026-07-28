"""Deterministic email checks run before a draft can enter the approval queue.

Pure functions — no network, no db. `run_checks` returns a list of failure
dicts [{code, detail}]; empty list means the draft is safe to queue for
approval.
"""

import re
from urllib.parse import urlparse

SUBJECT_MIN, SUBJECT_MAX = 1, 120
BODY_MIN, BODY_MAX = 40, 3000

# [Your Name], [Company], {{first_name}} etc.
PLACEHOLDER_RE = re.compile(r"\[[^\]]{1,40}\]|\{\{.*?\}\}")
URL_RE = re.compile(r"https?://[^\s<>\")\]]+", re.IGNORECASE)
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")


def _normalize_claims(disallowed_claims) -> list[str]:
    """product_profiles.disallowed_claims is jsonb — items may be strings or
    dicts like {"claim": "..."}."""
    out: list[str] = []
    for item in disallowed_claims or []:
        if isinstance(item, str):
            text = item
        elif isinstance(item, dict):
            text = item.get("claim") or item.get("text") or ""
        else:
            text = str(item)
        text = text.strip()
        if text:
            out.append(text)
    return out


def check_subject(subject: str) -> list[dict]:
    subject = (subject or "").strip()
    if not (SUBJECT_MIN <= len(subject) <= SUBJECT_MAX):
        return [
            {
                "code": "SUBJECT_LENGTH",
                "detail": f"Subject must be {SUBJECT_MIN}-{SUBJECT_MAX} chars (got {len(subject)})",
            }
        ]
    return []


def check_body_length(body: str) -> list[dict]:
    body = (body or "").strip()
    if not (BODY_MIN <= len(body) <= BODY_MAX):
        return [
            {
                "code": "BODY_LENGTH",
                "detail": f"Body must be {BODY_MIN}-{BODY_MAX} chars (got {len(body)})",
            }
        ]
    return []


def check_placeholders(subject: str, body: str) -> list[dict]:
    found = PLACEHOLDER_RE.findall(subject or "") + PLACEHOLDER_RE.findall(body or "")
    if found:
        return [
            {
                "code": "UNRESOLVED_PLACEHOLDER",
                "detail": f"Unresolved placeholders: {', '.join(sorted(set(found))[:5])}",
            }
        ]
    return []


def check_disallowed_claims(subject: str, body: str, disallowed_claims) -> list[dict]:
    text = f"{subject or ''}\n{body or ''}".lower()
    hits = [c for c in _normalize_claims(disallowed_claims) if c.lower() in text]
    if hits:
        return [
            {
                "code": "DISALLOWED_CLAIM",
                "detail": f"Contains disallowed claim(s): {'; '.join(hits[:5])}",
            }
        ]
    return []


def check_urls(body: str) -> list[dict]:
    failures = []
    for raw in URL_RE.findall(body or ""):
        url = raw.rstrip(".,;:!?'\"")
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc or "." not in parsed.netloc:
            failures.append({"code": "INVALID_URL", "detail": f"Invalid URL: {raw}"})
    return failures


def check_recipient(to_email: str) -> list[dict]:
    if not EMAIL_RE.match((to_email or "").strip()):
        return [
            {
                "code": "INVALID_RECIPIENT",
                "detail": f"Recipient email is not valid: '{to_email}'",
            }
        ]
    return []


def run_checks(
    subject: str,
    body: str,
    to_email: str,
    disallowed_claims=None,
) -> list[dict]:
    """Run all deterministic checks. Returns list of failures (empty = pass)."""
    failures: list[dict] = []
    failures += check_subject(subject)
    failures += check_body_length(body)
    failures += check_placeholders(subject, body)
    failures += check_disallowed_claims(subject, body, disallowed_claims)
    failures += check_urls(body)
    failures += check_recipient(to_email)
    return failures

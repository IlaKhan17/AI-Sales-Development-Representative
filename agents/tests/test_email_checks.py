"""Unit tests for deterministic email checks (pure functions, no network)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.email_checks import run_checks  # noqa: E402

GOOD_SUBJECT = "Quick question about data quality at Acme"
GOOD_BODY = (
    "Hi Jane,\n\nI saw Acme is scaling its data team and thought our platform "
    "might help with governance. Would you be open to a short call next week?\n\nBest,\nSam"
)
GOOD_TO = "jane@acme.com"


def codes(failures):
    return [f["code"] for f in failures]


def test_happy_path_passes():
    assert run_checks(GOOD_SUBJECT, GOOD_BODY, GOOD_TO, []) == []


def test_subject_too_short_and_too_long():
    assert "SUBJECT_LENGTH" in codes(run_checks("", GOOD_BODY, GOOD_TO))
    assert "SUBJECT_LENGTH" in codes(run_checks("x" * 121, GOOD_BODY, GOOD_TO))


def test_body_length_bounds():
    assert "BODY_LENGTH" in codes(run_checks(GOOD_SUBJECT, "too short", GOOD_TO))
    assert "BODY_LENGTH" in codes(run_checks(GOOD_SUBJECT, "x" * 3001, GOOD_TO))


def test_unresolved_bracket_placeholder():
    body = GOOD_BODY + "\n\nBest regards,\n[Your Name]"
    assert "UNRESOLVED_PLACEHOLDER" in codes(run_checks(GOOD_SUBJECT, body, GOOD_TO))


def test_unresolved_mustache_placeholder():
    body = GOOD_BODY.replace("Jane", "{{first_name}}")
    assert "UNRESOLVED_PLACEHOLDER" in codes(run_checks(GOOD_SUBJECT, body, GOOD_TO))


def test_placeholder_in_subject_detected():
    assert "UNRESOLVED_PLACEHOLDER" in codes(
        run_checks("Question for [Company]", GOOD_BODY, GOOD_TO)
    )


def test_disallowed_claim_case_insensitive():
    body = GOOD_BODY + " We are the #1 Platform in the market."
    failures = run_checks(GOOD_SUBJECT, body, GOOD_TO, ["#1 platform"])
    assert "DISALLOWED_CLAIM" in codes(failures)


def test_disallowed_claim_dict_form():
    body = GOOD_BODY + " Guaranteed ROI in 30 days."
    failures = run_checks(GOOD_SUBJECT, body, GOOD_TO, [{"claim": "guaranteed roi"}])
    assert "DISALLOWED_CLAIM" in codes(failures)


def test_valid_url_ok():
    body = GOOD_BODY + " More info: https://example.com/case-study."
    assert "INVALID_URL" not in codes(run_checks(GOOD_SUBJECT, body, GOOD_TO))


def test_invalid_url_flagged():
    body = GOOD_BODY + " See http://not_a_domain for details."
    assert "INVALID_URL" in codes(run_checks(GOOD_SUBJECT, body, GOOD_TO))


def test_invalid_recipient():
    assert "INVALID_RECIPIENT" in codes(run_checks(GOOD_SUBJECT, GOOD_BODY, "Jane Doe"))
    assert "INVALID_RECIPIENT" in codes(run_checks(GOOD_SUBJECT, GOOD_BODY, ""))


def test_multiple_failures_collected():
    failures = run_checks("", "short [Name]", "bad-email", ["short"])
    got = set(codes(failures))
    assert {"SUBJECT_LENGTH", "BODY_LENGTH", "UNRESOLVED_PLACEHOLDER", "DISALLOWED_CLAIM", "INVALID_RECIPIENT"} <= got

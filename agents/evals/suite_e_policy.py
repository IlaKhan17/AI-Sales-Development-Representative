"""Suite E — send-policy scenarios (deterministic; also a pytest file).

Each case in evals/datasets/policy_v1.jsonl describes a message + environment
(suppression list, daily counter, enrollments, prospect email confidence,
already-sent duplicates); we build fake db/redis (same pattern as
agents/tests/test_policy.py), run core.policy.check_send_allowed and assert
the exact set of violation codes.

Gate: 100% pass. Runnable both ways:
  * pytest agents/evals/suite_e_policy.py
  * python -m evals.runner --suite e_policy
"""

import pytest

import evals  # noqa: F401  (bootstraps sys.path + dummy env)
from core.policy import check_send_allowed, daily_counter_key
from evals.common import CaseResult, SuiteResult, load_dataset

SUITE = "e_policy"
DATASET = "policy_v1"
WS = "ws-eval"


# ── Fakes (mirrors agents/tests/test_policy.py) ─────────────────────────────


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeQuery:
    def __init__(self, rows):
        self._rows = list(rows)

    def select(self, *_args, **_kw):
        return self

    def eq(self, key, value):
        self._rows = [r for r in self._rows if r.get(key) == value]
        return self

    def in_(self, key, values):
        self._rows = [r for r in self._rows if r.get(key) in values]
        return self

    def order(self, *_args, **_kw):
        return self

    def limit(self, n):
        self._rows = self._rows[:n]
        return self

    def execute(self):
        return _FakeResult(self._rows)


class _FakeDB:
    def __init__(self, tables):
        self.tables = tables

    def table(self, name):
        return _FakeQuery(self.tables.get(name, []))


class _FakeRedis:
    def __init__(self, store=None):
        self.store = store or {}

    def get(self, key):
        return self.store.get(key)


# ── Case → environment ───────────────────────────────────────────────────────


def _build_env(inp: dict):
    message = {
        "id": "msg-1",
        "status": "approved",
        "to_email": "jane@acme.com",
        "prospect_id": "p-1",
        "idempotency_key": "p-1:1",
        "enrollment_id": None,
    }
    message.update(inp.get("message") or {})

    db = _FakeDB(
        {
            "suppression_entries": [
                {"id": f"s-{i}", "workspace_id": WS, "email": e, "reason": "unsubscribe"}
                for i, e in enumerate(inp.get("suppression") or [])
            ],
            "messages": inp.get("sent_messages") or [],
            "sequence_enrollments": inp.get("enrollments") or [],
            "prospects_v2": [
                {"id": "p-1", "email_confidence": inp.get("email_confidence", "verified")}
            ],
            "product_profiles": [],
        }
    )
    redis = _FakeRedis({daily_counter_key(WS): str(inp.get("counter", 0))})
    return db, redis, message, inp.get("campaign")


def _run_case(case: dict) -> CaseResult:
    db, redis, message, campaign = _build_env(case["input"])
    result = check_send_allowed(db, redis, WS, campaign, message)
    got_codes = sorted(v["code"] for v in result.violations)
    exp = case["expected"]
    passed = result.allowed == exp["allowed"] and got_codes == sorted(exp["violation_codes"])
    return CaseResult(
        case_key=case["case_key"],
        passed=passed,
        scores={"allowed": result.allowed, "violation_codes": got_codes},
        output={"violations": result.violations},
    )


# ── Runner entrypoint ────────────────────────────────────────────────────────


def run_suite(limit: int | None = None, smoke: bool = False) -> SuiteResult:
    cases = load_dataset(DATASET, limit=limit)
    suite = SuiteResult(suite=SUITE, dataset=DATASET)
    suite.results = [_run_case(c) for c in cases]
    suite.metrics = {"cases": len(suite.results), "pass_rate": round(suite.pass_rate, 4)}
    suite.gates = {"pass_rate_100pct": suite.pass_rate == 1.0}
    return suite


# ── Pytest entrypoint ────────────────────────────────────────────────────────

_CASES = load_dataset(DATASET)


@pytest.mark.parametrize("case", _CASES, ids=[c["case_key"] for c in _CASES])
def test_policy_case(case):
    result = _run_case(case)
    assert result.passed, (
        f"{case['case_key']}: expected allowed={case['expected']['allowed']} "
        f"codes={sorted(case['expected']['violation_codes'])}, got {result.scores}"
    )

"""Suite A — deterministic prospect-ranking scorer (no LLM).

Runs services.scoring_service.score_prospect on each case and checks:
  * status matches expected.status
  * total falls within [expected.total_min, expected.total_max]

Gate: 100% pass (the scorer is deterministic; any drift is a regression).
"""

from evals.common import CaseResult, SuiteResult, load_dataset
from services.scoring_service import score_prospect

SUITE = "a_ranking"
DATASET = "ranking_v1"


def run_suite(limit: int | None = None, smoke: bool = False) -> SuiteResult:
    cases = load_dataset(DATASET, limit=limit)
    suite = SuiteResult(suite=SUITE, dataset=DATASET)

    for case in cases:
        inp = case["input"]
        expected = case["expected"]
        try:
            result = score_prospect(
                inp.get("signals") or {},
                inp.get("icp_definition") or {},
                inp.get("weights") or {},
            )
            status_ok = result.status == expected["status"]
            total_ok = expected["total_min"] <= result.total <= expected["total_max"]
            suite.results.append(
                CaseResult(
                    case_key=case["case_key"],
                    passed=status_ok and total_ok,
                    scores={
                        "status_match": status_ok,
                        "total_in_range": total_ok,
                        "total": result.total,
                        "status": result.status,
                    },
                    output=result.to_dict(),
                )
            )
        except Exception as e:  # noqa: BLE001 — record, don't abort the suite
            suite.results.append(
                CaseResult(case_key=case["case_key"], passed=False, error=str(e))
            )

    suite.metrics = {
        "cases": len(suite.results),
        "pass_rate": round(suite.pass_rate, 4),
    }
    suite.gates = {"pass_rate_100pct": suite.pass_rate == 1.0}
    return suite

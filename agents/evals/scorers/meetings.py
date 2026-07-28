"""Suite F — meeting extraction scorer. SKELETON (excluded from CI gates).

TODO(suite-f): run meeting_intelligence_service over each stub transcript and
score extracted action items against expected.action_items using fuzzy
matching (recall of ground-truth items + precision against invented items).
Dataset stub: evals/datasets/meetings_v1.jsonl (5 transcripts with embedded
ground-truth action items, labels.stub=true).
"""

from evals.common import CaseResult, SuiteResult, load_dataset

SUITE = "f_meetings"
DATASET = "meetings_v1"


def run_suite(limit: int | None = None, smoke: bool = False) -> SuiteResult:
    cases = load_dataset(DATASET, limit=limit)
    suite = SuiteResult(suite=SUITE, dataset=DATASET)
    for case in cases:
        suite.results.append(
            CaseResult(case_key=case["case_key"], passed=False, error="TODO: not implemented")
        )
    suite.metrics = {"cases": len(cases), "status": "skeleton — not implemented"}
    suite.gates = {}  # intentionally no gates until implemented
    return suite

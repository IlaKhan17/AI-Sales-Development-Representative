"""Suite B — research citation scorer. SKELETON (excluded from CI gates).

TODO(suite-b): once the research/dossier pipeline exposes claims with
evidence_ids, implement:
  * citation coverage: every claim in the dossier has >= 1 evidence id that
    resolves to a real evidence row (expected.all_claims_cited).
  * hallucination check: LLM judge verifies each claim is entailed by its
    cited snippet.
Dataset stub: evals/datasets/research_v1.jsonl (5 cases, labels.stub=true).
"""

from evals.common import CaseResult, SuiteResult, load_dataset

SUITE = "b_research"
DATASET = "research_v1"


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

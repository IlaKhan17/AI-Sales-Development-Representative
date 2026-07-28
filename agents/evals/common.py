"""Shared eval plumbing: dataset loading and result containers."""

import json
from dataclasses import dataclass, field
from typing import Any

from evals import DATASETS_DIR


@dataclass
class CaseResult:
    case_key: str
    passed: bool
    scores: dict[str, Any] = field(default_factory=dict)
    output: dict[str, Any] | None = None
    error: str | None = None


@dataclass
class SuiteResult:
    suite: str
    dataset: str
    results: list[CaseResult] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)
    # gate name -> passed
    gates: dict[str, bool] = field(default_factory=dict)

    @property
    def gates_passed(self) -> bool:
        return all(self.gates.values())

    @property
    def pass_rate(self) -> float:
        if not self.results:
            return 0.0
        return sum(1 for r in self.results if r.passed) / len(self.results)


def load_dataset(name: str, limit: int | None = None) -> list[dict]:
    """Load a jsonl dataset from evals/datasets. `name` omits the extension."""
    path = DATASETS_DIR / f"{name}.jsonl"
    cases: list[dict] = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                cases.append(json.loads(line))
    if limit:
        cases = cases[:limit]
    return cases

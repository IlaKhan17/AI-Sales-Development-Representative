"""Suite D — reply-intent classification scorer (LLM).

Calls services.reply_classifier_service.classify_reply on each case.

Metrics: accuracy, macro-F1, per-intent recall, unsubscribe recall,
escalation accuracy (requires_human_review match where expected provides it).

Gate: unsubscribe_recall MUST be 1.0 — a missed unsubscribe is a compliance
failure, so it blocks CI regardless of overall accuracy.

Smoke mode runs the first 10 cases only (cheap PR gate).
"""

import asyncio
from collections import defaultdict

from evals.common import CaseResult, SuiteResult, load_dataset

SUITE = "d_reply"
DATASET = "replies_v1"
SMOKE_LIMIT = 10


async def _run_async(cases: list[dict]) -> list[tuple[dict, dict | None, str | None]]:
    from services.reply_classifier_service import classify_reply

    async def one(case: dict):
        inp = case["input"]
        try:
            result = await classify_reply(
                body=inp.get("body", ""),
                subject=inp.get("subject", ""),
                from_email=inp.get("from_email", ""),
            )
            return case, result, None
        except Exception as e:  # noqa: BLE001
            return case, None, str(e)

    sem = asyncio.Semaphore(8)

    async def guarded(case):
        async with sem:
            return await one(case)

    return await asyncio.gather(*[guarded(c) for c in cases])


def run_suite(limit: int | None = None, smoke: bool = False) -> SuiteResult:
    if smoke:
        limit = min(limit or SMOKE_LIMIT, SMOKE_LIMIT)
    cases = load_dataset(DATASET, limit=limit)
    suite = SuiteResult(suite=SUITE, dataset=DATASET)

    outcomes = asyncio.run(_run_async(cases))

    # Confusion counts for macro-F1 / recall
    tp: dict[str, int] = defaultdict(int)
    fp: dict[str, int] = defaultdict(int)
    fn: dict[str, int] = defaultdict(int)
    escalation_total = escalation_correct = 0

    for case, result, error in outcomes:
        expected = case["expected"]
        if error or result is None:
            suite.results.append(
                CaseResult(case_key=case["case_key"], passed=False, error=error)
            )
            fn[expected["intent"]] += 1
            continue

        exp_intent = expected["intent"]
        got_intent = result["intent"]
        intent_ok = got_intent == exp_intent
        if intent_ok:
            tp[exp_intent] += 1
        else:
            fn[exp_intent] += 1
            fp[got_intent] += 1

        review_ok = True
        if "requires_human_review" in expected:
            escalation_total += 1
            review_ok = result["requires_human_review"] == expected["requires_human_review"]
            if review_ok:
                escalation_correct += 1

        suite.results.append(
            CaseResult(
                case_key=case["case_key"],
                passed=intent_ok and review_ok,
                scores={
                    "intent_match": intent_ok,
                    "expected_intent": exp_intent,
                    "predicted_intent": got_intent,
                    "confidence": result["confidence"],
                    "review_match": review_ok,
                },
                output=result,
            )
        )

    intents = sorted(set(tp) | set(fp) | set(fn))
    per_intent_recall: dict[str, float] = {}
    f1s: list[float] = []
    for intent in intents:
        support = tp[intent] + fn[intent]
        recall = tp[intent] / support if support else 0.0
        precision = tp[intent] / (tp[intent] + fp[intent]) if (tp[intent] + fp[intent]) else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
        if support:
            per_intent_recall[intent] = round(recall, 4)
            f1s.append(f1)

    total = len(suite.results)
    correct = sum(1 for r in suite.results if r.scores.get("intent_match"))
    unsub_support = tp["unsubscribe"] + fn["unsubscribe"]
    unsubscribe_recall = tp["unsubscribe"] / unsub_support if unsub_support else 1.0

    suite.metrics = {
        "cases": total,
        "accuracy": round(correct / total, 4) if total else 0.0,
        "macro_f1": round(sum(f1s) / len(f1s), 4) if f1s else 0.0,
        "unsubscribe_recall": round(unsubscribe_recall, 4),
        "escalation_accuracy": (
            round(escalation_correct / escalation_total, 4) if escalation_total else None
        ),
        "per_intent_recall": per_intent_recall,
    }
    suite.gates = {"unsubscribe_recall_1.0": unsubscribe_recall == 1.0}
    return suite

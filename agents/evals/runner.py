"""Eval runner CLI.

    python -m evals.runner --suite <a_ranking|c_email|d_reply|e_policy|all> \
        [--smoke] [--limit N]

Runs the requested suite(s), prints a per-case table + metrics + gates, and
exits 1 if any gate fails. Side channels (both best-effort, silently skipped
when not configured):
  * Supabase: persists eval_runs / eval_results when SUPABASE_URL points at a
    real project and SUPABASE_SERVICE_ROLE_KEY is set.
  * Braintrust: logs one experiment per suite when BRAINTRUST_API_KEY is set.

b_research and f_meetings are skeleton suites: runnable by name for
visibility, but excluded from `all` and from gating.
"""

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone

import evals  # noqa: F401  (bootstraps sys.path + dummy env before config import)
from evals.common import SuiteResult

GATED_SUITES = ["a_ranking", "c_email", "d_reply", "e_policy"]
ALL_SUITES = GATED_SUITES + ["b_research", "f_meetings"]

_DATASET_NAMES = {
    "a_ranking": "ranking_v1",
    "c_email": "email_prospects_v1",
    "d_reply": "replies_v1",
    "e_policy": "policy_v1",
    "b_research": "research_v1",
    "f_meetings": "meetings_v1",
}


def _get_runner(suite: str):
    if suite == "a_ranking":
        from evals.scorers.ranking import run_suite
    elif suite == "c_email":
        from evals.suite_c_email import run_suite
    elif suite == "d_reply":
        from evals.scorers.reply_cls import run_suite
    elif suite == "e_policy":
        from evals.suite_e_policy import run_suite
    elif suite == "b_research":
        from evals.scorers.research import run_suite
    elif suite == "f_meetings":
        from evals.scorers.meetings import run_suite
    else:
        raise SystemExit(f"Unknown suite '{suite}'. Choose from: {', '.join(ALL_SUITES)}, all")
    return run_suite


def _git_ref() -> str | None:
    try:
        return (
            subprocess.run(
                ["git", "rev-parse", "--short", "HEAD"],
                capture_output=True, text=True, check=True, timeout=5,
            ).stdout.strip()
            or None
        )
    except Exception:
        return None


# ── Reporting ────────────────────────────────────────────────────────────────


def print_report(suite: SuiteResult) -> None:
    print(f"\n=== Suite {suite.suite} (dataset: {suite.dataset}) ===")
    key_w = max((len(r.case_key) for r in suite.results), default=8)
    print(f"{'case':<{key_w}}  {'result':<6}  detail")
    print("-" * (key_w + 60))
    for r in suite.results:
        detail = r.error or json.dumps(
            {k: v for k, v in r.scores.items() if not isinstance(v, (dict, list))},
            ensure_ascii=False,
            default=str,
        )
        print(f"{r.case_key:<{key_w}}  {'PASS' if r.passed else 'FAIL':<6}  {detail[:100]}")
    print(f"\nmetrics: {json.dumps(suite.metrics, ensure_ascii=False)}")
    for gate, ok in suite.gates.items():
        print(f"gate {gate}: {'PASS' if ok else 'FAIL'}")
    if not suite.gates:
        print("gates: (none — suite excluded from gating)")


# ── Persistence side channels ────────────────────────────────────────────────


def _supabase_client():
    """Admin client, or None when env points at localhost/dummy."""
    from config import settings

    url = (settings.SUPABASE_URL or "").lower()
    if not settings.SUPABASE_SERVICE_ROLE_KEY:
        return None
    if "localhost" in url or "127.0.0.1" in url or "dummy" in url or not url:
        return None
    try:
        from core.db import get_supabase_admin

        return get_supabase_admin()
    except Exception:
        return None


def persist_supabase(suite: SuiteResult, started_at: str, status: str) -> None:
    client = _supabase_client()
    if client is None:
        return
    try:
        from config import settings

        dataset_rows = (
            client.table("datasets").select("id").eq("name", suite.dataset).limit(1).execute()
        ).data or []
        run = (
            client.table("eval_runs")
            .insert(
                {
                    "suite": suite.suite,
                    "dataset_id": dataset_rows[0]["id"] if dataset_rows else None,
                    "started_at": started_at,
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                    "model": settings.MODEL_NAME,
                    "git_ref": _git_ref(),
                    "status": status,
                    "summary": {
                        "metrics": suite.metrics,
                        "gates": suite.gates,
                        "pass_rate": round(suite.pass_rate, 4),
                    },
                }
            )
            .execute()
        ).data[0]
        client.table("eval_results").insert(
            [
                {
                    "eval_run_id": run["id"],
                    "case_key": r.case_key,
                    "scores": r.scores,
                    "passed": r.passed,
                    "output": r.output,
                    "error": r.error,
                }
                for r in suite.results
            ]
        ).execute()
        print(f"persisted eval_run {run['id']} to Supabase")
    except Exception as e:  # persistence must never fail the eval itself
        print(f"warning: Supabase persistence failed: {e}", file=sys.stderr)


def log_braintrust(suite: SuiteResult) -> None:
    import os

    if not os.getenv("BRAINTRUST_API_KEY"):
        return
    try:
        import braintrust

        experiment = braintrust.init(
            project="davis-2.0",
            experiment=f"{suite.suite}-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}",
        )
        for r in suite.results:
            with experiment.start_span(name=r.case_key) as span:
                span.log(
                    input={"case_key": r.case_key},
                    output=r.output,
                    scores={"passed": 1.0 if r.passed else 0.0},
                    metadata={"scores": r.scores, "error": r.error},
                )
        experiment.log(metadata={"metrics": suite.metrics, "gates": suite.gates})
        summary = experiment.summarize()
        print(f"braintrust experiment: {getattr(summary, 'experiment_url', '')}")
    except Exception as e:
        print(f"warning: Braintrust logging failed: {e}", file=sys.stderr)


# ── Main ─────────────────────────────────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="evals.runner", description="Run eval suites")
    parser.add_argument("--suite", required=True, help=f"{'|'.join(ALL_SUITES)}|all")
    parser.add_argument("--smoke", action="store_true", help="cheap subset for PR gating")
    parser.add_argument("--limit", type=int, default=None, help="max cases per suite")
    args = parser.parse_args(argv)

    suites = GATED_SUITES if args.suite == "all" else [args.suite]
    exit_code = 0
    for name in suites:
        run_suite = _get_runner(name)
        started_at = datetime.now(timezone.utc).isoformat()
        try:
            result = run_suite(limit=args.limit, smoke=args.smoke)
            status = "completed"
        except Exception as e:
            print(f"suite {name} crashed: {e}", file=sys.stderr)
            result = SuiteResult(suite=name, dataset=_DATASET_NAMES.get(name, ""))
            result.gates = {"suite_completed": False}
            status = "failed"
        print_report(result)
        persist_supabase(result, started_at, status)
        log_braintrust(result)
        if not result.gates_passed:
            exit_code = 1

    if exit_code:
        print("\nRESULT: GATE FAILURES — see above", file=sys.stderr)
    else:
        print("\nRESULT: all gates passed")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())

"""Upsert repo datasets (evals/datasets/*.jsonl) into Supabase.

The repo is the source of truth: rows are upserted by (dataset name,
case_key); cases removed from a jsonl file are deleted from eval_cases.

    python -m evals.sync_datasets

Requires a real SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
"""

import sys

import evals  # noqa: F401
from evals import DATASETS_DIR
from evals.common import load_dataset

DATASET_META = {
    "ranking_v1": ("a_ranking", "Deterministic prospect-scoring cases"),
    "email_prospects_v1": ("c_email", "Prospect payloads for email drafting (incl. adversarial)"),
    "replies_v1": ("d_reply", "Reply-intent classification cases (12 intents)"),
    "policy_v1": ("e_policy", "Send-policy scenarios"),
    "research_v1": ("b_research", "Research citation cases (stub)"),
    "meetings_v1": ("f_meetings", "Meeting transcripts with ground-truth action items (stub)"),
}


def main() -> int:
    from config import settings

    url = (settings.SUPABASE_URL or "").lower()
    if not settings.SUPABASE_SERVICE_ROLE_KEY or "localhost" in url or "dummy" in url:
        print("sync_datasets: no real Supabase configured — nothing to do", file=sys.stderr)
        return 1

    from core.db import get_supabase_admin

    client = get_supabase_admin()

    for path in sorted(DATASETS_DIR.glob("*.jsonl")):
        name = path.stem
        suite, description = DATASET_META.get(name, (None, None))
        dataset = (
            client.table("datasets")
            .upsert(
                {"name": name, "suite": suite, "description": description},
                on_conflict="name",
            )
            .execute()
        ).data[0]

        cases = load_dataset(name)
        client.table("eval_cases").upsert(
            [
                {
                    "dataset_id": dataset["id"],
                    "case_key": c["case_key"],
                    "input": c.get("input") or {},
                    "expected": c.get("expected") or {},
                    "labels": c.get("labels") or {},
                }
                for c in cases
            ],
            on_conflict="dataset_id,case_key",
        ).execute()

        # Repo is source of truth: remove cases that no longer exist.
        keys = [c["case_key"] for c in cases]
        existing = (
            client.table("eval_cases")
            .select("id, case_key")
            .eq("dataset_id", dataset["id"])
            .execute()
        ).data or []
        stale = [row["id"] for row in existing if row["case_key"] not in keys]
        for row_id in stale:
            client.table("eval_cases").delete().eq("id", row_id).execute()

        print(f"synced {name}: {len(cases)} cases ({len(stale)} stale removed)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

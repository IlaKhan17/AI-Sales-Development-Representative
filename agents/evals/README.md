# Evals

Eval suites for the Davis 2.0 agent pipeline. Datasets live in this repo
(`evals/datasets/*.jsonl`) and are the source of truth; Supabase mirrors them
for dashboards/annotation.

## Running

From `agents/` (venv with `requirements.txt` + `requirements-dev.txt`):

```bash
python -m evals.runner --suite a_ranking          # deterministic, free
python -m evals.runner --suite e_policy           # deterministic, free
python -m evals.runner --suite d_reply --smoke    # LLM, first 10 cases
python -m evals.runner --suite c_email            # LLM + GPT-4.1 judge
python -m evals.runner --suite all                # all gated suites (A, C, D, E)
python -m evals.runner --suite d_reply --limit 20 # cap cases
```

Exit code is 1 if any gate fails. Deterministic suites (A, E) need no env at
all (dummy Supabase creds are injected). LLM suites (C, D) need
`OPENAI_API_KEY`.

Side channels (both optional, silently skipped when unconfigured):

- **Supabase**: `eval_runs` / `eval_results` rows are written when
  `SUPABASE_URL` points at a real project (not localhost/dummy) and
  `SUPABASE_SERVICE_ROLE_KEY` is set.
- **Braintrust**: one experiment per suite in project `davis-2.0` when
  `BRAINTRUST_API_KEY` is set.

Suite E is also a plain pytest file: `pytest evals/suite_e_policy.py`.

## Suites & gates

| Suite | Dataset (cases) | What it measures | CI gate |
|---|---|---|---|
| `a_ranking` | `ranking_v1` (10) | `scoring_service.score_prospect`: status match + total in `[total_min, total_max]` | 100% pass (deterministic) |
| `b_research` | `research_v1` (5) | citation coverage of dossier claims | **stub — no gate** |
| `c_email` | `email_prospects_v1` (15) | drafts pass `email_checks` (non-adversarial cases) + GPT-4.1 rubric judge | deterministic checks clean on non-adversarial; judge mean overall >= 3.5 (non-smoke); `no_injection_compliance` true on all injection cases |
| `d_reply` | `replies_v1` (60) | 12-intent reply classification: accuracy, macro-F1, per-intent recall, escalation accuracy | **unsubscribe recall = 1.0** (a missed unsubscribe is a compliance failure) |
| `e_policy` | `policy_v1` (8) | `check_send_allowed` violation codes per scenario | 100% pass (deterministic) |
| `f_meetings` | `meetings_v1` (5) | action-item extraction vs embedded ground truth | **stub — no gate** |
| G (business outcomes) | live data | `business_outcomes` SQL view (migration 010) + `/evals/outcomes` + frontend Evals page | none — observability |

`--smoke` runs a cheap subset (first 10 reply cases / 3 email cases) and
skips the judge-mean gate; used on PRs touching prompts/services/evals.

Suites B and F are skeletons: datasets and scorer stubs exist
(`scorers/research.py`, `scorers/meetings.py`, `labels.stub=true`), they are
excluded from `--suite all` and carry no gates. Implement per the TODOs in
each scorer.

## Adding cases

Append a JSON line to the relevant `evals/datasets/*.jsonl`:

```json
{"case_key": "unique_key", "input": {...}, "expected": {...}, "labels": {...}}
```

- `case_key` must be unique within the file (it's the upsert key).
- `expected` shape is suite-specific — see existing lines. For `c_email` it
  is `{}` (judged, not exact-match); use `labels` to mark
  `{"adversarial": true, "injection": true}`.
- For `d_reply`, only set `expected.requires_human_review` when it is
  deterministic (objection/referral/ambiguous/wrong_person are always true).
- Deterministic suites: run the suite locally and confirm 100% before
  committing — their gate is exact.

## Syncing datasets to Supabase

```bash
python -m evals.sync_datasets
```

Upserts `datasets` + `eval_cases` by `(dataset name, case_key)` and deletes
DB cases that were removed from the repo file. Run after any dataset edit
(requires service-role credentials; run migration `009_evals.sql` first).

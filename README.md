# Davis — evidence-grounded, approval-first AI SDR

Davis runs outbound sales as an auditable agent workflow: it discovers prospects,
gathers **evidence** for every claim it makes about them, scores them with
**deterministic** code (not model intuition), drafts outreach constrained to
**approved** company claims, and sends nothing without a **human approval**.
Every LLM call, tool call and policy decision is traced and evaluated.

## What makes it different

| Principle | How it is enforced |
|---|---|
| Every score is reproducible | An LLM extracts structured signals with evidence ids; a pure Python function applies ICP weights (`agents/services/scoring_service.py`, 13 unit tests) |
| Every claim cites a source | `prospect_evidence` rows carry `source_url`, `evidence_snippet`, `observed_at`, `confidence`; leads without evidence become `insufficient_evidence`, never a confident score |
| No email leaves without a human | Drafts enter an approval queue; sending runs a policy guard (suppression, daily cap, duplicate, stopped enrollment, low-confidence address) |
| Claims can't be invented | Email generation is restricted to `approved_claims`; deterministic checks reject unresolved placeholders and disallowed claims |
| Quality is measured, not asserted | Eval suites for ranking, reply classification, email quality and policy, plus a production business-outcomes view |

## Architecture

```
Next.js 16 (Vercel)              FastAPI (Railway)                 Data
├── onboarding / workspaces      ├── routers/ (16 modules)         ├── Supabase Postgres
├── ICP editor (versioned)       ├── services/ (domain logic)      │   └── RLS + workspace scoping
├── campaigns + dossiers         ├── core/ (auth, policy,          ├── Pinecone (per-workspace
├── approval queue               │        prompts, tracing)        │   namespaces)
├── reply inbox                  ├── worker/ (arq jobs)            └── Redis (cache, queue,
├── meetings + calendar          ├── jobs/ (reply polling cron)        send counters)
└── evals dashboard              └── evals/ (suites + datasets)
                                          │
                                    Braintrust (traces, experiments)
```

Repo layout: the **frontend is the repo root**, the **backend lives in `agents/`**.

## Quick start

Prerequisites: Node 20+, Python 3.11+, and accounts for Supabase, OpenAI,
Pinecone, Redis (all have free tiers).

```bash
# 1. Database — run migrations in order in the Supabase SQL editor
#    (or: psql "$SUPABASE_DB_URL" -f agents/migrations/<file>.sql)
ls agents/migrations/*.sql

# 2. Backend
cd agents
cp .env.example .env          # fill in your keys
pip install -r requirements.txt -r requirements-dev.txt
playwright install chromium   # only needed for scraper sources
uvicorn main:app --reload     # http://localhost:8000

# 3. Worker (background campaigns, follow-up scheduling, reply polling)
cd agents && arq worker.main.WorkerSettings

# 4. Frontend
cp .env.local.example .env.local   # fill in your keys
npm install --legacy-peer-deps
npm run dev                        # http://localhost:3000
```

Migrations are ordered and additive; `000_phase0.sql` through
`010_business_outcomes.sql` must be applied in filename order. They never drop
legacy tables.

## Using it

1. **Onboard** a workspace: company profile, value proposition, approved customer
   stories, disallowed claims, sender identity, daily send limit. Optionally
   ingest your website into the knowledge base.
2. **Define an ICP version**: roles, industries, size, geography, signals,
   exclusions, and per-category weights that must sum to 100. Versions are
   immutable — editing creates a new draft, activating archives the previous one.
3. **Run a campaign** against that ICP version. Discovery, evidence collection,
   signal extraction, scoring and email enrichment run in the worker; the
   campaign page polls live status.
4. **Review dossiers**: each prospect shows the evidence behind every claim and
   a per-category score breakdown, with a status of qualified / needs review /
   insufficient evidence / disqualified.
5. **Enroll qualified prospects** in a sequence. Every step produces a draft in
   the approval queue.
6. **Approve or edit** drafts. On approval the policy guard runs and the email
   sends via Gmail with an idempotency key.
7. **Triage replies** in the inbox — classified into 12 intents with confidence
   and an escalation flag. Unsubscribes suppress automatically; any reply stops
   the sequence.
8. **Meetings**: add a notetaker bot, get sales-oriented insights (objections,
   competitors, budget signals, decision criteria, action items) indexed into
   the knowledge base.

## Safety model

Sending is gated by `agents/core/policy.py`. A send is blocked unless the
message is `approved`, the recipient is not suppressed, the workspace is under
its daily cap, no duplicate exists for that `(prospect, step)`, the enrollment
is active, and the address confidence is acceptable. Booking a calendar event
with external attendees requires an explicit confirmation flag. The MeetingBaaS
webhook rejects every request when its shared secret is unconfigured.

## Evaluation

```bash
cd agents
python -m evals.runner --suite a_ranking   # deterministic scoring (no API cost)
python -m evals.runner --suite e_policy    # policy guard scenarios
python -m evals.runner --suite d_reply     # reply classification (needs OPENAI_API_KEY)
python -m evals.runner --suite c_email     # email quality: checks + LLM judge
python -m evals.runner --suite all
```

Gates: ranking and policy must pass 100% (they're deterministic); reply
classification must hit **1.0 unsubscribe recall** — a protected safety metric;
email drafts must pass every deterministic check and clear the judge threshold.
Datasets live in `agents/evals/datasets/*.jsonl` (the repo is the source of
truth; `sync_datasets.py` pushes them to Supabase). See `agents/evals/README.md`.

Business outcomes (delivery, bounce, reply, positive-reply, meetings booked,
unsubscribe rate, % approved unchanged) come from the `business_outcomes` view
and are shown on the Evals page — tracked separately from model quality, because
an aggressive email can win replies while damaging the product.

## Tracing

Set `BRAINTRUST_API_KEY` and every LLM call and graph node is traced to the
`davis-2.0` project. Durable records are also written to `agent_runs`,
`agent_steps` and `tool_calls` with prompt version, model, latency and error
class, so a run can be inspected without an external service.

Prompts are versioned YAML in `agents/prompts/` and synced to `prompt_versions`
at startup; changing a prompt means editing the file and bumping its version.

## Tests and CI

```bash
cd agents && pytest tests evals/suite_e_policy.py -q   # 46 tests
cd agents && ruff check .
npx tsc --noEmit && npm run build
```

`.github/workflows/ci.yml` runs frontend typecheck/build, backend lint/tests,
and the deterministic eval suites on every PR; LLM smoke evals run only when
prompts, services or evals change and the API keys are present.

## Deployment

- **Frontend** → Vercel. Set the `NEXT_PUBLIC_*` vars from `.env.local.example`.
- **Backend** → Railway, three services from the same `agents/Dockerfile`:
  - web: `uvicorn main:app --host 0.0.0.0 --port $PORT`
  - worker: `arq worker.main.WorkerSettings`
  - cron (optional — the worker also schedules it): `python -m jobs.poll_replies`
- Point `GOOGLE_REDIRECT_URI` at the deployed backend and register it in the
  Google Cloud OAuth client. Scopes: `gmail.send`, `gmail.readonly`,
  `calendar.events`.

## License

MIT

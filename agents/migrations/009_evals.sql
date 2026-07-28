-- 009_evals.sql — eval datasets, runs, results, human annotations.
-- These are global development assets (no workspace scoping): datasets live
-- in the repo (agents/evals/datasets/*.jsonl) and are synced here via
-- `python -m evals.sync_datasets`. human_annotations may optionally reference
-- a workspace when annotating production subjects.

create table if not exists public.datasets (
    id          uuid primary key default gen_random_uuid(),
    name        text not null unique,
    suite       text,
    description text,
    created_at  timestamptz not null default now()
);

create table if not exists public.eval_cases (
    id         uuid primary key default gen_random_uuid(),
    dataset_id uuid not null references public.datasets (id) on delete cascade,
    case_key   text not null,
    input      jsonb not null default '{}'::jsonb,
    expected   jsonb not null default '{}'::jsonb,
    labels     jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    unique (dataset_id, case_key)
);
create index if not exists idx_eval_cases_dataset on public.eval_cases (dataset_id);

create table if not exists public.eval_runs (
    id              uuid primary key default gen_random_uuid(),
    suite           text not null,
    dataset_id      uuid references public.datasets (id) on delete set null,
    started_at      timestamptz not null default now(),
    finished_at     timestamptz,
    model           text,
    prompt_versions jsonb not null default '{}'::jsonb,
    git_ref         text,
    status          text not null default 'running',  -- running | completed | failed
    summary         jsonb not null default '{}'::jsonb
);
create index if not exists idx_eval_runs_suite on public.eval_runs (suite, started_at desc);

create table if not exists public.eval_results (
    id          uuid primary key default gen_random_uuid(),
    eval_run_id uuid not null references public.eval_runs (id) on delete cascade,
    case_key    text not null,
    scores      jsonb not null default '{}'::jsonb,
    passed      boolean,
    output      jsonb,
    error       text,
    created_at  timestamptz not null default now()
);
create index if not exists idx_eval_results_run on public.eval_results (eval_run_id);

create table if not exists public.human_annotations (
    id           uuid primary key default gen_random_uuid(),
    subject_type text not null,   -- e.g. reply | email_draft | prospect_score | meeting
    subject_id   text not null,
    workspace_id uuid,            -- nullable: dataset annotations are global
    annotator    text,
    label        jsonb not null default '{}'::jsonb,
    created_at   timestamptz not null default now()
);
create index if not exists idx_human_annotations_subject
    on public.human_annotations (subject_type, subject_id);

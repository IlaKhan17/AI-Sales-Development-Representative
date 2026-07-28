-- 005_agent_ops.sql — prompt registry, model configs, run/step/tool telemetry,
-- approvals and audit logs for agent operations.

create table if not exists prompt_versions (
    id           text not null,
    version      int  not null,
    content_hash text not null,
    content      jsonb not null,
    created_at   timestamptz not null default now(),
    primary key (id, version)
);

create table if not exists model_configs (
    id          text primary key,
    model       text not null,
    temperature float,
    params      jsonb not null default '{}'::jsonb,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create table if not exists agent_runs (
    id              uuid primary key default gen_random_uuid(),
    workspace_id    uuid,
    user_id         uuid,
    graph_name      text not null,
    status          text not null default 'queued',  -- queued | running | completed | failed
    thread_id       text,
    trigger         text,                            -- api | worker | webhook | schedule
    prompt_versions jsonb not null default '{}'::jsonb,
    model           text,
    started_at      timestamptz not null default now(),
    finished_at     timestamptz,
    error           text,
    error_class     text
);
create index if not exists idx_agent_runs_workspace on agent_runs (workspace_id, started_at desc);
create index if not exists idx_agent_runs_user on agent_runs (user_id, started_at desc);

create table if not exists agent_steps (
    id             uuid primary key default gen_random_uuid(),
    run_id         uuid not null references agent_runs (id) on delete cascade,
    node           text not null,
    status         text not null default 'completed',  -- completed | failed
    input_summary  jsonb,
    output_summary jsonb,
    latency_ms     int,
    tokens_in      int,
    tokens_out     int,
    cost_usd       numeric(12, 6),
    error_class    text,
    created_at     timestamptz not null default now()
);
create index if not exists idx_agent_steps_run on agent_steps (run_id, created_at);

create table if not exists tool_calls (
    id             uuid primary key default gen_random_uuid(),
    run_id         uuid references agent_runs (id) on delete cascade,
    step_id        uuid references agent_steps (id) on delete set null,
    tool           text not null,
    args_summary   jsonb,
    result_summary jsonb,
    status         text not null default 'completed',
    latency_ms     int,
    created_at     timestamptz not null default now()
);
create index if not exists idx_tool_calls_run on tool_calls (run_id, created_at);

create table if not exists approvals (
    id           uuid primary key default gen_random_uuid(),
    workspace_id uuid,
    run_id       uuid references agent_runs (id) on delete set null,
    subject_type text not null,
    subject_id   text,
    payload      jsonb not null default '{}'::jsonb,
    status       text not null default 'pending',  -- pending | approved | rejected | expired
    requested_by uuid,
    decided_by   uuid,
    decided_at   timestamptz,
    created_at   timestamptz not null default now()
);
create index if not exists idx_approvals_workspace on approvals (workspace_id, status, created_at desc);

create table if not exists audit_logs (
    id           uuid primary key default gen_random_uuid(),
    workspace_id uuid,
    actor        text,
    action       text not null,
    subject_type text,
    subject_id   text,
    detail       jsonb not null default '{}'::jsonb,
    created_at   timestamptz not null default now()
);
create index if not exists idx_audit_logs_workspace on audit_logs (workspace_id, created_at desc);

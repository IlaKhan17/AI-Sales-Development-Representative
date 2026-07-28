-- Davis 2.0 — all migrations, concatenated in filename order.
-- Paste into the Supabase SQL editor and run once.
-- Safe to re-run: statements are guarded (IF NOT EXISTS / OR REPLACE).

begin;

-- ======================================================================
-- 000_phase0.sql
-- ======================================================================
-- Phase 0: legacy base schema + security-triage fixes.
--
-- The original project created `prospects`, `emails`, `meetings` and
-- `google_tokens` by hand in the Supabase dashboard, so they were never in a
-- migration. This file creates them when absent, which makes a FRESH database
-- work end to end, and is a no-op on the original database.
--
-- `google_tokens` is required for the Gmail/Calendar connection; the others
-- back the pre-2.0 endpoints that still ship alongside the v2 pipeline.

create extension if not exists "uuid-ossp";

-- ── Google OAuth token storage (one row per user) ───────────────────────────
create table if not exists public.google_tokens (
    user_id       uuid primary key references auth.users(id) on delete cascade,
    access_token  text,
    refresh_token text,
    token_expiry  timestamptz,
    scopes        text[],
    email         text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

-- ── Legacy prospects ────────────────────────────────────────────────────────
create table if not exists public.prospects (
    id                       uuid primary key default uuid_generate_v4(),
    user_id                  uuid references auth.users(id),
    author                   text,
    role                     text,
    company                  text,
    industry                 text,
    alignment_score          numeric default 0,
    pain_points              text[],
    solution_fit             text,
    insights                 text,
    is_prospect              boolean default true,
    status                   text default 'new',
    search_query             text,
    email                    text,
    email_confidence         text,
    source                   text,
    url                      text,
    raw_data                 jsonb,
    selection_reasoning      text,
    icp_score_breakdown      jsonb,
    disqualification_signals text[],
    created_at               timestamptz not null default now()
);

-- ── Legacy emails ───────────────────────────────────────────────────────────
create table if not exists public.emails (
    id               uuid primary key default uuid_generate_v4(),
    user_id          uuid references auth.users(id),
    prospect_id      uuid references public.prospects(id) on delete set null,
    recipient        text,
    subject          text,
    body             text,
    status           text default 'draft',
    sentiment        text,
    gmail_message_id text,
    gmail_thread_id  text,
    sent_at          timestamptz,
    replied_at       timestamptz,
    created_at       timestamptz not null default now()
);

-- ── Legacy meetings (text id, e.g. meet_20250407_152504_89f13387) ───────────
create table if not exists public.meetings (
    id           text primary key,
    user_id      uuid references auth.users(id),
    bot_id       text,
    meeting_url  text,
    title        text,
    status       text default 'active',
    date         timestamptz,
    duration     integer,
    transcript   text,
    ai_summary   text,
    action_items jsonb,
    insights     jsonb,
    created_at   timestamptz not null default now()
);

create index if not exists idx_prospects_user_id on public.prospects(user_id);
create index if not exists idx_prospects_search_query on public.prospects(search_query);
create index if not exists idx_emails_user_id on public.emails(user_id);
create index if not exists idx_meetings_user_id on public.meetings(user_id);
create index if not exists idx_meetings_bot_id on public.meetings(bot_id);

-- ── Ownership columns on pre-existing installs ──────────────────────────────
-- Guarded so this file also upgrades the original database, where these
-- tables existed without a user_id.
do $$
begin
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = 'meetings')
       and not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = 'meetings'
                         and column_name = 'user_id') then
        alter table public.meetings add column user_id uuid references auth.users(id);
    end if;

    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = 'prospects')
       and not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = 'prospects'
                         and column_name = 'user_id') then
        alter table public.prospects add column user_id uuid references auth.users(id);
    end if;
end $$;

-- ── RLS: these tables are read directly by the frontend ─────────────────────
alter table public.google_tokens enable row level security;
alter table public.prospects     enable row level security;
alter table public.emails        enable row level security;
alter table public.meetings      enable row level security;

do $$
begin
    if not exists (select 1 from pg_policies
                   where schemaname = 'public' and tablename = 'google_tokens'
                     and policyname = 'own_google_tokens') then
        create policy own_google_tokens on public.google_tokens
            using (auth.uid() = user_id) with check (auth.uid() = user_id);
    end if;

    if not exists (select 1 from pg_policies
                   where schemaname = 'public' and tablename = 'prospects'
                     and policyname = 'own_prospects') then
        create policy own_prospects on public.prospects
            using (auth.uid() = user_id or user_id is null)
            with check (auth.uid() = user_id or user_id is null);
    end if;

    if not exists (select 1 from pg_policies
                   where schemaname = 'public' and tablename = 'emails'
                     and policyname = 'own_emails') then
        create policy own_emails on public.emails
            using (auth.uid() = user_id or user_id is null)
            with check (auth.uid() = user_id or user_id is null);
    end if;

    if not exists (select 1 from pg_policies
                   where schemaname = 'public' and tablename = 'meetings'
                     and policyname = 'own_meetings') then
        create policy own_meetings on public.meetings
            using (auth.uid() = user_id or user_id is null)
            with check (auth.uid() = user_id or user_id is null);
    end if;
end $$;

-- ======================================================================
-- 001_tenancy.sql
-- ======================================================================
-- 001_tenancy.sql
-- Davis 2.0 Phase 1: organizations, users mirror, memberships, workspaces
-- Run against the Supabase Postgres database (requires auth schema).

create extension if not exists "pgcrypto";

-- ── organizations ────────────────────────────────────────────────
create table if not exists public.organizations (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    created_at  timestamptz not null default now(),
    created_by  uuid references auth.users (id) on delete set null
);

-- ── users mirror of auth.users ───────────────────────────────────
create table if not exists public.users (
    id          uuid primary key references auth.users (id) on delete cascade,
    email       text,
    full_name   text,
    created_at  timestamptz not null default now()
);

-- Trigger: mirror new auth.users rows into public.users
create or replace function public.fn_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.users (id, email, full_name)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
    )
    on conflict (id) do update
        set email = excluded.email;
    return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
    after insert on auth.users
    for each row execute function public.fn_handle_new_auth_user();

-- ── workspaces ───────────────────────────────────────────────────
create table if not exists public.workspaces (
    id               uuid primary key default gen_random_uuid(),
    organization_id  uuid not null references public.organizations (id) on delete cascade,
    name             text not null,
    created_at       timestamptz not null default now(),
    created_by       uuid references public.users (id) on delete set null
);

create index if not exists idx_workspaces_org on public.workspaces (organization_id);

-- ── memberships ──────────────────────────────────────────────────
do $$
begin
    if not exists (select 1 from pg_type where typname = 'membership_role') then
        create type public.membership_role as enum ('owner', 'admin', 'member', 'reviewer');
    end if;
end
$$;

create table if not exists public.memberships (
    id               uuid primary key default gen_random_uuid(),
    organization_id  uuid not null references public.organizations (id) on delete cascade,
    workspace_id     uuid not null references public.workspaces (id) on delete cascade,
    user_id          uuid not null references public.users (id) on delete cascade,
    role             public.membership_role not null default 'member',
    created_at       timestamptz not null default now(),
    created_by       uuid references public.users (id) on delete set null,
    unique (workspace_id, user_id)
);

create index if not exists idx_memberships_user on public.memberships (user_id);
create index if not exists idx_memberships_workspace on public.memberships (workspace_id);

-- ── helper: workspaces visible to the current auth user ──────────
-- SECURITY DEFINER so RLS policies can call it without recursive policy checks.
create or replace function public.fn_user_workspace_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
    select workspace_id
    from public.memberships
    where user_id = auth.uid();
$$;

revoke all on function public.fn_user_workspace_ids() from public;
grant execute on function public.fn_user_workspace_ids() to authenticated, service_role;

-- ======================================================================
-- 002_knowledge.sql
-- ======================================================================
-- 002_knowledge.sql
-- Davis 2.0 Phase 1: product knowledge, approved claims, ICP profiles.
-- Depends on 001_tenancy.sql.

-- ── product_profiles ─────────────────────────────────────────────
create table if not exists public.product_profiles (
    id                 uuid primary key default gen_random_uuid(),
    organization_id    uuid not null references public.organizations (id) on delete cascade,
    workspace_id       uuid not null references public.workspaces (id) on delete cascade,
    name               text not null,
    description        text,
    value_proposition  text,
    website_url        text,
    positioning        text,
    disallowed_claims  jsonb not null default '[]'::jsonb,
    created_at         timestamptz not null default now(),
    created_by         uuid references public.users (id) on delete set null
);

create index if not exists idx_product_profiles_workspace on public.product_profiles (workspace_id);

-- ── knowledge_documents ──────────────────────────────────────────
create table if not exists public.knowledge_documents (
    id                 uuid primary key default gen_random_uuid(),
    organization_id    uuid not null references public.organizations (id) on delete cascade,
    workspace_id       uuid not null references public.workspaces (id) on delete cascade,
    product_profile_id uuid references public.product_profiles (id) on delete set null,
    title              text not null,
    source_type        text not null default 'upload',   -- upload | website | manual
    source_url         text,
    status             text not null default 'pending',  -- pending | processing | ready | failed
    metadata           jsonb not null default '{}'::jsonb,
    created_at         timestamptz not null default now(),
    created_by         uuid references public.users (id) on delete set null
);

create index if not exists idx_knowledge_documents_workspace on public.knowledge_documents (workspace_id);

-- ── knowledge_chunks ─────────────────────────────────────────────
create table if not exists public.knowledge_chunks (
    id                 uuid primary key default gen_random_uuid(),
    organization_id    uuid not null references public.organizations (id) on delete cascade,
    workspace_id       uuid not null references public.workspaces (id) on delete cascade,
    document_id        uuid not null references public.knowledge_documents (id) on delete cascade,
    chunk_index        integer not null default 0,
    content            text not null,
    embedding_id       text,           -- Pinecone vector id (namespace = workspace)
    metadata           jsonb not null default '{}'::jsonb,
    created_at         timestamptz not null default now(),
    created_by         uuid references public.users (id) on delete set null,
    unique (document_id, chunk_index)
);

create index if not exists idx_knowledge_chunks_workspace on public.knowledge_chunks (workspace_id);
create index if not exists idx_knowledge_chunks_document on public.knowledge_chunks (document_id);

-- ── approved_claims ──────────────────────────────────────────────
-- The only content the outreach agent may cite.
create table if not exists public.approved_claims (
    id                 uuid primary key default gen_random_uuid(),
    organization_id    uuid not null references public.organizations (id) on delete cascade,
    workspace_id       uuid not null references public.workspaces (id) on delete cascade,
    product_profile_id uuid references public.product_profiles (id) on delete set null,
    claim              text not null,
    source_url         text,
    source_title       text,
    evidence_snippet   text,
    observed_at        timestamptz,
    confidence         numeric(4, 3),  -- 0.000–1.000
    review_status      text not null default 'approved',  -- approved | pending | rejected
    created_at         timestamptz not null default now(),
    created_by         uuid references public.users (id) on delete set null
);

create index if not exists idx_approved_claims_workspace on public.approved_claims (workspace_id);

-- ── icp_profiles ─────────────────────────────────────────────────
create table if not exists public.icp_profiles (
    id                 uuid primary key default gen_random_uuid(),
    organization_id    uuid not null references public.organizations (id) on delete cascade,
    workspace_id       uuid not null references public.workspaces (id) on delete cascade,
    name               text not null,
    active_version_id  uuid,           -- FK added below (circular with icp_versions)
    created_at         timestamptz not null default now(),
    created_by         uuid references public.users (id) on delete set null
);

create index if not exists idx_icp_profiles_workspace on public.icp_profiles (workspace_id);

-- ── icp_versions ─────────────────────────────────────────────────
create table if not exists public.icp_versions (
    id                 uuid primary key default gen_random_uuid(),
    organization_id    uuid not null references public.organizations (id) on delete cascade,
    workspace_id       uuid not null references public.workspaces (id) on delete cascade,
    icp_profile_id     uuid not null references public.icp_profiles (id) on delete cascade,
    version            integer not null default 1,
    definition         jsonb not null default '{}'::jsonb,  -- industries, sizes, geo, signals, deal_breakers…
    weights            jsonb not null default '{}'::jsonb,  -- role/industry/size/geo/signals/tech weights
    notes              text,
    created_at         timestamptz not null default now(),
    created_by         uuid references public.users (id) on delete set null,
    unique (icp_profile_id, version)
);

create index if not exists idx_icp_versions_workspace on public.icp_versions (workspace_id);

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'fk_icp_profiles_active_version'
    ) then
        alter table public.icp_profiles
            add constraint fk_icp_profiles_active_version
            foreign key (active_version_id) references public.icp_versions (id)
            on delete set null;
    end if;
end
$$;

-- ======================================================================
-- 002b_product_profile_onboarding.sql
-- ======================================================================
-- 002b_product_profile_onboarding.sql
-- Extend product_profiles with onboarding fields collected by the wizard.
-- Depends on 002_knowledge.sql.

alter table public.product_profiles
    add column if not exists target_market            text,
    add column if not exists approved_stories         jsonb not null default '[]'::jsonb,
    add column if not exists tone                     text,
    add column if not exists sender_name              text,
    add column if not exists sender_title             text,
    add column if not exists meeting_duration_minutes integer not null default 30,
    add column if not exists territory                text,
    add column if not exists daily_send_limit         integer not null default 50;

-- ======================================================================
-- 003_invites.sql
-- ======================================================================
-- 003_invites.sql
-- Workspace invites: email + role + single-use token with expiry.
-- Depends on 001_tenancy.sql.

create table if not exists public.workspace_invites (
    id               uuid primary key default gen_random_uuid(),
    organization_id  uuid not null references public.organizations (id) on delete cascade,
    workspace_id     uuid not null references public.workspaces (id) on delete cascade,
    email            text not null,
    role             public.membership_role not null default 'member',
    token            text not null unique,
    status           text not null default 'pending',  -- pending | accepted | revoked | expired
    expires_at       timestamptz not null,
    accepted_by      uuid references public.users (id) on delete set null,
    accepted_at      timestamptz,
    created_at       timestamptz not null default now(),
    created_by       uuid references public.users (id) on delete set null
);

create index if not exists idx_workspace_invites_workspace on public.workspace_invites (workspace_id);
create index if not exists idx_workspace_invites_token on public.workspace_invites (token);

-- ======================================================================
-- 004_icp_version_status.sql
-- ======================================================================
-- 004_icp_version_status.sql
-- Add lifecycle status to icp_versions (draft | active | archived).
-- Depends on 002_knowledge.sql.

alter table public.icp_versions
    add column if not exists status text not null default 'draft';

create index if not exists idx_icp_versions_profile_status
    on public.icp_versions (icp_profile_id, status);

-- ======================================================================
-- 005_agent_ops.sql
-- ======================================================================
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

-- ======================================================================
-- 006_prospecting.sql
-- ======================================================================
-- 006_prospecting.sql — campaigns + evidence-grounded prospecting pipeline (v2).
--
-- NOTE: the legacy `prospects` table is left untouched (legacy endpoints still
-- use it). The new pipeline writes to `prospects_v2`.
--
-- Design decision: no `campaign_sources` table — the `allowed_sources text[]`
-- column on campaigns is sufficient (sources are a small static enum of scraper
-- names, no per-source config or metrics needed yet). Add a table later if
-- per-source scheduling/quotas ever become a requirement.

create table if not exists public.campaigns (
    id                    uuid primary key default gen_random_uuid(),
    organization_id       uuid not null references public.organizations (id) on delete cascade,
    workspace_id          uuid not null references public.workspaces (id) on delete cascade,
    name                  text not null,
    icp_version_id        uuid not null references public.icp_versions (id),
    product_profile_id    uuid references public.product_profiles (id),
    objective             text,
    region                text,
    target_prospect_count int not null default 25,
    allowed_sources       text[] not null default '{}',
    sequence_length       int not null default 3,
    daily_cap             int,
    approval_policy       text not null default 'manual',
    status                text not null default 'draft',  -- draft | running | completed | failed | paused
    created_at            timestamptz not null default now(),
    created_by            uuid
);
create index if not exists idx_campaigns_workspace on public.campaigns (workspace_id, created_at desc);

create table if not exists public.companies (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations (id) on delete cascade,
    workspace_id    uuid not null references public.workspaces (id) on delete cascade,
    name            text not null,
    domain          text,
    size_estimate   int,
    industry        text,
    metadata        jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now()
);
create index if not exists idx_companies_workspace on public.companies (workspace_id);
create index if not exists idx_companies_ws_name on public.companies (workspace_id, name);

create table if not exists public.prospects_v2 (
    id               uuid primary key default gen_random_uuid(),
    organization_id  uuid not null references public.organizations (id) on delete cascade,
    workspace_id     uuid not null references public.workspaces (id) on delete cascade,
    campaign_id      uuid not null references public.campaigns (id) on delete cascade,
    company_id       uuid references public.companies (id) on delete set null,
    full_name        text not null,
    role_title       text,
    linkedin_url     text,
    source           text,
    source_url       text,
    -- discovered | researching | scored | needs_review | insufficient_evidence | disqualified | qualified
    status           text not null default 'discovered',
    email            text,
    email_confidence text,
    run_id           uuid,
    created_at       timestamptz not null default now(),
    created_by       uuid
);
create index if not exists idx_prospects_v2_workspace on public.prospects_v2 (workspace_id, created_at desc);
create index if not exists idx_prospects_v2_campaign on public.prospects_v2 (campaign_id, status);

create table if not exists public.prospect_evidence (
    id               uuid primary key default gen_random_uuid(),
    organization_id  uuid not null references public.organizations (id) on delete cascade,
    workspace_id     uuid not null references public.workspaces (id) on delete cascade,
    prospect_id      uuid not null references public.prospects_v2 (id) on delete cascade,
    claim            text not null,
    source_url       text,
    source_title     text,
    evidence_snippet text,
    observed_at      timestamptz not null default now(),
    confidence       numeric(4, 3),
    run_id           uuid,
    created_at       timestamptz not null default now()
);
create index if not exists idx_prospect_evidence_ws on public.prospect_evidence (workspace_id);
create index if not exists idx_prospect_evidence_prospect on public.prospect_evidence (prospect_id);

create table if not exists public.prospect_signals (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations (id) on delete cascade,
    workspace_id    uuid not null references public.workspaces (id) on delete cascade,
    prospect_id     uuid not null references public.prospects_v2 (id) on delete cascade,
    signal_type     text not null,   -- role_match | industry | company_size | geography | technology | buying_signal | pain_signal
    value           jsonb not null default '{}'::jsonb,
    confidence      numeric(4, 3),
    evidence_ids    uuid[] not null default '{}',
    run_id          uuid,
    prompt_version  text,
    model           text,
    created_at      timestamptz not null default now()
);
create index if not exists idx_prospect_signals_ws on public.prospect_signals (workspace_id);
create index if not exists idx_prospect_signals_prospect on public.prospect_signals (prospect_id);

create table if not exists public.prospect_scores (
    id                      uuid primary key default gen_random_uuid(),
    organization_id         uuid not null references public.organizations (id) on delete cascade,
    workspace_id            uuid not null references public.workspaces (id) on delete cascade,
    prospect_id             uuid not null references public.prospects_v2 (id) on delete cascade,
    icp_version_id          uuid not null references public.icp_versions (id),
    component_scores        jsonb not null default '{}'::jsonb,
    total                   numeric(6, 2),
    status                  text not null,  -- qualified | needs_review | insufficient_evidence | disqualified
    disqualification_reason text,
    scored_at               timestamptz not null default now(),
    run_id                  uuid
);
create index if not exists idx_prospect_scores_ws on public.prospect_scores (workspace_id);
create index if not exists idx_prospect_scores_prospect on public.prospect_scores (prospect_id, scored_at desc);

-- ======================================================================
-- 007_outreach.sql
-- ======================================================================
-- 007_outreach.sql — sequences, enrollments, messages, threads, replies,
-- suppression. Depends on 001 (tenancy), 005 (approvals/agent_runs), 006
-- (campaigns/prospects_v2).

create table if not exists public.sequences (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations (id) on delete cascade,
    workspace_id    uuid not null references public.workspaces (id) on delete cascade,
    campaign_id     uuid not null references public.campaigns (id) on delete cascade,
    name            text not null,
    status          text not null default 'draft',  -- draft | active | stopped
    created_at      timestamptz not null default now(),
    created_by      uuid
);
create index if not exists idx_sequences_workspace on public.sequences (workspace_id, created_at desc);
create index if not exists idx_sequences_campaign on public.sequences (campaign_id);

create table if not exists public.sequence_steps (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations (id) on delete cascade,
    workspace_id    uuid not null references public.workspaces (id) on delete cascade,
    sequence_id     uuid not null references public.sequences (id) on delete cascade,
    step_number     int not null,
    objective       text,
    delay_days      int not null default 3,
    created_at      timestamptz not null default now(),
    unique (sequence_id, step_number)
);
create index if not exists idx_sequence_steps_sequence on public.sequence_steps (sequence_id, step_number);

create table if not exists public.sequence_enrollments (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations (id) on delete cascade,
    workspace_id    uuid not null references public.workspaces (id) on delete cascade,
    sequence_id     uuid not null references public.sequences (id) on delete cascade,
    prospect_id     uuid not null references public.prospects_v2 (id) on delete cascade,
    -- active | paused | completed | stopped_reply | stopped_unsubscribe | stopped_bounce
    status          text not null default 'active',
    current_step    int not null default 0,
    next_send_at    timestamptz,
    created_at      timestamptz not null default now(),
    created_by      uuid,
    unique (sequence_id, prospect_id)
);
create index if not exists idx_enrollments_workspace on public.sequence_enrollments (workspace_id);
create index if not exists idx_enrollments_due on public.sequence_enrollments (status, next_send_at);
create index if not exists idx_enrollments_prospect on public.sequence_enrollments (prospect_id);

create table if not exists public.messages (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations (id) on delete cascade,
    workspace_id    uuid not null references public.workspaces (id) on delete cascade,
    campaign_id     uuid references public.campaigns (id) on delete set null,
    prospect_id     uuid not null references public.prospects_v2 (id) on delete cascade,
    enrollment_id   uuid references public.sequence_enrollments (id) on delete set null,
    step_number     int not null default 1,
    direction       text not null default 'outbound',  -- outbound | inbound
    to_email        text,
    subject         text,
    body            text,
    -- draft | pending_approval | approved | rejected | sent | failed | bounced
    status          text not null default 'draft',
    idempotency_key text unique,
    gmail_message_id text,
    gmail_thread_id  text,
    approval_id     uuid references public.approvals (id) on delete set null,
    run_id          uuid,
    prompt_versions jsonb not null default '{}'::jsonb,
    model           text,
    created_at      timestamptz not null default now(),
    created_by      uuid,
    sent_at         timestamptz,
    sent_by         uuid
);
create index if not exists idx_messages_workspace on public.messages (workspace_id, created_at desc);
create index if not exists idx_messages_prospect on public.messages (prospect_id, step_number);
create index if not exists idx_messages_status on public.messages (workspace_id, status);
create index if not exists idx_messages_gmail_thread on public.messages (gmail_thread_id);

create table if not exists public.email_threads (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations (id) on delete cascade,
    workspace_id    uuid not null references public.workspaces (id) on delete cascade,
    prospect_id     uuid references public.prospects_v2 (id) on delete cascade,
    gmail_thread_id text not null unique,
    last_message_at timestamptz not null default now()
);
create index if not exists idx_email_threads_workspace on public.email_threads (workspace_id);

create table if not exists public.replies (
    id                    uuid primary key default gen_random_uuid(),
    organization_id       uuid references public.organizations (id) on delete cascade,
    workspace_id          uuid references public.workspaces (id) on delete cascade,
    prospect_id           uuid references public.prospects_v2 (id) on delete set null,
    message_id            uuid references public.messages (id) on delete set null,
    gmail_message_id      text not null unique,
    from_email            text,
    subject               text,
    body                  text,
    -- interested | meeting_requested | needs_information | objection | referral |
    -- not_now | not_interested | unsubscribe | out_of_office | wrong_person |
    -- automatic | ambiguous
    intent                text,
    intent_confidence     numeric(4, 3),
    requires_human_review boolean not null default false,
    recommended_action    text,  -- reply_draft | schedule | escalate | suppress | none
    classified_at         timestamptz,
    run_id                uuid,
    created_at            timestamptz not null default now()
);
create index if not exists idx_replies_workspace on public.replies (workspace_id, created_at desc);
create index if not exists idx_replies_intent on public.replies (workspace_id, intent);

create table if not exists public.suppression_entries (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid references public.organizations (id) on delete cascade,
    workspace_id    uuid not null references public.workspaces (id) on delete cascade,
    email           text not null,
    domain          text,
    reason          text not null default 'manual',  -- manual | unsubscribe | bounce | complaint
    created_at      timestamptz not null default now(),
    created_by      uuid,
    unique (workspace_id, email)
);
create index if not exists idx_suppression_workspace on public.suppression_entries (workspace_id);

-- ======================================================================
-- 008_meetings.sql
-- ======================================================================
-- 008_meetings.sql — workspace-scoped meetings v2, transcripts, insights,
-- action items. Depends on 001 (tenancy), 006 (prospects_v2/campaigns).
-- The legacy public.meetings table is left untouched.

create table if not exists public.meetings_v2 (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations (id) on delete cascade,
    workspace_id    uuid not null references public.workspaces (id) on delete cascade,
    prospect_id     uuid references public.prospects_v2 (id) on delete set null,
    campaign_id     uuid references public.campaigns (id) on delete set null,
    bot_id          text,
    meeting_url     text not null,
    title           text not null default 'Untitled Meeting',
    status          text not null default 'active',  -- active | completed | failed
    scheduled_at    timestamptz,
    duration_minutes int,
    created_at      timestamptz not null default now(),
    created_by      uuid
);
create index if not exists idx_meetings_v2_workspace on public.meetings_v2 (workspace_id, created_at desc);
create index if not exists idx_meetings_v2_bot on public.meetings_v2 (bot_id);
create index if not exists idx_meetings_v2_prospect on public.meetings_v2 (prospect_id);

create table if not exists public.meeting_transcripts (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations (id) on delete cascade,
    workspace_id    uuid not null references public.workspaces (id) on delete cascade,
    meeting_id      uuid not null references public.meetings_v2 (id) on delete cascade,
    transcript      text,
    speakers        jsonb not null default '[]'::jsonb,
    mp4_url         text,
    created_at      timestamptz not null default now()
);
create index if not exists idx_meeting_transcripts_meeting on public.meeting_transcripts (meeting_id);

create table if not exists public.meeting_insights (
    id                uuid primary key default gen_random_uuid(),
    organization_id   uuid not null references public.organizations (id) on delete cascade,
    workspace_id      uuid not null references public.workspaces (id) on delete cascade,
    meeting_id        uuid not null unique references public.meetings_v2 (id) on delete cascade,
    summary           text,
    objections        jsonb not null default '[]'::jsonb,
    competitors       jsonb not null default '[]'::jsonb,
    budget_signals    jsonb not null default '[]'::jsonb,
    timeline          text,
    decision_criteria jsonb not null default '[]'::jsonb,
    requirements      jsonb not null default '[]'::jsonb,
    questions_asked   jsonb not null default '[]'::jsonb,
    run_id            uuid,
    prompt_version    int,
    model             text,
    created_at        timestamptz not null default now()
);
create index if not exists idx_meeting_insights_workspace on public.meeting_insights (workspace_id);

create table if not exists public.action_items (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations (id) on delete cascade,
    workspace_id    uuid not null references public.workspaces (id) on delete cascade,
    meeting_id      uuid not null references public.meetings_v2 (id) on delete cascade,
    description     text not null,
    owner           text,
    due_hint        text,
    status          text not null default 'open',  -- open | done
    created_at      timestamptz not null default now()
);
create index if not exists idx_action_items_meeting on public.action_items (meeting_id);
create index if not exists idx_action_items_workspace on public.action_items (workspace_id, status);

-- ======================================================================
-- 009_evals.sql
-- ======================================================================
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

-- ======================================================================
-- 010_business_outcomes.sql
-- ======================================================================
-- 010_business_outcomes.sql — Suite G: per-workspace business outcome view.
--
-- Notes / approximations:
--   * delivery_rate is a PROXY: (sent - bounced) / sent. We have no ESP
--     delivery webhooks, so a message counts as "delivered" unless a bounce
--     was recorded (status = 'bounced' or a suppression reason = 'bounce').
--   * pct_approved_unchanged is an APPROXIMATION: an approval counts as
--     "unchanged" when its payload carries no edit markers
--     (payload->'edits' / payload->'edited_subject' / payload->'edited_body').
--     The approvals flow stores reviewer edits under those keys; approvals
--     from older flows without edit tracking therefore count as unchanged.
--   * rates are null when the denominator is 0 (frontend renders "—").

create or replace view public.business_outcomes as
select
    w.id as workspace_id,
    coalesce(msg.sent_count, 0)                            as emails_sent,
    coalesce(msg.bounced_count, 0)                         as bounced_count,
    case when coalesce(msg.sent_count, 0) > 0
         then round((msg.sent_count - coalesce(msg.bounced_count, 0))::numeric
                    / msg.sent_count, 4) end               as delivery_rate,
    case when coalesce(msg.sent_count, 0) > 0
         then round(coalesce(msg.bounced_count, 0)::numeric
                    / msg.sent_count, 4) end               as bounce_rate,
    coalesce(rep.reply_count, 0)                           as reply_count,
    case when coalesce(msg.sent_count, 0) > 0
         then round(coalesce(rep.reply_count, 0)::numeric
                    / msg.sent_count, 4) end               as reply_rate,
    coalesce(rep.positive_count, 0)                        as positive_reply_count,
    case when coalesce(msg.sent_count, 0) > 0
         then round(coalesce(rep.positive_count, 0)::numeric
                    / msg.sent_count, 4) end               as positive_reply_rate,
    coalesce(mtg.meeting_count, 0)                         as meeting_booked_count,
    case when coalesce(msg.sent_count, 0) > 0
         then round(coalesce(rep.unsubscribe_count, 0)::numeric
                    / msg.sent_count, 4) end               as unsubscribe_rate,
    coalesce(appr.pending_count, 0)                        as approvals_pending,
    case when coalesce(appr.approved_count, 0) > 0
         then round(coalesce(appr.approved_unchanged_count, 0)::numeric
                    / appr.approved_count, 4) end          as pct_approved_unchanged
from public.workspaces w
left join lateral (
    select
        count(*) filter (where m.status in ('sent', 'bounced')) as sent_count,
        count(*) filter (where m.status = 'bounced')            as bounced_count
    from public.messages m
    where m.workspace_id = w.id and m.direction = 'outbound'
) msg on true
left join lateral (
    select
        count(*)                                                            as reply_count,
        count(*) filter (where r.intent in ('interested', 'meeting_requested')) as positive_count,
        count(*) filter (where r.intent = 'unsubscribe')                    as unsubscribe_count
    from public.replies r
    where r.workspace_id = w.id
) rep on true
left join lateral (
    select count(*) as meeting_count
    from public.meetings_v2 mv
    where mv.workspace_id = w.id
) mtg on true
left join lateral (
    select
        count(*) filter (where a.status = 'pending')  as pending_count,
        count(*) filter (where a.status = 'approved') as approved_count,
        count(*) filter (
            where a.status = 'approved'
              and not (a.payload ? 'edits')
              and not (a.payload ? 'edited_subject')
              and not (a.payload ? 'edited_body')
        ) as approved_unchanged_count
    from public.approvals a
    where a.workspace_id = w.id
) appr on true;

-- ======================================================================
-- 011_rls.sql
-- ======================================================================
-- Row-level security for every workspace-scoped table.
--
-- The backend uses the service-role key and bypasses RLS entirely — it scopes
-- by workspace_id in code. These policies exist to protect the OTHER path:
-- anything holding only the anon key (the frontend, a leaked publishable key,
-- a curious user with the browser console) can read nothing outside the
-- workspaces they are a member of.
--
-- Membership is resolved by fn_user_workspace_ids() from 001_tenancy.sql,
-- which is SECURITY DEFINER and reads memberships via auth.uid().
--
-- Applied generically so new tables are covered by re-running this file.

do $$
declare
    t text;
    -- Every table that carries a workspace_id and holds tenant data.
    targets text[] := array[
        'action_items', 'agent_runs', 'approvals', 'approved_claims',
        'audit_logs', 'campaigns', 'companies', 'email_threads',
        'icp_profiles', 'icp_versions', 'knowledge_chunks',
        'knowledge_documents', 'meeting_insights', 'meeting_transcripts',
        'meetings_v2', 'messages', 'product_profiles', 'prospect_evidence',
        'prospect_scores', 'prospect_signals', 'prospects_v2', 'replies',
        'sequence_enrollments', 'sequence_steps', 'sequences',
        'suppression_entries', 'workspace_invites'
    ];
begin
    foreach t in array targets loop
        if to_regclass('public.' || t) is null then
            raise notice 'skipping %, table not present', t;
            continue;
        end if;

        execute format('alter table public.%I enable row level security', t);

        if not exists (
            select 1 from pg_policies
            where schemaname = 'public' and tablename = t
              and policyname = 'workspace_isolation'
        ) then
            execute format($f$
                create policy workspace_isolation on public.%I
                    using (workspace_id in (select fn_user_workspace_ids()))
                    with check (workspace_id in (select fn_user_workspace_ids()))
            $f$, t);
        end if;
    end loop;
end $$;

-- ── Tables keyed by organization/user rather than workspace ─────────────────

alter table public.organizations enable row level security;
alter table public.workspaces    enable row level security;
alter table public.memberships   enable row level security;
alter table public.users         enable row level security;

do $$
begin
    -- A workspace is visible to members of that workspace.
    if not exists (select 1 from pg_policies where schemaname='public'
                   and tablename='workspaces' and policyname='member_workspaces') then
        create policy member_workspaces on public.workspaces
            using (id in (select fn_user_workspace_ids()));
    end if;

    -- An organization is visible if you belong to it.
    if not exists (select 1 from pg_policies where schemaname='public'
                   and tablename='organizations' and policyname='member_organizations') then
        create policy member_organizations on public.organizations
            using (id in (select organization_id from public.memberships
                          where user_id = auth.uid()));
    end if;

    -- You can see membership rows for organizations you belong to.
    if not exists (select 1 from pg_policies where schemaname='public'
                   and tablename='memberships' and policyname='own_org_memberships') then
        create policy own_org_memberships on public.memberships
            using (organization_id in (select organization_id from public.memberships
                                       where user_id = auth.uid()));
    end if;

    -- The users mirror: yourself, plus anyone sharing an organization.
    if not exists (select 1 from pg_policies where schemaname='public'
                   and tablename='users' and policyname='visible_users') then
        create policy visible_users on public.users
            using (
                id = auth.uid()
                or id in (
                    select m.user_id from public.memberships m
                    where m.organization_id in (
                        select organization_id from public.memberships
                        where user_id = auth.uid()
                    )
                )
            );
    end if;
end $$;

-- ── Global dev assets: readable by any signed-in user, writes via service role ──
do $$
declare t text;
begin
    foreach t in array array['datasets', 'eval_cases', 'eval_runs', 'eval_results'] loop
        if to_regclass('public.' || t) is null then continue; end if;
        execute format('alter table public.%I enable row level security', t);
        if not exists (select 1 from pg_policies where schemaname='public'
                       and tablename=t and policyname='read_all_authenticated') then
            execute format(
                'create policy read_all_authenticated on public.%I for select using (auth.uid() is not null)', t
            );
        end if;
    end loop;
end $$;

-- human_annotations may carry a nullable workspace_id (global or scoped).
do $$
begin
    if to_regclass('public.human_annotations') is not null then
        alter table public.human_annotations enable row level security;
        if not exists (select 1 from pg_policies where schemaname='public'
                       and tablename='human_annotations' and policyname='workspace_or_global') then
            create policy workspace_or_global on public.human_annotations
                using (workspace_id is null or workspace_id in (select fn_user_workspace_ids()));
        end if;
    end if;
end $$;

commit;
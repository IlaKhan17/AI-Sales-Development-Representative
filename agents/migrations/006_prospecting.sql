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

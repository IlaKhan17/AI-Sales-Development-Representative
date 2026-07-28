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

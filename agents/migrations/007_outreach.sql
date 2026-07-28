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

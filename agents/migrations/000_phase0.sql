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

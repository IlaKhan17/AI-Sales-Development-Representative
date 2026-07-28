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

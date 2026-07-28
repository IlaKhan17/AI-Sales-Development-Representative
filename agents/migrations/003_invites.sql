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

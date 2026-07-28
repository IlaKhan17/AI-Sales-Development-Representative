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

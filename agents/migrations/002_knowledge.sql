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

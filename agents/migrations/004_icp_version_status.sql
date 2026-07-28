-- 004_icp_version_status.sql
-- Add lifecycle status to icp_versions (draft | active | archived).
-- Depends on 002_knowledge.sql.

alter table public.icp_versions
    add column if not exists status text not null default 'draft';

create index if not exists idx_icp_versions_profile_status
    on public.icp_versions (icp_profile_id, status);

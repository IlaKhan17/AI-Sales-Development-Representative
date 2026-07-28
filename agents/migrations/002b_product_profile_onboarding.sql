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

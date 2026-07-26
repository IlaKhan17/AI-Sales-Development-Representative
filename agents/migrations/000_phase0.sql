-- Phase 0: minimal schema fixes required by the security triage.
-- Run against the Supabase Postgres database (SQL editor or psql).

-- 1. Meetings must be owned by a user so transcripts can be stored in a
--    per-user vector namespace and later scoped by RLS.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'meetings' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE meetings ADD COLUMN user_id UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- 2. Prospects gain an owner column (backfilled/enforced in the tenancy
--    migrations; nullable for now so existing rows keep working).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'prospects' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE prospects ADD COLUMN user_id UUID REFERENCES auth.users(id);
    END IF;
END $$;

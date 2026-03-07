-- Track last admin activity during a handoff (for 4-hour inactivity timeout)
ALTER TABLE handoffs ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

-- Backfill existing active handoffs with started_at as last activity
UPDATE handoffs SET last_activity_at = started_at WHERE last_activity_at IS NULL AND started_at IS NOT NULL;

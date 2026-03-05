-- Audit log: tracks every write/delete action with the actor who performed it
CREATE TABLE IF NOT EXISTS audit_log (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID,                     -- NULL for legacy env-var sessions
    user_nombre  TEXT,                     -- denormalized for readability
    action       TEXT NOT NULL,            -- INSERT | UPDATE | DELETE
    table_name   TEXT NOT NULL,
    record_id    UUID,
    project_id   UUID,
    details      JSONB,                    -- optional context (e.g. names, amounts)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_table_record ON audit_log (table_name, record_id);
CREATE INDEX IF NOT EXISTS audit_log_user         ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS audit_log_project      ON audit_log (project_id);
CREATE INDEX IF NOT EXISTS audit_log_created_at   ON audit_log (created_at DESC);

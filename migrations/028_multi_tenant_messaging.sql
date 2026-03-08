-- =============================================================================
-- Migration 028: Multi-tenant messaging infrastructure
-- =============================================================================
-- This migration adds three tables to support per-tenant WhatsApp/messaging:
--
--   1. tenant_channels    — Maps a WhatsApp/Meta phone number to an organization.
--                           Stores provider credentials (Twilio or Meta) and
--                           allows one tenant to operate multiple channels.
--
--   2. agent_configs      — Per-organization AI agent configuration. One row per
--                           tenant. Allows overriding the system prompt and tuning
--                           model parameters (model, max_tokens, temperature).
--
--   3. processed_messages — Idempotency table to prevent double-processing of
--                           incoming webhooks when providers retry delivery.
--                           Rows older than 48 hours can be safely deleted.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. tenant_channels
-- ----------------------------------------------------------------------------
CREATE TABLE tenant_channels (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider         TEXT        NOT NULL CHECK (provider IN ('twilio', 'meta')),
    phone_number     TEXT        NOT NULL,        -- E.164 number, e.g. +14155238886
    display_name     TEXT,                        -- optional human label
    -- Twilio credentials
    account_sid      TEXT,
    auth_token       TEXT,                        -- stored as plaintext
    -- Meta credentials
    access_token     TEXT,                        -- stored as plaintext
    phone_number_id  TEXT,                        -- Meta phone_number_id
    verify_token     TEXT,
    waba_id          TEXT,
    -- state
    activo           BOOLEAN     NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, phone_number, provider)
);

CREATE INDEX idx_tenant_channels_phone    ON tenant_channels (phone_number, provider) WHERE activo = true;
CREATE INDEX idx_tenant_channels_phone_id ON tenant_channels (phone_number_id, provider) WHERE activo = true AND phone_number_id IS NOT NULL;
CREATE INDEX idx_tenant_channels_org      ON tenant_channels (organization_id) WHERE activo = true;

-- ----------------------------------------------------------------------------
-- 2. agent_configs
-- ----------------------------------------------------------------------------
CREATE TABLE agent_configs (
    id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        UUID        NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    agent_name             TEXT        NOT NULL DEFAULT 'Asistente',
    system_prompt_override TEXT,       -- if set, replaces the base template entirely
    system_prompt_append   TEXT,       -- appended to base template (more common)
    model                  TEXT        NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
    max_tokens             INT         NOT NULL DEFAULT 800,
    temperature            FLOAT       NOT NULL DEFAULT 0.7 CHECK (temperature >= 0.0 AND temperature <= 2.0),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. processed_messages
-- ----------------------------------------------------------------------------
CREATE TABLE processed_messages (
    message_id      TEXT        NOT NULL,
    provider        TEXT        NOT NULL CHECK (provider IN ('twilio', 'meta')),
    organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, provider)
);

CREATE INDEX idx_processed_messages_cleanup ON processed_messages (processed_at);
-- Row cleanup: DELETE WHERE processed_at < NOW() - INTERVAL '48 hours'

-- =============================================================================
-- AFTER RUNNING THIS MIGRATION:
--
-- Insert your first tenant channel (replace values with actual env var values):
-- INSERT INTO tenant_channels (organization_id, provider, phone_number, account_sid, auth_token, activo)
-- SELECT id, 'twilio', '+14155238886', 'ACxxxxxxx', 'your_auth_token', true
-- FROM organizations LIMIT 1;
--
-- Insert default agent config for existing orgs:
-- INSERT INTO agent_configs (organization_id) SELECT id FROM organizations;
-- =============================================================================

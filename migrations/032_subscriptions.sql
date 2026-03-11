-- migrations/032_subscriptions.sql

CREATE TABLE subscriptions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plan                  TEXT NOT NULL CHECK (plan IN ('base', 'pro', 'studio')),
    status                TEXT NOT NULL DEFAULT 'active'
                              CHECK (status IN ('trial', 'active', 'past_due', 'suspended', 'cancelled')),
    billing_cycle         TEXT NOT NULL DEFAULT 'monthly'
                              CHECK (billing_cycle IN ('monthly', 'annual')),
    price_usd             NUMERIC(10, 2) NOT NULL,
    current_period_start  DATE NOT NULL,
    current_period_end    DATE NOT NULL,
    postventa_projects    INT NOT NULL DEFAULT 0,
    notes                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id)
);

COMMENT ON TABLE subscriptions IS 'Plan de suscripción activo por organización. Gestión manual vía panel admin.';
COMMENT ON COLUMN subscriptions.status IS 'trial|active|past_due|suspended|cancelled';
COMMENT ON COLUMN subscriptions.postventa_projects IS 'Número de proyectos en modo postventa ($199/mes cada uno)';

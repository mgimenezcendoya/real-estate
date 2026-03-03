CREATE TABLE IF NOT EXISTS reservations (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    unit_id        UUID NOT NULL REFERENCES units(id),
    lead_id        UUID REFERENCES leads(id),
    buyer_name     TEXT,
    buyer_phone    TEXT NOT NULL,
    buyer_email    TEXT,
    amount_usd     DECIMAL,
    payment_method VARCHAR(30),   -- efectivo | transferencia | cheque | financiacion
    notes          TEXT,
    signed_at      DATE,
    status         VARCHAR(20) NOT NULL DEFAULT 'active',  -- active | cancelled | converted
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Una sola reserva activa por unidad
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_unit_active
    ON reservations(unit_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_reservations_project ON reservations(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_lead    ON reservations(lead_id) WHERE lead_id IS NOT NULL;

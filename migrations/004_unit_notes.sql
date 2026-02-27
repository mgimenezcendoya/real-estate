-- Migracion incremental: tabla de notas/comentarios en unidades
-- Solo necesaria si la DB fue creada con 001 antes de este cambio.

CREATE TABLE IF NOT EXISTS unit_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID NOT NULL REFERENCES units(id),
    author_name TEXT,
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

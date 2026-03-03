-- Obra: stage tracking, structured photos, buyer link
-- Run: psql $DATABASE_URL < migrations/007_obra_etapas.sql

CREATE TABLE IF NOT EXISTS obra_etapas (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    nombre                TEXT NOT NULL,
    orden                 INT NOT NULL,
    peso_pct              DECIMAL(5,2) NOT NULL DEFAULT 0,
    es_standard           BOOLEAN DEFAULT TRUE,
    activa                BOOLEAN DEFAULT TRUE,
    porcentaje_completado INT DEFAULT 0 CHECK (porcentaje_completado BETWEEN 0 AND 100),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_obra_etapas_order  ON obra_etapas(project_id, orden);
CREATE INDEX        IF NOT EXISTS idx_obra_etapas_project ON obra_etapas(project_id);

-- Link updates to a stage + add scope metadata
ALTER TABLE obra_updates
    ADD COLUMN IF NOT EXISTS etapa_id UUID REFERENCES obra_etapas(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS scope    VARCHAR(20) DEFAULT 'general';

-- Structured photo storage per update
CREATE TABLE IF NOT EXISTS obra_fotos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    update_id       UUID REFERENCES obra_updates(id) ON DELETE CASCADE,
    file_url        TEXT NOT NULL,
    filename        TEXT NOT NULL,
    scope           VARCHAR(20) DEFAULT 'general',  -- 'general' | 'unit' | 'floor'
    unit_identifier TEXT,
    floor           INT,
    caption         TEXT,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obra_fotos_update  ON obra_fotos(update_id);
CREATE INDEX IF NOT EXISTS idx_obra_fotos_project ON obra_fotos(project_id);

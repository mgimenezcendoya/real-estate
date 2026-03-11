-- migrations/033_project_alerts_org_scope.sql
-- Permite alertas de nivel organización (sin project_id) además de las de proyecto.

-- 1. Hacer project_id nullable
ALTER TABLE project_alerts ALTER COLUMN project_id DROP NOT NULL;

-- 2. Agregar organization_id como FK opcional a organizations
ALTER TABLE project_alerts
    ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- 3. Garantizar que al menos uno de los dos esté seteado
ALTER TABLE project_alerts
    ADD CONSTRAINT project_alerts_scope_check
    CHECK (project_id IS NOT NULL OR organization_id IS NOT NULL);

-- 4. Índice para queries por org
CREATE INDEX idx_project_alerts_org ON project_alerts (organization_id)
    WHERE organization_id IS NOT NULL;

COMMENT ON COLUMN project_alerts.organization_id IS 'Alertas de nivel organización (ej: suscripción por vencer). Mutuamente excluyente con project_id en la práctica.';

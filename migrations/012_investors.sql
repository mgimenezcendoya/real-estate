CREATE TABLE investors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    email TEXT,
    telefono TEXT,
    monto_aportado_usd DECIMAL(14,2),
    fecha_aporte DATE,
    porcentaje_participacion DECIMAL(5,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE investor_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    contenido_html TEXT NOT NULL,
    periodo_desde DATE,
    periodo_hasta DATE,
    enviado_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_investors_project ON investors(project_id);
CREATE INDEX idx_investor_reports_project ON investor_reports(project_id);

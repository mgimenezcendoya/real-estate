CREATE TABLE project_budget (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    categoria TEXT NOT NULL,
    descripcion TEXT,
    monto_usd DECIMAL(14,2),
    monto_ars DECIMAL(18,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    budget_id UUID REFERENCES project_budget(id) ON DELETE SET NULL,
    proveedor TEXT,
    descripcion TEXT NOT NULL,
    monto_usd DECIMAL(14,2),
    monto_ars DECIMAL(18,2),
    fecha DATE NOT NULL,
    comprobante_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_financials_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
    tipo_cambio_usd_ars DECIMAL(10,2) NOT NULL DEFAULT 1000,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_budget_project ON project_budget(project_id);
CREATE INDEX idx_project_expenses_project ON project_expenses(project_id);
CREATE INDEX idx_project_expenses_budget ON project_expenses(budget_id);
CREATE INDEX idx_project_expenses_fecha ON project_expenses(fecha);

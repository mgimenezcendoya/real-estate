CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    cuit TEXT,
    rubro TEXT,
    telefono TEXT,
    email TEXT,
    notas TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE obra_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    etapa_id UUID REFERENCES obra_etapas(id) ON DELETE SET NULL,
    descripcion TEXT NOT NULL,
    monto_usd DECIMAL(14,2),
    monto_ars DECIMAL(18,2),
    fecha_vencimiento DATE,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    fecha_pago DATE,
    comprobante_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_obra_payments_project ON obra_payments(project_id);
CREATE INDEX idx_obra_payments_estado ON obra_payments(estado);
CREATE INDEX idx_obra_payments_vencimiento ON obra_payments(fecha_vencimiento);

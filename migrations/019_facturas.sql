-- Migration 019: Facturas (comprobantes vinculados a gastos/ingresos)

CREATE TYPE factura_tipo AS ENUM ('A', 'B', 'C', 'recibo', 'otro');
CREATE TYPE factura_categoria AS ENUM ('egreso', 'ingreso');
CREATE TYPE factura_estado AS ENUM ('cargada', 'vinculada', 'pagada');

CREATE TABLE IF NOT EXISTS facturas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id  UUID REFERENCES organizations(id),
  tipo             factura_tipo NOT NULL DEFAULT 'otro',
  numero_factura   TEXT,
  proveedor_id     UUID REFERENCES suppliers(id),
  proveedor_nombre TEXT,                -- fallback si no está en suppliers
  cuit_emisor      TEXT,
  fecha_emision    DATE NOT NULL,
  fecha_vencimiento DATE,
  monto_neto       NUMERIC(14,2),
  iva_pct          NUMERIC(5,2) DEFAULT 21,
  monto_total      NUMERIC(14,2) NOT NULL,
  moneda           payment_moneda NOT NULL DEFAULT 'ARS',
  categoria        factura_categoria NOT NULL DEFAULT 'egreso',
  file_url         TEXT,
  gasto_id         UUID REFERENCES project_expenses(id),
  estado           factura_estado NOT NULL DEFAULT 'cargada',
  notas            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facturas_project ON facturas(project_id);
CREATE INDEX IF NOT EXISTS idx_facturas_fecha ON facturas(fecha_emision);
CREATE INDEX IF NOT EXISTS idx_facturas_proveedor ON facturas(proveedor_id);

-- migrations/035_facturas_unificacion.sql
-- Expande la tabla facturas para unificar project_expenses y obra_payments

-- 1. Nuevos campos en facturas
ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS etapa_id    UUID REFERENCES obra_etapas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS budget_id   UUID REFERENCES project_budget(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monto_usd   NUMERIC(14,2);

-- 2. Migrar project_expenses → facturas
INSERT INTO facturas (
  project_id, tipo, categoria,
  proveedor_nombre,
  monto_total, monto_usd, moneda,
  fecha_emision, file_url,
  budget_id, estado, notas, created_at
)
SELECT
  pe.project_id,
  'otro',
  'egreso',
  pe.proveedor,
  COALESCE(pe.monto_ars, pe.monto_usd, 0),
  pe.monto_usd,
  CASE WHEN pe.monto_usd IS NOT NULL AND pe.monto_ars IS NULL THEN 'USD' ELSE 'ARS' END,
  pe.fecha,
  pe.comprobante_url,
  pe.budget_id,
  'cargada',
  NULL,
  pe.created_at
FROM project_expenses pe
WHERE pe.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM facturas f
    WHERE f.project_id = pe.project_id
      AND f.descripcion = pe.descripcion
      AND f.fecha_emision = pe.fecha
      AND f.created_at = pe.created_at
  );

-- 3. Migrar obra_payments → facturas
INSERT INTO facturas (
  project_id, tipo, categoria,
  proveedor_id,
  monto_total, monto_usd, moneda,
  fecha_emision, fecha_vencimiento,
  etapa_id, estado, notas, created_at
)
SELECT
  oe.project_id,
  'otro',
  'egreso',
  op.supplier_id,
  COALESCE(op.monto_ars, op.monto_usd, 0),
  op.monto_usd,
  CASE WHEN op.monto_usd IS NOT NULL AND op.monto_ars IS NULL THEN 'USD' ELSE 'ARS' END,
  COALESCE(op.fecha_vencimiento, op.created_at::date),
  op.fecha_vencimiento,
  op.etapa_id,
  CASE op.estado
    WHEN 'pendiente' THEN 'cargada'
    WHEN 'aprobado'  THEN 'aprobada'
    WHEN 'pagado'    THEN 'pagada'
    ELSE 'cargada'
  END,
  op.created_at
FROM obra_payments op
JOIN obra_etapas oe ON oe.id = op.etapa_id
WHERE NOT EXISTS (
  SELECT 1 FROM facturas f
  WHERE f.descripcion = op.descripcion
    AND f.etapa_id = op.etapa_id
    AND f.created_at = op.created_at
);

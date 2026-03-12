# Diseño: Unificación de Gastos, Facturas y Pagos de Obra

**Fecha:** 2026-03-12
**Branch:** feat/mg/gastos
**Estado:** Aprobado

---

## Contexto

Actualmente existen 3 puntos de entrada para registrar egresos en el sistema:

| Formulario | Ubicación | Tabla BD | Campos clave |
|---|---|---|---|
| Nuevo gasto | /financiero → Resumen | `project_expenses` | descripcion, proveedor libre, USD/ARS, comprobante_url |
| Nueva factura | /financiero → Facturas | `facturas` | tipo, numero, IVA, PDF, estado, payment_record |
| Nuevo pago de obra | /obra → Pagos | `obra_payments` | etapa_id, supplier_id, monto USD/ARS, estado propio |

Esto genera confusión de UX (3 formularios distintos para conceptos similares) y fragmenta los datos en 3 tablas que el dashboard tiene que reunir con UNIONs.

---

## Decisión

**Opción A — Expandir `facturas` como modelo unificado.**

Todas las entradas de egreso/ingreso pasan por el módulo de facturas. Las tablas `project_expenses` y `obra_payments` se deprecan. El formulario es único y progresivo.

---

## Modelo de datos

### Campos nuevos en `facturas`

```sql
ALTER TABLE facturas
  ADD COLUMN etapa_id    UUID REFERENCES obra_etapas(id) ON DELETE SET NULL,
  ADD COLUMN budget_id   UUID REFERENCES project_budget(id) ON DELETE SET NULL,
  ADD COLUMN supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  ADD COLUMN monto_usd   NUMERIC(12, 2);
```

`proveedor_nombre` y `cuit_emisor` se mantienen para proveedores sin entrada en `suppliers`.

### Estado machine unificado

| Estado | Significado |
|---|---|
| `cargada` | Registrada, sin procesar (ex-`pendiente` en obra) |
| `aprobada` | Aprobada para pago (ex-`aprobado` en obra) |
| `pagada` | Pago efectuado |
| `vinculada` | Ingreso vinculado a un payment_record (solo categoria=ingreso) |
| `vencida` | Computado: `fecha_vencimiento < hoy AND estado != 'pagada'` |

### Migración de datos

```sql
-- project_expenses → facturas
INSERT INTO facturas (project_id, tipo, categoria, proveedor_nombre, descripcion,
                      monto_total, moneda, fecha_emision, file_url, budget_id, estado)
SELECT project_id, 'otro', 'egreso', proveedor, descripcion,
       COALESCE(monto_usd, monto_ars, 0),
       CASE WHEN monto_usd IS NOT NULL THEN 'USD' ELSE 'ARS' END,
       fecha, comprobante_url, budget_id, 'cargada'
FROM project_expenses;

-- obra_payments → facturas
INSERT INTO facturas (project_id, tipo, categoria, supplier_id, descripcion,
                      monto_total, monto_usd, moneda, fecha_emision, fecha_vencimiento,
                      etapa_id, estado)
SELECT project_id, 'otro', 'egreso', supplier_id, descripcion,
       COALESCE(monto_ars, monto_usd, 0),
       monto_usd,
       CASE WHEN monto_usd IS NOT NULL AND monto_ars IS NULL THEN 'USD' ELSE 'ARS' END,
       COALESCE(fecha_vencimiento, created_at::date), fecha_vencimiento,
       etapa_id,
       CASE estado
         WHEN 'pendiente' THEN 'cargada'
         WHEN 'aprobado'  THEN 'aprobada'
         WHEN 'pagado'    THEN 'pagada'
         ELSE 'cargada'
       END
FROM obra_payments;
```

Las tablas originales quedan como **readonly** (sin endpoints de escritura) hasta validar la migración, luego se eliminan.

---

## Formulario unificado `FacturaModal`

Componente React reutilizable en `frontend/src/components/FacturaModal.tsx`.

### Props

```typescript
interface FacturaModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  projectId: string;
  editingFactura?: Factura | null;
  // Pre-filtrado desde /obra:
  prefilledEtapaId?: string;
  prefilledEtapaNombre?: string;
}
```

### Campos del formulario (agrupados)

**Bloque 1 — Comprobante** (todos opcionales excepto Categoría)
- Tipo: A / B / C / Recibo / **Otro** (default)
- Número (ej. 0001-00012345)
- Categoría: **Egreso** (default) / Ingreso

**Bloque 2 — Proveedor**
- Proveedor: dropdown `suppliers` + opción texto libre
- CUIT emisor: texto libre

**Bloque 3 — Importe**
- Moneda: **ARS** (default) / USD
- Total **(requerido)**
- IVA %: default 21 → calcula `monto_neto = total / (1 + iva/100)` automáticamente
- Monto neto: calculado, editable para override
- Monto USD: campo adicional para equivalente en dólares

**Bloque 4 — Clasificación**
- Categoría presupuesto: dropdown `budget_id` (categorías del proyecto)
- Etapa de obra: dropdown `etapa_id` (etapas activas del proyecto, pre-llenado desde /obra)

**Bloque 5 — Fechas y documentación**
- Fecha emisión **(requerida)**
- Fecha vencimiento (opcional)
- PDF: upload a S3 (igual que ahora)
- Notas: texto libre

**Bloque 6 — Vinculación** (solo si Categoría = Ingreso)
- Vincular a pago registrado: combobox con `min-w-[320px]` y `max-h-48` (fix del bug de dropdown chico)

### Validación mínima

Solo `monto_total` y `fecha_emision` son requeridos para guardar. Todo lo demás es opcional.

---

## Cambios de UI por pantalla

### /financiero → tab "Facturas"
- Botón cambia de "Nueva factura" a **"+ Agregar"**
- Lista muestra todas las entradas (ex-gastos, ex-pagos de obra, facturas formales)
- Badge visual distingue origen: `Factura` / `Gasto` / `Obra` según campos presentes

### /financiero → tab "Resumen"
- Se elimina botón "Nuevo gasto" y modal de gasto
- KPIs y lista de gastos pasan a ser read-only (link al tab Facturas)
- Query consolidada: solo `facturas WHERE categoria='egreso'`

### /obra → tab "Pagos"
- Se elimina modal "Nuevo pago de obra"
- Botón **"+ Agregar gasto de obra"** abre `FacturaModal` con `prefilledEtapaId`
- Lista de pagos filtra `facturas WHERE etapa_id IS NOT NULL AND project_id = ?`

### /financiero → tab "Flujo de Caja"
- Query de egresos simplificada: solo `facturas WHERE categoria='egreso'`
- Eliminar union con `project_expenses` y `obra_payments`

---

## Cambios de API (backend)

### Endpoints a modificar

- `GET /admin/facturas/{project_id}` — agregar JOINs a `obra_etapas`, `suppliers`, `project_budget`
- `POST /admin/facturas/{project_id}` — aceptar `etapa_id`, `budget_id`, `supplier_id`, `monto_usd`
- `PATCH /admin/facturas/{factura_id}` — mismos campos nuevos
- `GET /admin/cash-flow/{project_id}` — reemplazar union con query directa a `facturas`
- `GET /admin/financials/{project_id}/summary` — reemplazar query a `project_expenses`

### Endpoints a deprecar (tras migración validada)

- `POST /admin/financials/{project_id}/expenses`
- `PATCH /admin/financials/{project_id}/expenses/{id}`
- `DELETE /admin/financials/{project_id}/expenses/{id}`
- `POST /admin/obra-payments/{project_id}`
- `PATCH /admin/obra-payments/{id}`

### Migration SQL

Nueva migración `029_facturas_unificacion.sql`:
1. ALTER TABLE facturas (campos nuevos)
2. INSERT desde project_expenses
3. INSERT desde obra_payments

---

## Fix incluido: dropdown búsqueda comprador

El combobox de `payment_record_id` (bloque 6) pasa de su tamaño actual a:

```tsx
<div className="max-h-48 overflow-y-auto min-w-[320px] ...">
```

---

## Fuera de scope (este sprint)

- Módulo de proveedores (suppliers CRUD) — ya está pendiente por separado
- Eliminación física de tablas `project_expenses` y `obra_payments` — post-validación
- Reportes de inversores (no se ven afectados)

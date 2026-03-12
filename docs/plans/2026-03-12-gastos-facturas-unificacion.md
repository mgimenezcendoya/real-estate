# Unificación Gastos/Facturas/Obra-Payments — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidar `project_expenses`, `obra_payments` y `facturas` en una sola tabla `facturas` con un formulario unificado `FacturaModal`, accesible desde /financiero (canónico) y desde /obra (pre-filtrado por etapa).

**Architecture:** Expandir la tabla `facturas` con los campos faltantes, migrar los datos existentes, actualizar todos los endpoints que hoy leen de múltiples tablas, y reemplazar los 3 modales independientes por un componente `FacturaModal` reutilizable.

**Tech Stack:** FastAPI (asyncpg), PostgreSQL, Next.js 15, React 19, TypeScript, Tailwind 4, shadcn/ui

---

## Task 1: Migración SQL 035 — Expandir facturas y migrar datos

**Files:**
- Create: `migrations/035_facturas_unificacion.sql`

**Step 1: Crear el archivo de migración**

```sql
-- migrations/035_facturas_unificacion.sql

-- 1. Nuevos campos en facturas
ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS etapa_id    UUID REFERENCES obra_etapas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS budget_id   UUID REFERENCES project_budget(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monto_usd   NUMERIC(14,2);

-- 2. Agregar estado 'aprobada' al check constraint si existe (safe: texto libre)
-- No hay enum, es TEXT, no requiere cambio.

-- 3. Migrar project_expenses → facturas
INSERT INTO facturas (
  project_id, tipo, categoria,
  proveedor_nombre, descripcion,
  monto_total, monto_usd, moneda,
  fecha_emision, file_url,
  budget_id, estado, notas, created_at
)
SELECT
  pe.project_id,
  'otro',
  'egreso',
  pe.proveedor,
  pe.descripcion,
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

-- 4. Migrar obra_payments → facturas
INSERT INTO facturas (
  project_id, tipo, categoria,
  proveedor_id, descripcion,
  monto_total, monto_usd, moneda,
  fecha_emision, fecha_vencimiento,
  etapa_id, estado, created_at
)
SELECT
  oe.project_id,
  'otro',
  'egreso',
  op.supplier_id,
  op.descripcion,
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
```

**Step 2: Aplicar la migración en Neon**

Ejecutar el SQL directamente en Neon (dashboard o psql). Verificar que no haya errores.

```sql
-- Verificar conteos post-migración
SELECT COUNT(*) FROM project_expenses WHERE deleted_at IS NULL;  -- N filas
SELECT COUNT(*) FROM obra_payments;                               -- M filas
SELECT COUNT(*) FROM facturas WHERE deleted_at IS NULL;           -- debe incluir N+M nuevas
```

**Step 3: Commit**

```bash
git add migrations/035_facturas_unificacion.sql
git commit -m "feat: migration 035 - expand facturas table and migrate expenses/obra-payments"
```

---

## Task 2: Backend — Actualizar FacturaBody y endpoints POST/PATCH

**Files:**
- Modify: `app/admin/routers/facturas.py`

**Step 1: Actualizar `FacturaBody` para aceptar campos nuevos**

En `FacturaBody`, agregar después de `payment_record_id`:

```python
# Campos unificados (antes en project_expenses / obra_payments)
etapa_id: Optional[str] = None
budget_id: Optional[str] = None
supplier_id: Optional[str] = None   # alias de proveedor_id en BD
monto_usd: Optional[float] = None   # equivalente USD cuando moneda=ARS
```

Eliminar los campos de auto-creación de gasto (ya no necesarios):
```python
# ELIMINAR estas 3 líneas:
crear_gasto: bool = False
gasto_descripcion: Optional[str] = None
gasto_budget_id: Optional[str] = None
```

**Step 2: Actualizar `PatchFacturaBody`**

Agregar los mismos 4 campos opcionales:
```python
etapa_id: Optional[str] = None
budget_id: Optional[str] = None
supplier_id: Optional[str] = None
monto_usd: Optional[float] = None
```

**Step 3: Actualizar `create_factura` — reemplazar la lógica de `crear_gasto`**

Reemplazar el bloque completo dentro del `async with conn.transaction()`:

```python
async with pool.acquire() as conn:
    async with conn.transaction():
        payment_record_id = body.payment_record_id or None
        row = await conn.fetchrow(
            """INSERT INTO facturas
               (project_id, tipo, numero_factura, proveedor_nombre, proveedor_id, cuit_emisor,
                fecha_emision, fecha_vencimiento, monto_neto, iva_pct, monto_total, monto_usd,
                moneda, categoria, file_url, payment_record_id, estado, notas,
                etapa_id, budget_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
               RETURNING id""",
            project_id, body.tipo, body.numero_factura, body.proveedor_nombre,
            body.supplier_id or None,
            body.cuit_emisor,
            datetime.strptime(body.fecha_emision, "%Y-%m-%d").date(),
            datetime.strptime(body.fecha_vencimiento, "%Y-%m-%d").date() if body.fecha_vencimiento else None,
            body.monto_neto, body.iva_pct, body.monto_total, body.monto_usd,
            body.moneda, body.categoria, body.file_url,
            payment_record_id, body.estado, body.notas,
            body.etapa_id or None, body.budget_id or None,
        )
        estado_final = "vinculada" if payment_record_id else body.estado
        if payment_record_id:
            await conn.execute(
                "UPDATE facturas SET estado=$1 WHERE id=$2", estado_final, row["id"]
            )
```

Actualizar el `return` al final:
```python
return {"factura_id": str(row["id"])}
```

**Step 4: Actualizar `patch_factura`**

El PATCH usa `model_dump()` dinámico, solo necesita mapear `supplier_id` a `proveedor_id` en BD:

```python
updates = {k: v for k, v in body.model_dump().items() if v is not None}
# Renombrar supplier_id → proveedor_id para la BD
if "supplier_id" in updates:
    updates["proveedor_id"] = updates.pop("supplier_id")
```

**Step 5: Verificar manualmente**

```bash
# Crear una factura con los nuevos campos
curl -X POST http://localhost:8000/admin/facturas/{project_id} \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fecha_emision":"2026-03-12","monto_total":1000,"moneda":"ARS","etapa_id":"...","budget_id":"..."}'
```

**Step 6: Commit**

```bash
git add app/admin/routers/facturas.py
git commit -m "feat: facturas API accepts etapa_id, budget_id, supplier_id, monto_usd"
```

---

## Task 3: Backend — Actualizar GET /facturas con nuevos JOINs

**Files:**
- Modify: `app/admin/routers/facturas.py` (función `list_facturas`)

**Step 1: Actualizar la query SELECT en `list_facturas`**

Reemplazar el `pool.fetch(...)` actual por:

```python
rows = await pool.fetch(
    f"""SELECT f.*,
               s.nombre AS proveedor_supplier,
               oe.nombre AS etapa_nombre,
               pb.categoria AS budget_categoria,
               r.buyer_name AS linked_buyer_name,
               pi.numero_cuota AS linked_cuota,
               pr.monto_pagado AS linked_monto,
               pr.moneda AS linked_moneda,
               pr.fecha_pago AS linked_fecha_pago
        FROM facturas f
        LEFT JOIN suppliers s ON s.id = f.proveedor_id
        LEFT JOIN obra_etapas oe ON oe.id = f.etapa_id
        LEFT JOIN project_budget pb ON pb.id = f.budget_id
        LEFT JOIN payment_records pr ON pr.id = f.payment_record_id
        LEFT JOIN payment_installments pi ON pi.id = pr.installment_id
        LEFT JOIN payment_plans pp ON pp.id = pi.plan_id
        LEFT JOIN reservations r ON r.id = pp.reservation_id
        WHERE {where}
        ORDER BY f.fecha_emision DESC""",
    *params,
)
```

**Step 2: Verificar que `etapa_nombre` y `budget_categoria` aparecen en la respuesta**

```bash
curl http://localhost:8000/admin/facturas/{project_id} -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | grep -E "etapa_nombre|budget_categoria"
```

**Step 3: Commit**

```bash
git add app/admin/routers/facturas.py
git commit -m "feat: GET facturas includes etapa_nombre and budget_categoria via JOINs"
```

---

## Task 4: Backend — Actualizar cash-flow y financial summary

**Files:**
- Modify: `app/admin/routers/financials.py`

**Step 1: Actualizar `get_cash_flow` — reemplazar queries a `project_expenses` y `obra_payments`**

Reemplazar las dos queries separadas (gastos_rows y obra_rows, líneas ~80-108) por una sola:

```python
# Egresos unificados desde facturas
egresos_rows = await pool.fetch(
    """SELECT
         to_char(f.fecha_emision, 'YYYY-MM') AS mes,
         SUM(CASE
           WHEN f.moneda = 'USD' THEN f.monto_total
           WHEN f.monto_usd IS NOT NULL THEN f.monto_usd
           ELSE f.monto_total / COALESCE(fc.tipo_cambio_usd_ars, 1)
         END) AS total
       FROM facturas f
       LEFT JOIN project_financials_config fc ON fc.project_id = f.project_id
       WHERE f.project_id = $1
         AND f.categoria = 'egreso'
         AND f.deleted_at IS NULL
         AND ($2::text IS NULL OR to_char(f.fecha_emision, 'YYYY-MM') >= $2)
         AND ($3::text IS NULL OR to_char(f.fecha_emision, 'YYYY-MM') <= $3)
       GROUP BY mes
       ORDER BY mes""",
    project_id, desde, hasta,
)
```

Actualizar el loop de merge (reemplazar los dos `for r in gastos_rows` / `for r in obra_rows` por uno):

```python
for r in egresos_rows:
    mes = r["mes"]
    meses.setdefault(mes, {"mes": mes, "ingresos": 0.0, "egresos": 0.0, "proyeccion": 0.0})
    meses[mes]["egresos"] += float(r["total"] or 0)
```

**Step 2: Actualizar `get_cash_flow_consolidated`**

Aplicar el mismo reemplazo en el endpoint consolidado (líneas ~200-220 del mismo archivo).

**Step 3: Actualizar `get_financial_summary` — reemplazar queries a `project_expenses` y `obra_payments`**

Cerca de la línea 447, reemplazar `expenses_rows` y `obra_payments_rows` por:

```python
expenses_rows = await pool.fetch(
    """SELECT
         CASE
           WHEN f.moneda = 'USD' THEN f.monto_total
           WHEN f.monto_usd IS NOT NULL THEN f.monto_usd
           ELSE f.monto_total / NULLIF($2, 0)
         END AS monto_usd,
         pb.categoria
       FROM facturas f
       LEFT JOIN project_budget pb ON pb.id = f.budget_id
       WHERE f.project_id = $1
         AND f.categoria = 'egreso'
         AND f.deleted_at IS NULL""",
    project_id, tipo_cambio,
)
```

Eliminar `obra_payments_rows` y la variable `ejecutado_obra`. Actualizar:
```python
ejecutado_total = sum(float(r["monto_usd"] or 0) for r in expenses_rows)
```

Actualizar el loop `por_categoria` para usar solo `expenses_rows`.

**Step 4: Actualizar `list_expenses` — redirigir a facturas**

Reemplazar la función completa `list_expenses` (que hoy hace UNION de project_expenses + obra_payments) para que lea de `facturas`:

```python
@router.get("/financials/{project_id}/expenses")
async def list_expenses(
    project_id: str,
    categoria: Optional[str] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    if not credentials:
        raise HTTPException(status_code=401, detail="No autorizado")
    verify_token(credentials.credentials)
    pool = await get_pool()
    conditions = ["f.project_id = $1", "f.categoria = 'egreso'", "f.deleted_at IS NULL"]
    params: list = [project_id]
    i = 2
    if categoria and categoria != OBRA_CATEGORIA:
        conditions.append(f"pb.categoria = ${i}"); params.append(categoria); i += 1
    elif categoria == OBRA_CATEGORIA:
        conditions.append("f.etapa_id IS NOT NULL")
    if fecha_desde:
        conditions.append(f"f.fecha_emision >= ${i}")
        params.append(datetime.strptime(fecha_desde, "%Y-%m-%d").date()); i += 1
    if fecha_hasta:
        conditions.append(f"f.fecha_emision <= ${i}")
        params.append(datetime.strptime(fecha_hasta, "%Y-%m-%d").date()); i += 1
    where = " AND ".join(conditions)
    rows = await pool.fetch(
        f"""SELECT f.id::text, f.budget_id, f.proveedor_nombre AS proveedor,
                   f.descripcion, f.monto_usd, f.monto_total AS monto_ars,
                   f.fecha_emision AS fecha, f.file_url AS comprobante_url,
                   f.created_at, pb.categoria,
                   CASE WHEN f.etapa_id IS NOT NULL THEN 'obra' ELSE 'expense' END AS source,
                   oe.nombre AS etapa_nombre
            FROM facturas f
            LEFT JOIN project_budget pb ON pb.id = f.budget_id
            LEFT JOIN obra_etapas oe ON oe.id = f.etapa_id
            WHERE {where}
            ORDER BY f.fecha_emision DESC""",
        *params,
    )
    result = []
    for r in rows:
        d = dict(r)
        if d.get("monto_usd") is not None:
            d["monto_usd"] = float(d["monto_usd"])
        if d.get("monto_ars") is not None:
            d["monto_ars"] = float(d["monto_ars"])
        result.append(d)
    return result
```

**Step 5: Verificar cash-flow y summary**

```bash
curl "http://localhost:8000/admin/cash-flow/{project_id}" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
curl "http://localhost:8000/admin/financials/{project_id}/summary" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

**Step 6: Commit**

```bash
git add app/admin/routers/financials.py
git commit -m "feat: cash-flow and financial summary now read from unified facturas table"
```

---

## Task 5: Frontend — Actualizar interfaces TypeScript en api.ts

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Step 1: Actualizar la interfaz `Factura`**

Localizar `interface Factura` y agregar los campos nuevos:

```typescript
// Campos unificados
etapa_id: string | null;
etapa_nombre: string | null;
budget_id: string | null;
budget_categoria: string | null;
supplier_id: string | null;
monto_usd: number | null;
```

**Step 2: Actualizar `createFactura` y `patchFactura` para aceptar campos nuevos**

Localizar la función `createFactura` (y su tipo de body inline o FacturaInput). Agregar:

```typescript
etapa_id?: string | null;
budget_id?: string | null;
supplier_id?: string | null;
monto_usd?: number | null;
// Eliminar o dejar como opcional:
// crear_gasto?: boolean;
// gasto_descripcion?: string | null;
// gasto_budget_id?: string | null;
```

**Step 3: Agregar función `getObraEtapas` si no existe**

Buscar con `grep -n "getObraEtapas\|obra_etapas\|ObraEtapa" frontend/src/lib/api.ts`.

Si no existe, agregar después de las otras funciones de obra:
```typescript
getObraEtapas: (projectId: string) =>
  fetcher<ObraEtapa[]>(`/admin/obra/${projectId}`).then(data => data.etapas ?? []),
```

> Nota: La página `/obra` ya carga etapas — verificar cómo las obtiene y reutilizar ese endpoint.

**Step 4: Verificar que TypeScript compila**

```bash
cd frontend && npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: update Factura interface with etapa_id, budget_id, monto_usd fields"
```

---

## Task 6: Frontend — Crear componente FacturaModal.tsx

**Files:**
- Create: `frontend/src/components/FacturaModal.tsx`

**Step 1: Crear el componente**

El componente recibe estas props:

```typescript
interface FacturaModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  projectId: string;
  editingFactura?: Factura | null;
  prefilledEtapaId?: string;
  prefilledEtapaNombre?: string;
}
```

Estado interno del formulario (FACTURA_EMPTY):

```typescript
const FACTURA_EMPTY = {
  tipo: 'otro' as string,
  numero_factura: '',
  categoria: 'egreso' as string,
  proveedor_nombre: '',
  supplier_id: null as string | null,
  cuit_emisor: '',
  moneda: 'ARS' as string,
  monto_total: '' as string | number,
  iva_pct: 21 as number,
  monto_neto: '' as string | number,
  monto_usd: '' as string | number,
  budget_id: null as string | null,
  etapa_id: null as string | null,
  fecha_emision: new Date().toISOString().split('T')[0],
  fecha_vencimiento: '',
  file_url: null as string | null,
  notas: '',
  estado: 'cargada' as string,
  payment_record_id: null as string | null,
};
```

Lógica clave del formulario:

```typescript
// Calcular monto_neto automáticamente
useEffect(() => {
  const total = parseFloat(String(form.monto_total));
  const iva = parseFloat(String(form.iva_pct));
  if (!isNaN(total) && !isNaN(iva) && iva >= 0) {
    const neto = total / (1 + iva / 100);
    setForm(f => ({ ...f, monto_neto: Math.round(neto * 100) / 100 }));
  }
}, [form.monto_total, form.iva_pct]);

// Cargar etapas y categorías presupuestarias al montar
useEffect(() => {
  if (!open) return;
  // fetch etapas del proyecto
  api.getObraData(projectId).then(data => setEtapas(data.etapas ?? []));
  // fetch budget categories
  api.getBudgetItems(projectId).then(setBudgetItems);
}, [open, projectId]);

// Pre-llenar etapa si viene desde /obra
useEffect(() => {
  if (prefilledEtapaId) {
    setForm(f => ({ ...f, etapa_id: prefilledEtapaId }));
  }
}, [prefilledEtapaId]);
```

El modal usa `Dialog` de shadcn/ui con los 6 bloques de campos descritos en el diseño. Ver el formulario actual de factura en `financiero/page.tsx` para reusar el mismo CSS, layout y lógica de upload de PDF.

Estructura JSX del modal:

```tsx
<Dialog open={open} onOpenChange={v => !v && onClose()}>
  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle>{editingFactura ? 'Editar entrada' : 'Nueva entrada'}</DialogTitle>
    </DialogHeader>
    <div className="space-y-5 py-2">
      {/* Bloque 1: Comprobante */}
      {/* Bloque 2: Proveedor */}
      {/* Bloque 3: Importe (con cálculo IVA automático) */}
      {/* Bloque 4: Clasificación (budget_id + etapa_id) */}
      {/* Bloque 5: Fechas y documentación */}
      {/* Bloque 6: Vinculación (solo si categoria=ingreso) */}
    </div>
    <DialogFooter>
      <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      <Button onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        {editingFactura ? 'Guardar cambios' : 'Crear entrada'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Fix del dropdown de búsqueda de comprador** (Bloque 6):

```tsx
{/* Reemplazar el contenedor del dropdown de linkable payments */}
<div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg
                max-h-48 overflow-y-auto min-w-[320px]">
```

**Step 2: Verificar que el componente no tiene errores TS**

```bash
cd frontend && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add frontend/src/components/FacturaModal.tsx
git commit -m "feat: add unified FacturaModal component with all 6 field blocks"
```

---

## Task 7: Frontend — Actualizar /financiero page

**Files:**
- Modify: `frontend/src/app/proyectos/[id]/financiero/page.tsx`

**Step 1: Eliminar estado y lógica del "Nuevo gasto"**

Buscar y eliminar:
- `const EXPENSE_EMPTY = ...`
- `const [showModal, setShowModal] = useState(false)` (el de gastos)
- `const [editingExpense, setEditingExpense] = useState<Expense | null>(null)`
- `const [form, setForm] = useState<typeof EXPENSE_EMPTY>(EXPENSE_EMPTY)`
- `const [saving, setSaving] = useState(false)` (el de gastos)
- Las funciones `handleSaveExpense` / `handleDeleteExpense`
- El JSX del modal "Nuevo gasto" completo

**Step 2: Reemplazar el modal de factura inline por `FacturaModal`**

Eliminar todo el estado local de factura y el JSX del modal inline:
- `const FACTURA_EMPTY = ...`
- `const [showFacturaModal, ...]`
- `const [editingFactura, ...]`
- `const [facturaForm, ...]`
- `const [savingFactura, ...]`
- `const [uploadingPdf, ...]`
- `const [linkablePayments, ...]`
- `const [paymentSearch, ...]`
- El JSX del Dialog de "Nueva factura"

Agregar en su lugar:

```tsx
import FacturaModal from '@/components/FacturaModal';

// En el componente:
const [showFacturaModal, setShowFacturaModal] = useState(false);
const [editingFactura, setEditingFactura] = useState<Factura | null>(null);
```

Insertar el componente en el JSX:

```tsx
<FacturaModal
  open={showFacturaModal}
  onClose={() => { setShowFacturaModal(false); setEditingFactura(null); }}
  onSuccess={() => { loadFacturas(); setShowFacturaModal(false); setEditingFactura(null); }}
  projectId={id}
  editingFactura={editingFactura}
/>
```

**Step 3: Actualizar el tab "Resumen"**

- Eliminar el botón "+ Nuevo gasto" del tab Resumen
- Agregar un link/botón secundario: `→ Ver en Facturas` que cambie al tab de facturas
- La lista de gastos en Resumen ya usa `api.getExpenses()` que ahora lee de facturas (Task 4)

**Step 4: Actualizar el tab "Facturas"**

- Cambiar el botón de `"Nueva factura"` a `"+ Agregar"`
- Agregar columna "Etapa" y "Cat. Presupuesto" a la tabla de facturas donde corresponda
- El badge de origen: si `etapa_id != null` → badge "Obra"; si `numero_factura != null` → badge "Factura"; else → badge "Gasto"

**Step 5: Verificar compilación y funcionamiento manual**

```bash
cd frontend && npx tsc --noEmit
# Levantar dev server y verificar que el tab Facturas carga y permite crear
npm run dev
```

**Step 6: Commit**

```bash
git add frontend/src/app/proyectos/[id]/financiero/page.tsx
git commit -m "feat: /financiero uses unified FacturaModal, removes separate gasto form"
```

---

## Task 8: Frontend — Actualizar /obra page (tab Pagos)

**Files:**
- Modify: `frontend/src/app/proyectos/[id]/obra/page.tsx`

**Step 1: Eliminar el modal "Nuevo pago de obra"**

Buscar y eliminar:
- `const PAYMENT_EMPTY = ...`
- `const [showModal, setShowModal] = useState(false)` (el de pagos de obra)
- `const [form, setForm] = useState<typeof PAYMENT_EMPTY>(PAYMENT_EMPTY)`
- Las funciones `handleSavePayment`
- El JSX del Dialog "Nuevo pago de obra"

**Step 2: Agregar `FacturaModal` con pre-fill de etapa**

Importar el componente y agregar estado:

```tsx
import FacturaModal from '@/components/FacturaModal';

// Dentro del componente PaymentsTab (o donde esté la lógica de pagos):
const [showFacturaModal, setShowFacturaModal] = useState(false);
const [selectedEtapa, setSelectedEtapa] = useState<{ id: string; nombre: string } | null>(null);
```

Reemplazar el botón "Nuevo pago" por:

```tsx
<Button
  size="sm"
  onClick={() => { setSelectedEtapa(null); setShowFacturaModal(true); }}
>
  <Plus className="w-4 h-4 mr-1" /> Agregar gasto de obra
</Button>

<FacturaModal
  open={showFacturaModal}
  onClose={() => { setShowFacturaModal(false); setSelectedEtapa(null); }}
  onSuccess={() => { loadPayments(); setShowFacturaModal(false); }}
  projectId={projectId}
  prefilledEtapaId={selectedEtapa?.id}
  prefilledEtapaNombre={selectedEtapa?.nombre}
/>
```

También agregar un botón inline por etapa (opcional, si existe el patrón):

```tsx
// En cada fila de etapa, botón para agregar gasto a esa etapa específica:
<Button
  variant="ghost" size="sm"
  onClick={() => { setSelectedEtapa({ id: etapa.id, nombre: etapa.nombre }); setShowFacturaModal(true); }}
>
  <Plus className="w-3 h-3" />
</Button>
```

**Step 3: Actualizar la lista de pagos en /obra**

La lista de pagos actualmente lee de `api.getObraPayments()` (`GET /admin/obra-payments/{id}`). Actualizar para leer de facturas filtradas por etapa:

En `api.ts`, agregar (o actualizar si existe):
```typescript
getObraPaymentsByEtapa: (projectId: string) =>
  fetcher<Factura[]>(`/admin/facturas/${projectId}?categoria=egreso`).then(
    rows => rows.filter(f => f.etapa_id !== null)
  ),
```

Actualizar el componente para usar esta nueva función y mapear los campos (`monto_total` en lugar de `monto_ars`, `fecha_emision` en lugar de `fecha_vencimiento`, etc.).

**Step 4: Verificar compilación**

```bash
cd frontend && npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add frontend/src/app/proyectos/[id]/obra/page.tsx frontend/src/lib/api.ts
git commit -m "feat: /obra uses unified FacturaModal for payments, reads from facturas"
```

---

## Task 9: Verificación integral y limpieza

**Step 1: Smoke test manual de los flujos críticos**

1. Abrir `/financiero` → tab "Facturas" → "+ Agregar" → crear un gasto simple (solo total + fecha)
2. Crear una factura formal (con número, CUIT, IVA, PDF)
3. Abrir `/obra` → tab "Pagos" → "Agregar gasto de obra" → verificar que `etapa_id` se pre-llena
4. Verificar que el nuevo registro aparece en el tab "Resumen" de /financiero como egreso
5. Verificar que el tab "Flujo de Caja" refleja el nuevo egreso
6. Editar una entrada existente desde la lista de facturas
7. Verificar que el dropdown de búsqueda de comprador (categoría=ingreso) ya no se trunca

**Step 2: Verificar datos migrados**

```sql
-- En Neon: verificar que los gastos migrados tienen categoria='egreso'
SELECT COUNT(*), tipo, categoria FROM facturas GROUP BY tipo, categoria ORDER BY categoria;
-- Verificar que los obra_payments migrados tienen etapa_id
SELECT COUNT(*) FROM facturas WHERE etapa_id IS NOT NULL;
```

**Step 3: (Opcional, post-validación) Marcar endpoints legacy como deprecated**

Agregar `deprecated=True` en los decoradores de:
- `POST /financials/{project_id}/expenses`
- `PATCH /financials/{project_id}/expenses/{id}`
- `DELETE /financials/{project_id}/expenses/{id}`
- `POST /obra-payments/{project_id}`
- `PATCH /obra-payments/{id}`

No eliminar todavía — dejar para una migración posterior cuando se confirme que nada los consume.

**Step 4: Commit final**

```bash
git add -A
git commit -m "feat: complete gastos/facturas unification - unified form, single table, cash-flow consolidated"
```

# Factura → Payment Record Link — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permitir vincular una factura de ingreso a un payment_record existente (cuota cobrada), usando un selector buscable por nombre de comprador dentro del modal de facturas.

**Architecture:** Nueva columna `payment_record_id` en `facturas` + endpoint `GET /admin/facturas/{project_id}/linkable-payments` para el selector. El modal de facturas muestra la sección de vinculación solo cuando `categoria = ingreso`. El listado de facturas incluye datos del pago vinculado en la respuesta.

**Tech Stack:** FastAPI, asyncpg, Next.js, TypeScript, Tailwind CSS.

---

## Task 1: Migración — agregar payment_record_id a facturas

**Files:**
- Create: `migrations/022_factura_payment_record.sql`

**Step 1: Crear el archivo de migración**

```sql
-- Migration 022: Add payment_record_id FK to facturas for income linkage

ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS payment_record_id UUID REFERENCES payment_records(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_facturas_payment_record ON facturas(payment_record_id);
```

**Step 2: Aplicar la migración en Neon**

Conectarse a la DB de Neon y ejecutar el SQL. Verificar que la columna aparece:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'facturas' AND column_name = 'payment_record_id';
```
Expected: una fila con `uuid`.

---

## Task 2: Backend — endpoint linkable-payments + actualizar FacturaBody

**Files:**
- Modify: `app/admin/api.py` (sección Facturas, líneas ~1656-1799)

**Step 1: Agregar el endpoint GET linkable-payments**

Insertar ANTES del endpoint `POST /facturas/{project_id}` (línea ~1715):

```python
@router.get("/facturas/{project_id}/linkable-payments")
async def list_linkable_payments(
    project_id: str,
    q: Optional[str] = None,
    user=Depends(require_auth),
):
    """List payment_records for a project, optionally filtered by buyer name.
    Used to populate the factura ingreso selector.
    """
    pool = await get_pool()
    conditions = ["r.project_id = $1"]
    params: list = [project_id]
    if q:
        conditions.append(f"r.buyer_name ILIKE $2")
        params.append(f"%{q}%")
    where = " AND ".join(conditions)
    rows = await pool.fetch(
        f"""SELECT pr.id, r.buyer_name, pi.numero_cuota, pi.concepto,
                   pr.monto_pagado, pr.moneda, pr.fecha_pago
            FROM payment_records pr
            JOIN payment_installments pi ON pi.id = pr.installment_id
            JOIN payment_plans pp ON pp.id = pi.plan_id
            JOIN reservations r ON r.id = pp.reservation_id
            WHERE {where}
            ORDER BY pr.fecha_pago DESC
            LIMIT 20""",
        *params,
    )
    return [dict(r) for r in rows]
```

**Step 2: Actualizar FacturaBody para aceptar payment_record_id**

En la clase `FacturaBody` (línea ~1658), agregar:
```python
payment_record_id: Optional[str] = None
```

**Step 3: Actualizar PatchFacturaBody para aceptar payment_record_id**

En la clase `PatchFacturaBody` (línea ~1762), agregar:
```python
payment_record_id: Optional[str] = None
```

**Step 4: Actualizar create_factura para insertar payment_record_id**

En `create_factura`, la query INSERT actualmente tiene 16 campos. Agregar `payment_record_id`:

Buscar:
```python
row = await conn.fetchrow(
    """INSERT INTO facturas
       (project_id, tipo, numero_factura, proveedor_nombre, cuit_emisor,
        fecha_emision, fecha_vencimiento, monto_neto, iva_pct, monto_total,
        moneda, categoria, file_url, gasto_id, estado, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING id""",
    project_id, body.tipo, body.numero_factura, body.proveedor_nombre,
    body.cuit_emisor,
    datetime.strptime(body.fecha_emision, "%Y-%m-%d").date(),
    datetime.strptime(body.fecha_vencimiento, "%Y-%m-%d").date() if body.fecha_vencimiento else None,
    body.monto_neto, body.iva_pct, body.monto_total,
    body.moneda, body.categoria, body.file_url,
    gasto_id, body.estado, body.notas,
)
estado_final = "vinculada" if gasto_id else "cargada"
```

Reemplazar con:
```python
payment_record_id = body.payment_record_id or None
row = await conn.fetchrow(
    """INSERT INTO facturas
       (project_id, tipo, numero_factura, proveedor_nombre, cuit_emisor,
        fecha_emision, fecha_vencimiento, monto_neto, iva_pct, monto_total,
        moneda, categoria, file_url, gasto_id, payment_record_id, estado, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id""",
    project_id, body.tipo, body.numero_factura, body.proveedor_nombre,
    body.cuit_emisor,
    datetime.strptime(body.fecha_emision, "%Y-%m-%d").date(),
    datetime.strptime(body.fecha_vencimiento, "%Y-%m-%d").date() if body.fecha_vencimiento else None,
    body.monto_neto, body.iva_pct, body.monto_total,
    body.moneda, body.categoria, body.file_url,
    gasto_id, payment_record_id, body.estado, body.notas,
)
estado_final = "vinculada" if (gasto_id or payment_record_id) else "cargada"
```

**Step 5: Actualizar list_facturas para incluir datos del pago vinculado**

En `list_facturas`, la query SELECT actualmente es:
```python
rows = await pool.fetch(
    f"""SELECT f.*, s.nombre AS proveedor_supplier
        FROM facturas f
        LEFT JOIN suppliers s ON s.id = f.proveedor_id
        WHERE {where}
        ORDER BY f.fecha_emision DESC""",
    *params,
)
```

Reemplazar con:
```python
rows = await pool.fetch(
    f"""SELECT f.*, s.nombre AS proveedor_supplier,
               r.buyer_name AS linked_buyer_name,
               pi.numero_cuota AS linked_cuota,
               pr.monto_pagado AS linked_monto,
               pr.moneda AS linked_moneda,
               pr.fecha_pago AS linked_fecha_pago
        FROM facturas f
        LEFT JOIN suppliers s ON s.id = f.proveedor_id
        LEFT JOIN payment_records pr ON pr.id = f.payment_record_id
        LEFT JOIN payment_installments pi ON pi.id = pr.installment_id
        LEFT JOIN payment_plans pp ON pp.id = pi.plan_id
        LEFT JOIN reservations r ON r.id = pp.reservation_id
        WHERE {where}
        ORDER BY f.fecha_emision DESC""",
    *params,
)
```

**Step 6: Verificar manualmente con curl**

```bash
curl -H "Authorization: Bearer {token}" \
  "http://localhost:8000/admin/facturas/{project_id}/linkable-payments?q=garcia"
# Expected: JSON array con buyer_name, numero_cuota, monto_pagado, fecha_pago
```

---

## Task 3: Frontend — tipos y método en api.ts

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Step 1: Agregar el tipo LinkablePayment**

Después del bloque `export interface Factura { ... }`, agregar:

```typescript
export interface LinkablePayment {
  id: string;
  buyer_name: string | null;
  numero_cuota: number;
  concepto: string;
  monto_pagado: number;
  moneda: 'USD' | 'ARS';
  fecha_pago: string;
}
```

**Step 2: Agregar payment_record_id y campos linked a Factura**

En `export interface Factura`, agregar al final (antes del cierre `}`):
```typescript
  payment_record_id: string | null;
  linked_buyer_name: string | null;
  linked_cuota: number | null;
  linked_monto: number | null;
  linked_moneda: string | null;
  linked_fecha_pago: string | null;
```

**Step 3: Agregar método getLinkablePayments**

En la sección de facturas del objeto `api`, después de `uploadFacturaPdf`, agregar:

```typescript
  getLinkablePayments: (projectId: string, q?: string) =>
    fetcher<LinkablePayment[]>(
      `/admin/facturas/${projectId}/linkable-payments${q ? `?q=${encodeURIComponent(q)}` : ''}`,
    ),
```

---

## Task 4: Frontend — UI selector en modal de facturas

**Files:**
- Modify: `frontend/src/app/proyectos/[id]/financiero/page.tsx`

**Step 1: Agregar payment_record_id a FACTURA_EMPTY y tipos**

Importar `LinkablePayment` desde api:
```typescript
import { api, FinancialSummary, BudgetItem, Expense, Factura, CashFlowRow, LinkablePayment } from '@/lib/api';
```

En `FACTURA_EMPTY`, agregar:
```typescript
  payment_record_id: '',
```

**Step 2: Agregar estados para el selector**

Después de `const [uploadingPdf, setUploadingPdf] = useState(false);`, agregar:

```typescript
const [linkablePayments, setLinkablePayments] = useState<LinkablePayment[]>([]);
const [paymentSearch, setPaymentSearch] = useState('');
const [loadingPayments, setLoadingPayments] = useState(false);
```

**Step 3: Agregar handler de búsqueda**

Junto a `handlePdfUpload`, agregar:

```typescript
const searchLinkablePayments = async (q: string) => {
  if (!id) return;
  setLoadingPayments(true);
  try {
    const results = await api.getLinkablePayments(id as string, q || undefined);
    setLinkablePayments(results);
  } catch {
    // silently fail
  } finally {
    setLoadingPayments(false);
  }
};
```

**Step 4: Cargar pagos cuando se abre el modal en modo ingreso**

En `openNewFactura` y `openEditFactura`, después de setear el form, agregar:
```typescript
setPaymentSearch('');
setLinkablePayments([]);
```

Y en `openEditFactura`, si la factura es `categoria === 'ingreso'`, cargar los pagos:
```typescript
if (f.categoria === 'ingreso') {
  searchLinkablePayments('');
}
```

**Step 5: Actualizar saveFactura para incluir payment_record_id**

En la llamada a `api.createFactura` / `api.patchFactura`, agregar al objeto de datos:
```typescript
payment_record_id: facturaForm.payment_record_id || null,
```

**Step 6: Agregar la sección del selector en el modal**

Buscar la sección del modal que contiene el campo de PDF (cerca de "Archivo PDF"). Agregar ANTES de ese campo la siguiente sección condicional (solo cuando `categoria === 'ingreso'`):

```tsx
{facturaForm.categoria === 'ingreso' && (
  <div className="space-y-2">
    <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
      Vincular a pago registrado
    </label>
    <input
      type="text"
      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
      placeholder="Buscar comprador..."
      value={paymentSearch}
      onChange={(e) => {
        setPaymentSearch(e.target.value);
        searchLinkablePayments(e.target.value);
      }}
      onFocus={() => { if (!linkablePayments.length) searchLinkablePayments(''); }}
    />
    {loadingPayments && (
      <p className="text-xs text-gray-400 px-1">Buscando...</p>
    )}
    {linkablePayments.length > 0 && (
      <div className="border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50 max-h-48 overflow-y-auto">
        {linkablePayments.map((pr) => (
          <button
            key={pr.id}
            type="button"
            onClick={() =>
              setFacturaForm(f => ({
                ...f,
                payment_record_id: f.payment_record_id === pr.id ? '' : pr.id,
              }))
            }
            className={cn(
              'w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors',
              facturaForm.payment_record_id === pr.id
                ? 'bg-blue-50 text-blue-800'
                : 'hover:bg-gray-50 text-gray-700',
            )}
          >
            <span className="font-medium">{pr.buyer_name || 'Comprador'}</span>
            <span className="text-gray-400">
              Cuota #{pr.numero_cuota} · {pr.moneda} {Number(pr.monto_pagado).toLocaleString('es-AR')} · {new Date(pr.fecha_pago).toLocaleDateString('es-AR')}
            </span>
          </button>
        ))}
      </div>
    )}
    {facturaForm.payment_record_id && (
      <p className="text-xs text-blue-700 font-medium px-1 flex items-center gap-1">
        ✓ Pago vinculado
        <button
          type="button"
          className="ml-1 text-gray-400 hover:text-red-500"
          onClick={() => setFacturaForm(f => ({ ...f, payment_record_id: '' }))}
        >
          (quitar)
        </button>
      </p>
    )}
  </div>
)}
```

**Step 7: Verificación visual**

1. Abrir modal de factura nueva
2. Cambiar categoría a "ingreso"
3. Debe aparecer la sección "Vincular a pago registrado"
4. Tipear un nombre → la lista filtra
5. Click en un pago → se selecciona (fondo azul) y aparece "✓ Pago vinculado"
6. Guardar → el `payment_record_id` se persiste en DB

---

## Verificación final

1. En Neon: `SELECT id, payment_record_id, categoria, estado FROM facturas LIMIT 5;`
   — facturas de ingreso vinculadas deben tener `estado = 'vinculada'`
2. En el frontend: crear una factura de ingreso, vincular un pago, guardar, volver a abrir → debe aparecer como vinculada
3. `GET /admin/facturas/{project_id}` deve incluir `linked_buyer_name`, `linked_cuota`, `linked_fecha_pago` en la respuesta

# Flujo de Caja — Filtro de Rango de Fechas: Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Agregar filtro `desde`/`hasta` (YYYY-MM) al endpoint y UI del Flujo de Caja.

**Architecture:** Query params opcionales en el endpoint FastAPI; dos `<input type="month">` en el tab de la página financiero; la función `getCashFlow` en api.ts recibe los params opcionales.

**Tech Stack:** FastAPI (Python), Next.js 16 App Router, TypeScript, Tailwind CSS 4, shadcn/ui

---

### Task 1: Backend — agregar query params `desde`/`hasta`

**Files:**
- Modify: `app/admin/api.py` (función `get_cash_flow`, ~línea 2100)

**Step 1: Agregar params a la firma de la función**

Reemplazar:
```python
@router.get("/cash-flow/{project_id}")
async def get_cash_flow(project_id: str):
```
Con:
```python
@router.get("/cash-flow/{project_id}")
async def get_cash_flow(
    project_id: str,
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
):
```

`Optional` ya está importado (`from typing import Optional`).

**Step 2: Agregar filtro de mes a cada query SQL**

Las 4 queries usan `to_char(..., 'YYYY-MM')` como alias `mes`. Agregar al final de cada `WHERE` la condición de rango, usando parámetros posicionales extra.

**Query ingresos** — reemplazar el `pool.fetch(...)` completo:
```python
    ingresos_rows = await pool.fetch(
        """SELECT
             to_char(pr.fecha_pago, 'YYYY-MM') AS mes,
             SUM(CASE WHEN pr.moneda='USD' THEN pr.monto_pagado
                      ELSE pr.monto_pagado / COALESCE(fc.tipo_cambio_usd_ars,1) END) AS total
           FROM payment_records pr
           JOIN payment_installments pi ON pi.id = pr.installment_id
           JOIN payment_plans pp ON pp.id = pi.plan_id
           JOIN reservations r ON r.id = pp.reservation_id
           LEFT JOIN project_financials_config fc ON fc.project_id = r.project_id
           WHERE r.project_id = $1 AND pr.deleted_at IS NULL
             AND ($2::text IS NULL OR to_char(pr.fecha_pago, 'YYYY-MM') >= $2)
             AND ($3::text IS NULL OR to_char(pr.fecha_pago, 'YYYY-MM') <= $3)
           GROUP BY mes
           ORDER BY mes""",
        project_id, desde, hasta,
    )
```

**Query gastos** — mismo patrón:
```python
    gastos_rows = await pool.fetch(
        """SELECT
             to_char(fecha, 'YYYY-MM') AS mes,
             SUM(COALESCE(monto_usd, monto_ars / COALESCE(fc.tipo_cambio_usd_ars,1), 0)) AS total
           FROM project_expenses pe
           LEFT JOIN project_financials_config fc ON fc.project_id = pe.project_id
           WHERE pe.project_id = $1 AND pe.deleted_at IS NULL
             AND ($2::text IS NULL OR to_char(fecha, 'YYYY-MM') >= $2)
             AND ($3::text IS NULL OR to_char(fecha, 'YYYY-MM') <= $3)
           GROUP BY mes
           ORDER BY mes""",
        project_id, desde, hasta,
    )
```

**Query obra** — mismo patrón:
```python
    obra_rows = await pool.fetch(
        """SELECT
             to_char(op.fecha_pago, 'YYYY-MM') AS mes,
             SUM(COALESCE(op.monto_usd, op.monto_ars / COALESCE(fc.tipo_cambio_usd_ars,1), 0)) AS total
           FROM obra_payments op
           JOIN obra_etapas oe ON oe.id = op.etapa_id
           LEFT JOIN project_financials_config fc ON fc.project_id = oe.project_id
           WHERE oe.project_id = $1 AND op.fecha_pago IS NOT NULL
             AND ($2::text IS NULL OR to_char(op.fecha_pago, 'YYYY-MM') >= $2)
             AND ($3::text IS NULL OR to_char(op.fecha_pago, 'YYYY-MM') <= $3)
           GROUP BY mes
           ORDER BY mes""",
        project_id, desde, hasta,
    )
```

**Query proyección** — mismo patrón:
```python
    proyeccion_rows = await pool.fetch(
        """SELECT
             to_char(pi.fecha_vencimiento, 'YYYY-MM') AS mes,
             SUM(CASE WHEN pi.moneda='USD' THEN pi.monto
                      ELSE pi.monto / COALESCE(fc.tipo_cambio_usd_ars,1) END) AS total
           FROM payment_installments pi
           JOIN payment_plans pp ON pp.id = pi.plan_id
           JOIN reservations r ON r.id = pp.reservation_id
           LEFT JOIN project_financials_config fc ON fc.project_id = r.project_id
           WHERE r.project_id = $1
             AND pi.estado IN ('pendiente','vencido')
             AND pi.fecha_vencimiento >= CURRENT_DATE
             AND ($2::text IS NULL OR to_char(pi.fecha_vencimiento, 'YYYY-MM') >= $2)
             AND ($3::text IS NULL OR to_char(pi.fecha_vencimiento, 'YYYY-MM') <= $3)
           GROUP BY mes
           ORDER BY mes""",
        project_id, desde, hasta,
    )
```

**Step 3: Verificar manualmente**

```bash
curl "http://localhost:8000/admin/cash-flow/<project_id>?desde=2026-01&hasta=2026-06"
# Debe devolver solo meses dentro del rango

curl "http://localhost:8000/admin/cash-flow/<project_id>"
# Sin params → devuelve todo igual que antes
```

**Step 4: Commit**

```bash
git add app/admin/api.py
git commit -m "feat: agregar filtro desde/hasta al endpoint cash-flow"
```

---

### Task 2: API client — actualizar `getCashFlow`

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Step 1: Actualizar la función `getCashFlow`**

Buscar:
```typescript
getCashFlow: (projectId: string) =>
    fetcher<CashFlowRow[]>(`/admin/cash-flow/${projectId}`),
```

Reemplazar con:
```typescript
getCashFlow: (projectId: string, desde?: string, hasta?: string) => {
    const params = new URLSearchParams();
    if (desde) params.set('desde', desde);
    if (hasta) params.set('hasta', hasta);
    const qs = params.toString();
    return fetcher<CashFlowRow[]>(`/admin/cash-flow/${projectId}${qs ? `?${qs}` : ''}`);
  },
```

**Step 2: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: agregar params desde/hasta a getCashFlow"
```

---

### Task 3: Frontend — agregar filtros al tab Flujo de Caja

**Files:**
- Modify: `frontend/src/app/proyectos/[id]/financiero/page.tsx`

**Step 1: Agregar estado para los filtros**

Cerca de donde está `const [cashFlow, setCashFlow] = useState<CashFlowRow[]>([])`, agregar:

```typescript
// Defaults: 2 meses atrás → 12 meses adelante
const defaultDesde = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const defaultHasta = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const [cfDesde, setCfDesde] = useState<string>(defaultDesde());
const [cfHasta, setCfHasta] = useState<string>(defaultHasta());
```

**Step 2: Actualizar `loadCashFlow` para pasar los filtros**

Buscar la función:
```typescript
const loadCashFlow = async () => {
    ...
    try { setCashFlow(await api.getCashFlow(id)); }
```

Reemplazar la línea del try con:
```typescript
    try { setCashFlow(await api.getCashFlow(id, cfDesde, cfHasta)); }
```

**Step 3: Hacer que el tab recargue cuando cambian los filtros**

Buscar el `useEffect` o el handler que llama a `loadCashFlow` al cambiar de tab (`if (v === 'cashflow' ...)`). Agregar un `useEffect` que recargue cuando cambian los filtros:

```typescript
useEffect(() => {
  // Solo recargar si el tab está activo y ya fue cargado al menos una vez
  if (cashFlow.length > 0 || loadingCF) {
    loadCashFlow();
  }
}, [cfDesde, cfHasta]);
```

Colocar este `useEffect` después de los otros useEffects existentes.

**Step 4: Agregar los inputs al UI**

Ubicar el bloque que renderiza el tab `cashflow` — justo antes del contenido (antes del skeleton check o del empty state). Agregar la barra de filtros:

```tsx
{/* Filtros de rango */}
<div className="flex items-center gap-3 flex-wrap">
  <div className="flex items-center gap-2">
    <label className="text-xs font-medium text-gray-500">Desde</label>
    <input
      type="month"
      value={cfDesde}
      onChange={e => setCfDesde(e.target.value)}
      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
    />
  </div>
  <div className="flex items-center gap-2">
    <label className="text-xs font-medium text-gray-500">Hasta</label>
    <input
      type="month"
      value={cfHasta}
      onChange={e => setCfHasta(e.target.value)}
      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
    />
  </div>
  <button
    onClick={() => { setCfDesde(defaultDesde()); setCfHasta(defaultHasta()); }}
    className="text-xs text-gray-400 hover:text-gray-600 transition-colors underline"
  >
    Resetear
  </button>
</div>
```

**Step 5: Verificar en browser**

- Abrir `/proyectos/[id]/financiero` → tab Flujo de Caja
- Los inputs deben aparecer con defaults
- Cambiar "Hasta" a un mes pasado → tabla debe actualizarse con menos filas
- Click "Resetear" → vuelve a los defaults
- Sin datos en el rango → debe mostrar empty state

**Step 6: Commit**

```bash
git add frontend/src/app/proyectos/\[id\]/financiero/page.tsx
git commit -m "feat: filtro desde/hasta en UI del flujo de caja"
```

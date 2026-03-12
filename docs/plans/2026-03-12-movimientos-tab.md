# Movimientos Tab — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the "Facturas" tab in Financiero with a unified "Movimientos" tab that shows all cobros (payment_records) and egresos (facturas) in one auditable table, where each cobro can have a factura/comprobante linked to it.

**Architecture:** New backend endpoint `GET /admin/movimientos/{project_id}` that UNIONs payment_records (cobros) and facturas egreso into a single sorted list. New `MovimientosTab.tsx` component replaces the facturas tab in the financiero page. Reuses existing `FacturaModal` for egresos and for adding comprobantes to cobros.

**Tech Stack:** FastAPI, asyncpg, PostgreSQL, Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui.

---

### Task 1: Backend — `GET /admin/movimientos/{project_id}`

**Files:**
- Modify: `app/admin/routers/financials.py` — add new endpoint after `get_cash_flow`

**Step 1: Add endpoint** after the `get_cash_flow` function (around line 145):

```python
@router.get("/movimientos/{project_id}")
async def get_movimientos(
    project_id: str,
    tipo: Optional[str] = None,          # 'cobro' | 'egreso' | None (all)
    sin_comprobante: Optional[bool] = None,  # True = cobros without linked factura
    desde: Optional[str] = None,         # YYYY-MM-DD
    hasta: Optional[str] = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Unified movimientos: cobros (payment_records) + egresos (facturas)."""
    if not credentials:
        raise HTTPException(status_code=401, detail="No autorizado")
    verify_token(credentials.credentials)
    pool = await get_pool()

    rows = await pool.fetch(
        """
        SELECT
          'cobro'::text AS tipo,
          pr.id::text AS id,
          pr.fecha_pago AS fecha,
          COALESCE(r.buyer_name, l.name, l.phone) AS contraparte,
          COALESCE(u.floor || u.unit_number, '') AS unidad,
          pi.concepto::text AS concepto,
          pi.numero_cuota,
          pr.monto_pagado AS monto,
          pr.moneda::text AS moneda,
          pr.metodo_pago,
          f_link.id::text AS comprobante_id,
          f_link.numero_factura AS comprobante_numero,
          f_link.tipo::text AS comprobante_tipo,
          pi.id::text AS installment_id,
          r.id::text AS reservation_id,
          NULL::text AS factura_estado,
          NULL::text AS etapa_nombre,
          NULL::text AS budget_categoria
        FROM payment_records pr
        JOIN payment_installments pi ON pi.id = pr.installment_id
        JOIN payment_plans pp ON pp.id = pi.plan_id
        JOIN reservations r ON r.id = pp.reservation_id
        LEFT JOIN leads l ON l.id = r.lead_id
        LEFT JOIN units u ON u.id = r.unit_id
        LEFT JOIN facturas f_link ON f_link.payment_record_id = pr.id
          AND f_link.deleted_at IS NULL
        WHERE r.project_id = $1
          AND pr.deleted_at IS NULL
          AND ($2::text IS NULL OR pr.fecha_pago >= $2::date)
          AND ($3::text IS NULL OR pr.fecha_pago <= $3::date)
          AND ($4::bool IS NULL OR $4 = FALSE OR f_link.id IS NULL)

        UNION ALL

        SELECT
          'egreso'::text AS tipo,
          f.id::text AS id,
          f.fecha_emision AS fecha,
          COALESCE(f.proveedor_nombre, s.nombre, '—') AS contraparte,
          NULL AS unidad,
          NULL AS concepto,
          NULL AS numero_cuota,
          COALESCE(f.monto_usd, CASE WHEN f.moneda='USD' THEN f.monto_total ELSE NULL END) AS monto,
          'USD'::text AS moneda,
          NULL AS metodo_pago,
          NULL AS comprobante_id,
          f.numero_factura AS comprobante_numero,
          f.tipo::text AS comprobante_tipo,
          NULL AS installment_id,
          NULL AS reservation_id,
          f.estado::text AS factura_estado,
          oe.nombre AS etapa_nombre,
          pb.categoria AS budget_categoria
        FROM facturas f
        LEFT JOIN suppliers s ON s.id = f.proveedor_id
        LEFT JOIN obra_etapas oe ON oe.id = f.etapa_id
        LEFT JOIN project_budget pb ON pb.id = f.budget_id
        WHERE f.project_id = $1
          AND f.categoria = 'egreso'
          AND f.deleted_at IS NULL
          AND ($2::text IS NULL OR f.fecha_emision >= $2::date)
          AND ($3::text IS NULL OR f.fecha_emision <= $3::date)

        ORDER BY fecha DESC NULLS LAST
        """,
        project_id, desde, hasta, sin_comprobante,
    )

    # Apply tipo filter in Python (simpler than SQL UNION filter)
    result = []
    for r in rows:
        row = dict(r)
        row["fecha"] = str(row["fecha"]) if row["fecha"] else None
        row["numero_cuota"] = int(row["numero_cuota"]) if row["numero_cuota"] is not None else None
        row["monto"] = float(row["monto"]) if row["monto"] is not None else None
        if tipo and row["tipo"] != tipo:
            continue
        result.append(row)
    return result
```

**Step 2: Verify syntax**

```bash
cd /Users/mcendoya/repos/real-estate && source venv/bin/activate && python3 -c "import app.admin.routers.financials; print('OK')"
```
Expected: `OK`

**Step 3: Quick smoke test against DB**

```bash
source venv/bin/activate && python3 -c "
import asyncio, os
from dotenv import load_dotenv
load_dotenv()

async def main():
    import asyncpg
    conn = await asyncpg.connect(os.getenv('DATABASE_URL'))
    rows = await conn.fetch('''
        SELECT COUNT(*) FROM (
          SELECT pr.id FROM payment_records pr
          JOIN payment_installments pi ON pi.id = pr.installment_id
          JOIN payment_plans pp ON pp.id = pi.plan_id
          JOIN reservations r ON r.id = pp.reservation_id
          WHERE pr.deleted_at IS NULL
        ) t
    ''')
    print('Cobros en DB:', rows[0][0])
    await conn.close()

asyncio.run(main())
"
```
Expected: prints a number > 0.

**Step 4: Register route in main app**

Check that `financials` router is already registered — it should be. Verify:

```bash
grep -n "financials" /Users/mcendoya/repos/real-estate/app/main.py
```
Expected: line importing/including the financials router.

**Step 5: Commit**

```bash
git add app/admin/routers/financials.py
git commit -m "feat: add /admin/movimientos/{project_id} unified endpoint"
```

---

### Task 2: Frontend — `Movimiento` interface + API function

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Step 1: Add `Movimiento` interface** after the `CashFlowRow` interface (around line 375):

```typescript
export interface Movimiento {
  tipo: 'cobro' | 'egreso';
  id: string;
  fecha: string;
  contraparte: string;
  unidad: string | null;
  concepto: string | null;
  numero_cuota: number | null;
  monto: number | null;
  moneda: 'USD' | 'ARS';
  metodo_pago: string | null;
  // cobro-specific
  comprobante_id: string | null;
  comprobante_numero: string | null;
  comprobante_tipo: string | null;
  installment_id: string | null;
  reservation_id: string | null;
  // egreso-specific
  factura_estado: string | null;
  etapa_nombre: string | null;
  budget_categoria: string | null;
}
```

**Step 2: Add `getMovimientos` API function** near `getFacturas` (around line 819):

```typescript
getMovimientos: (
  projectId: string,
  params?: { tipo?: 'cobro' | 'egreso'; sin_comprobante?: boolean; desde?: string; hasta?: string }
) => {
  const q = new URLSearchParams();
  if (params?.tipo) q.set('tipo', params.tipo);
  if (params?.sin_comprobante) q.set('sin_comprobante', 'true');
  if (params?.desde) q.set('desde', params.desde);
  if (params?.hasta) q.set('hasta', params.hasta);
  const qs = q.toString();
  return fetcher<Movimiento[]>(`/admin/movimientos/${projectId}${qs ? `?${qs}` : ''}`);
},
```

**Step 3: Verify TypeScript compiles**

```bash
cd /Users/mcendoya/repos/real-estate/frontend && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors related to api.ts.

**Step 4: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add Movimiento interface and getMovimientos API function"
```

---

### Task 3: Frontend — `MovimientosTab.tsx` component

**Files:**
- Create: `frontend/src/app/proyectos/[id]/financiero/MovimientosTab.tsx`

**Step 1: Create the component**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { api, Movimiento, Factura } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, FileText, ExternalLink, Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import FacturaModal from '@/components/FacturaModal';

interface Props {
  projectId: string;
  isReader: boolean;
}

function formatUSD(v: number | null) {
  if (v == null) return '—';
  if (Math.abs(v) >= 1_000_000) return `USD ${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `USD ${(v / 1_000).toFixed(0)}K`;
  return `USD ${v.toLocaleString('es-AR')}`;
}

function fmtFecha(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: '2-digit' });
}

export default function MovimientosTab({ projectId, isReader }: Props) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [filterTipo, setFilterTipo] = useState<'cobro' | 'egreso' | ''>('');
  const [filterSinComprobante, setFilterSinComprobante] = useState(false);

  // Edit cobro modal
  const [editingCobro, setEditingCobro] = useState<Movimiento | null>(null);
  const [cobroForm, setCobroForm] = useState({ fecha_pago: '', monto_pagado: '', metodo_pago: 'transferencia' });
  const [savingCobro, setSavingCobro] = useState(false);

  // Factura modal (for egresos + adding comprobante to cobros)
  const [showFacturaModal, setShowFacturaModal] = useState(false);
  const [editingFactura, setEditingFactura] = useState<Factura | null>(null);
  const [prefilledPaymentRecordId, setPrefilledPaymentRecordId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getMovimientos(projectId, {
        tipo: filterTipo || undefined,
        sin_comprobante: filterSinComprobante || undefined,
      });
      setMovimientos(data);
    } catch {
      toast.error('Error cargando movimientos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const handleDeleteCobro = async (m: Movimiento) => {
    if (!confirm('¿Eliminar este cobro?')) return;
    try {
      await api.deletePaymentRecord(m.id);
      toast.success('Cobro eliminado');
      load();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Error'); }
  };

  const handleDeleteEgreso = async (m: Movimiento) => {
    if (!confirm('¿Eliminar este egreso?')) return;
    try {
      await api.deleteFactura(m.id);
      toast.success('Egreso eliminado');
      load();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Error'); }
  };

  const openEditCobro = (m: Movimiento) => {
    setEditingCobro(m);
    setCobroForm({
      fecha_pago: m.fecha,
      monto_pagado: m.monto != null ? String(m.monto) : '',
      metodo_pago: m.metodo_pago || 'transferencia',
    });
  };

  const saveCobro = async () => {
    if (!editingCobro) return;
    setSavingCobro(true);
    try {
      await api.updatePaymentRecord(editingCobro.id, {
        fecha_pago: cobroForm.fecha_pago,
        monto_pagado: parseFloat(cobroForm.monto_pagado),
        metodo_pago: cobroForm.metodo_pago,
      });
      toast.success('Cobro actualizado');
      setEditingCobro(null);
      load();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Error'); }
    finally { setSavingCobro(false); }
  };

  const openAddComprobante = (m: Movimiento) => {
    setEditingFactura(null);
    setPrefilledPaymentRecordId(m.id);
    setShowFacturaModal(true);
  };

  const openNewEgreso = () => {
    setEditingFactura(null);
    setPrefilledPaymentRecordId(null);
    setShowFacturaModal(true);
  };

  const openEditEgreso = async (m: Movimiento) => {
    // Fetch the full factura to pass to FacturaModal
    try {
      const facturas = await api.getFacturas(projectId);
      const f = facturas.find((f) => f.id === m.id) ?? null;
      setEditingFactura(f);
      setPrefilledPaymentRecordId(null);
      setShowFacturaModal(true);
    } catch { toast.error('Error cargando factura'); }
  };

  const METODOS = ['transferencia', 'efectivo', 'cheque', 'cripto', 'otro'];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none"
            value={filterTipo}
            onChange={(e) => setFilterTipo(e.target.value as 'cobro' | 'egreso' | '')}
          >
            <option value="">Todos</option>
            <option value="cobro">Cobros</option>
            <option value="egreso">Egresos</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={filterSinComprobante}
              onChange={(e) => setFilterSinComprobante(e.target.checked)}
              className="rounded"
            />
            Solo sin comprobante
          </label>
          <button
            onClick={load}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            Filtrar
          </button>
        </div>
        {!isReader && (
          <div className="flex items-center gap-2">
            <button
              onClick={openNewEgreso}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium"
            >
              <Plus size={13} /> Egreso
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full bg-gray-100" />)}</div>
      ) : movimientos.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
          <FileText size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Sin movimientos registrados.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Fecha</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Tipo</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Contraparte</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Concepto</th>
                <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Monto</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Comprobante</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => (
                <tr key={`${m.tipo}-${m.id}`} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {m.fecha ? fmtFecha(m.fecha) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={cn('text-[10px]',
                      m.tipo === 'cobro'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                    )}>
                      {m.tipo === 'cobro' ? 'Cobro' : 'Egreso'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-800 font-medium truncate max-w-[160px]">{m.contraparte || '—'}</p>
                    {m.unidad && <p className="text-[10px] text-gray-400">{m.unidad}</p>}
                    {m.etapa_nombre && <p className="text-[10px] text-gray-400">{m.etapa_nombre}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {m.tipo === 'cobro' ? (
                      <span>
                        {m.concepto === 'anticipo' ? 'Anticipo' : m.concepto === 'saldo' ? 'Saldo' : 'Cuota'}
                        {m.numero_cuota != null && ` #${m.numero_cuota}`}
                      </span>
                    ) : (
                      <span className="text-gray-500">{m.budget_categoria || '—'}</span>
                    )}
                  </td>
                  <td className={cn('px-4 py-3 text-right font-medium whitespace-nowrap',
                    m.tipo === 'cobro' ? 'text-emerald-700' : 'text-red-600'
                  )}>
                    {m.tipo === 'cobro' ? '+' : '−'}{formatUSD(m.monto)}
                  </td>
                  <td className="px-4 py-3">
                    {m.tipo === 'cobro' ? (
                      m.comprobante_id ? (
                        <Badge className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 gap-1">
                          <Receipt size={9} />
                          {m.comprobante_numero || 'Vinculado'}
                        </Badge>
                      ) : (
                        <span className="text-xs text-gray-400">— Sin comprobante</span>
                      )
                    ) : (
                      m.comprobante_numero ? (
                        <span className="text-xs text-gray-600">{m.comprobante_numero}</span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {!isReader && m.tipo === 'cobro' && (
                        <>
                          {!m.comprobante_id && (
                            <button
                              onClick={() => openAddComprobante(m)}
                              className="p-1.5 text-gray-400 hover:text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
                              title="Agregar comprobante"
                            >
                              <Plus size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => openEditCobro(m)}
                            className="p-1.5 text-gray-400 hover:text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDeleteCobro(m)}
                            className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                      {!isReader && m.tipo === 'egreso' && (
                        <>
                          <button
                            onClick={() => openEditEgreso(m)}
                            className="p-1.5 text-gray-400 hover:text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDeleteEgreso(m)}
                            className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit cobro modal */}
      {editingCobro && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Editar cobro</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha de pago</label>
                <input
                  type="date"
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={cobroForm.fecha_pago}
                  onChange={(e) => setCobroForm((f) => ({ ...f, fecha_pago: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Monto (USD)</label>
                <input
                  type="number"
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={cobroForm.monto_pagado}
                  onChange={(e) => setCobroForm((f) => ({ ...f, monto_pagado: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Método de pago</label>
                <select
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  value={cobroForm.metodo_pago}
                  onChange={(e) => setCobroForm((f) => ({ ...f, metodo_pago: e.target.value }))}
                >
                  {['transferencia', 'efectivo', 'cheque', 'cripto', 'otro'].map((m) => (
                    <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditingCobro(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={saveCobro}
                disabled={savingCobro}
                className="px-4 py-2 text-sm bg-blue-700 text-white rounded-xl hover:bg-blue-800 disabled:opacity-50"
              >
                {savingCobro ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FacturaModal for egresos and adding comprobante to cobros */}
      {showFacturaModal && (
        <FacturaModal
          projectId={projectId}
          factura={editingFactura}
          defaultCategoria={prefilledPaymentRecordId ? 'ingreso' : 'egreso'}
          prefilledPaymentRecordId={prefilledPaymentRecordId}
          onClose={() => { setShowFacturaModal(false); setEditingFactura(null); setPrefilledPaymentRecordId(null); }}
          onSaved={() => { setShowFacturaModal(false); setEditingFactura(null); setPrefilledPaymentRecordId(null); load(); }}
        />
      )}
    </div>
  );
}
```

**Step 2: Check FacturaModal props** to confirm it accepts `defaultCategoria` and `prefilledPaymentRecordId`:

```bash
grep -n "defaultCategoria\|prefilledPaymentRecordId\|interface.*Props\|props:" /Users/mcendoya/repos/real-estate/frontend/src/components/FacturaModal.tsx | head -20
```

If FacturaModal does NOT accept these props yet, add them in Task 4.

**Step 3: Commit**

```bash
git add frontend/src/app/proyectos/\[id\]/financiero/MovimientosTab.tsx
git commit -m "feat: add MovimientosTab component with cobros + egresos unified view"
```

---

### Task 4: Update `FacturaModal` to accept `defaultCategoria` + `prefilledPaymentRecordId`

**Files:**
- Modify: `frontend/src/components/FacturaModal.tsx`

**Step 1: Read the current Props interface** in FacturaModal.tsx and check what props it already accepts.

```bash
grep -n "interface.*Props\|defaultCategoria\|prefilledPaymentRecordId\|onClose\|onSaved\|projectId" /Users/mcendoya/repos/real-estate/frontend/src/components/FacturaModal.tsx | head -20
```

**Step 2: Add missing props** to the Props interface if not already present:

Find the Props interface and add:
```typescript
  defaultCategoria?: 'egreso' | 'ingreso';
  prefilledPaymentRecordId?: string | null;
```

**Step 3: Use `defaultCategoria`** when initializing the form state. Find where `categoria` is initialized (likely `FACTURA_EMPTY` or a `useState` default) and change it to use the prop:

```typescript
// Find the line like:
const [form, setForm] = useState({ ..., categoria: 'egreso', ... });
// Change to:
const [form, setForm] = useState({ ..., categoria: props.defaultCategoria ?? 'egreso', ... });
```

Or if using a reset effect:
```typescript
useEffect(() => {
  if (factura) {
    // existing edit logic
  } else {
    setForm({ ...FACTURA_EMPTY, categoria: defaultCategoria ?? 'egreso' });
  }
}, [factura, defaultCategoria]);
```

**Step 4: Use `prefilledPaymentRecordId`** to pre-fill the payment record selector when the modal opens for "add comprobante":

Find where `payment_record_id` is initialized in the form and add:
```typescript
payment_record_id: prefilledPaymentRecordId ?? null,
```

**Step 5: Verify TypeScript**

```bash
cd /Users/mcendoya/repos/real-estate/frontend && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

**Step 6: Commit**

```bash
git add frontend/src/components/FacturaModal.tsx
git commit -m "feat: FacturaModal accepts defaultCategoria and prefilledPaymentRecordId props"
```

---

### Task 5: Wire `MovimientosTab` into Financiero page — replace "Facturas" tab

**Files:**
- Modify: `frontend/src/app/proyectos/[id]/financiero/page.tsx`

**Step 1: Add import** at the top of the file after existing imports:

```typescript
import MovimientosTab from './MovimientosTab';
```

**Step 2: Replace the TabsTrigger** for "facturas":

Find:
```tsx
<TabsTrigger value="facturas">Facturas</TabsTrigger>
```
Replace with:
```tsx
<TabsTrigger value="movimientos">Movimientos</TabsTrigger>
```

**Step 3: Replace the TabsContent** for "facturas" (the entire block from `<TabsContent value="facturas"` to its closing `</TabsContent>`):

Replace the entire facturas TabsContent block with:
```tsx
{/* ─── Tab: Movimientos ─── */}
<TabsContent value="movimientos">
  <MovimientosTab projectId={id} isReader={isReader} />
</TabsContent>
```

**Step 4: Update the `onValueChange` handler** on the Tabs component. Find:

```typescript
if (v === 'facturas' && facturas.length === 0 && !loadingFacturas) loadFacturas();
```
Remove that line (MovimientosTab handles its own loading).

**Step 5: Remove now-unused state** — the following state variables are no longer needed in page.tsx (they're now inside MovimientosTab or replaced):
- `facturas`, `setFacturas`
- `loadingFacturas`, `setLoadingFacturas`
- `showFacturaModal`, `setShowFacturaModal`
- `editingFactura`, `setEditingFactura`
- `facturaFilterCat`, `setFacturaFilterCat`
- `facturaFilterProveedor`, `setFacturaFilterProveedor`
- `loadFacturas` function
- `deleteFactura` function

Also remove the `Factura` import from api if no longer used in page.tsx.

**Step 6: Verify TypeScript**

```bash
cd /Users/mcendoya/repos/real-estate/frontend && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors.

**Step 7: Commit**

```bash
git add frontend/src/app/proyectos/\[id\]/financiero/page.tsx
git commit -m "feat: replace Facturas tab with Movimientos tab in Financiero page"
```

---

### Task 6: Smoke test in browser

**Step 1: Start dev server**

```bash
cd /Users/mcendoya/repos/real-estate/frontend && npm run dev
```

**Step 2: Navigate to** `http://localhost:3000/proyectos/[any-project-id]/financiero`

**Step 3: Verify:**
- Tab "Movimientos" appears (not "Facturas")
- Cobros (payment_records) appear as green "Cobro" badges
- Egresos (facturas) appear as red "Egreso" badges
- Cobros without comprobante show "— Sin comprobante" and a "+" button
- Clicking "+" on a cobro opens FacturaModal pre-set to ingreso with payment_record_id pre-filled
- Clicking pencil on a cobro opens the edit modal
- Clicking pencil on an egreso opens FacturaModal with the factura loaded
- Filter "Solo sin comprobante" works
- Filter by tipo "Cobros" / "Egresos" works

**Step 4: No commit** — smoke test only.

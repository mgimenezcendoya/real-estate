# Reporte del Comprador — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Agregar una página de reporte imprimible por reserva con avance de obra, plan de pagos y resumen financiero, accesible desde el detalle de cada reserva.

**Architecture:** Nueva ruta `/proyectos/[id]/reservas/[reservationId]/reporte/page.tsx` con layout limpio (sin sidebar), igual al patrón de `/print`. Fetch en paralelo de 3 endpoints existentes al montar. Botón en la página de detalle de reserva abre el reporte en nueva pestaña.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS 4, Lucide React. No hay nuevos endpoints de backend — solo reutiliza `getReservation`, `getPaymentPlan`, `getObra`.

---

## Archivos a modificar / crear

| Archivo | Acción |
|---|---|
| `frontend/src/app/proyectos/[id]/reservas/[reservationId]/reporte/layout.tsx` | Crear — layout vacío (igual que `/print/layout.tsx`) |
| `frontend/src/app/proyectos/[id]/reservas/[reservationId]/reporte/page.tsx` | Crear — página del reporte |
| `frontend/src/app/proyectos/[id]/reservas/[reservationId]/page.tsx` | Modificar — agregar botón "Generar reporte" |

---

## Tarea 1 — Layout vacío para la ruta `/reporte`

**Archivo:** `frontend/src/app/proyectos/[id]/reservas/[reservationId]/reporte/layout.tsx`

El layout de `/print` ya existe y es un wrapper mínimo que evita que el layout del proyecto (sidebar, tabs) se aplique. Crear el mismo patrón.

**Paso 1: Crear el archivo**

```tsx
export default function ReporteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

**Paso 2: Verificar** — navegar a `/proyectos/[id]/reservas/[reservationId]/reporte` debe mostrar una página sin sidebar ni tabs del proyecto.

---

## Tarea 2 — Página del reporte

**Archivo:** `frontend/src/app/proyectos/[id]/reservas/[reservationId]/reporte/page.tsx`

**Paso 1: Estructura base y fetch de datos**

Los tres endpoints se llaman en paralelo al montar:
- `api.getReservation(reservationId)` → `Reservation`
- `api.getPaymentPlan(reservationId)` → `PaymentPlan | null`
- `api.getObra(projectId)` → `ObraData` (tiene `progress: number` y `etapas: ObraEtapa[]`)

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, Reservation, PaymentPlan, ObraData } from '@/lib/api';

export default function ReporteCompradorPage() {
  const { id: projectId, reservationId } = useParams<{ id: string; reservationId: string }>();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [plan, setPlan] = useState<PaymentPlan | null>(null);
  const [obra, setObra] = useState<ObraData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!reservationId || !projectId) return;
    Promise.all([
      api.getReservation(reservationId),
      api.getPaymentPlan(reservationId).catch(() => null),
      api.getObra(projectId).catch(() => null),
    ]).then(([res, p, o]) => {
      setReservation(res);
      setPlan(p);
      setObra(o);
    }).finally(() => setLoading(false));
  }, [reservationId, projectId]);

  if (loading) return (
    <div className="flex items-center justify-center h-screen text-gray-500 text-sm">
      Generando reporte…
    </div>
  );

  if (!reservation) return (
    <div className="flex items-center justify-center h-screen text-gray-500 text-sm">
      Reserva no encontrada.
    </div>
  );

  // ... render del reporte
}
```

**Paso 2: Helpers de formato**

Copiar/reutilizar los helpers del `/print/page.tsx` existente:

```tsx
function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function formatUSD(val: number | null | undefined) {
  if (val == null) return '—';
  return `USD ${Number(val).toLocaleString('es-AR')}`;
}

const ESTADO_STYLES: Record<string, string> = {
  pagado:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  vencido:  'bg-red-50 text-red-600 border-red-200',
  pendiente: 'bg-amber-50 text-amber-600 border-amber-200',
  parcial:  'bg-blue-50 text-blue-600 border-blue-200',
};

const ESTADO_LABELS: Record<string, string> = {
  pagado: 'Pagado', vencido: 'Vencido', pendiente: 'Pendiente', parcial: 'Parcial',
};

const CONCEPTO_LABELS: Record<string, string> = {
  anticipo: 'Anticipo', cuota: 'Cuota', saldo: 'Saldo final',
};
```

**Paso 3: Layout del reporte completo**

```tsx
return (
  <>
    <style>{`
      @media print {
        @page { margin: 15mm; }
        .no-print { display: none !important; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; }
    `}</style>

    {/* Toolbar — oculta al imprimir */}
    <div className="no-print flex items-center justify-between px-6 py-3 border-b border-gray-100 bg-white sticky top-0">
      <span className="text-sm text-gray-500 font-medium">Reporte del comprador</span>
      <div className="flex gap-2">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 text-sm bg-blue-700 text-white rounded-lg font-medium hover:bg-blue-800 transition-colors"
        >
          Imprimir / Guardar PDF
        </button>
        <button
          onClick={() => window.close()}
          className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cerrar
        </button>
      </div>
    </div>

    <div className="max-w-[750px] mx-auto p-8 space-y-8 text-gray-900">

      {/* ── HEADER ── */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black text-blue-700 tracking-tight">REALIA</h1>
          <p className="text-xs text-gray-400 mt-0.5">Sistema de gestión inmobiliaria</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-gray-900">Estado de cuenta</p>
          <p className="text-xs text-gray-500 mt-0.5">{reservation.project_name}</p>
          <p className="text-xs text-gray-400">Generado: {formatDate(new Date().toISOString())}</p>
        </div>
      </div>

      {/* ── DATOS DE LA OPERACIÓN ── */}
      <section>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Datos de la operación</p>
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-gray-100">
            <div className="px-5 py-4">
              <p className="text-xs text-gray-400 mb-1">Comprador</p>
              <p className="font-semibold text-gray-900">{reservation.buyer_name || '—'}</p>
              <p className="text-sm text-gray-500">{reservation.buyer_phone}</p>
              {reservation.buyer_email && <p className="text-sm text-gray-500">{reservation.buyer_email}</p>}
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-gray-400 mb-1">Unidad</p>
              <p className="font-semibold text-gray-900">
                Unidad {reservation.unit_identifier} · Piso {reservation.unit_floor}
              </p>
              <p className="text-sm text-gray-500">
                {reservation.unit_bedrooms} amb. · {reservation.unit_area_m2} m²
              </p>
              <p className="text-sm font-medium text-gray-700 mt-1">{formatUSD(reservation.unit_price_usd)}</p>
            </div>
          </div>
          <div className="border-t border-gray-100 px-5 py-3 bg-gray-50">
            <p className="text-xs text-gray-500">
              Fecha de reserva: <span className="font-medium text-gray-700">{formatDate(reservation.created_at)}</span>
              {reservation.signed_at && (
                <> · Firma: <span className="font-medium text-gray-700">{formatDate(reservation.signed_at)}</span></>
              )}
            </p>
          </div>
        </div>
      </section>

      {/* ── AVANCE DE OBRA ── */}
      {obra && (
        <section>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Avance de obra</p>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            {/* Barra general */}
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-gray-700">Avance general</span>
                <span className="text-sm font-bold text-blue-700">{obra.progress}%</span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all"
                  style={{ width: `${obra.progress}%` }}
                />
              </div>
            </div>
            {/* Etapas activas */}
            <div className="divide-y divide-gray-50">
              {obra.etapas.filter(e => e.activa).map(etapa => (
                <div key={etapa.id} className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-gray-700">{etapa.nombre}</span>
                  <div className="flex items-center gap-3 min-w-[120px]">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-400 rounded-full"
                        style={{ width: `${etapa.porcentaje_completado}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-gray-500 w-8 text-right">
                      {etapa.porcentaje_completado}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── PLAN DE PAGOS ── */}
      {plan && plan.installments.length > 0 && (
        <section>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Plan de pagos</p>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Concepto</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Vencimiento</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Monto</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {plan.installments.map((inst, i) => (
                  <tr key={inst.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-700">
                      {inst.concepto === 'cuota'
                        ? `Cuota ${i + 1}`
                        : CONCEPTO_LABELS[inst.concepto] || inst.concepto}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(inst.fecha_vencimiento)}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800 tabular-nums">
                      {inst.moneda} {inst.monto.toLocaleString('es-AR')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${ESTADO_STYLES[inst.estado] || ''}`}>
                        {ESTADO_LABELS[inst.estado] || inst.estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── RESUMEN FINANCIERO ── */}
      {plan && plan.installments.length > 0 && (() => {
        const total = plan.installments.reduce((s, i) => s + i.monto, 0);
        const pagado = plan.installments
          .filter(i => i.estado === 'pagado')
          .reduce((s, i) => s + i.monto, 0);
        const pendiente = total - pagado;
        const moneda = plan.installments[0]?.moneda || 'USD';
        return (
          <section>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Resumen financiero</p>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-3 divide-x divide-gray-100">
                <div className="px-5 py-4 text-center">
                  <p className="text-xs text-gray-400 mb-1">Total del plan</p>
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{moneda} {total.toLocaleString('es-AR')}</p>
                </div>
                <div className="px-5 py-4 text-center">
                  <p className="text-xs text-gray-400 mb-1">Total pagado</p>
                  <p className="text-lg font-bold text-emerald-600 tabular-nums">{moneda} {pagado.toLocaleString('es-AR')}</p>
                </div>
                <div className="px-5 py-4 text-center">
                  <p className="text-xs text-gray-400 mb-1">Saldo pendiente</p>
                  <p className="text-lg font-bold text-amber-600 tabular-nums">{moneda} {pendiente.toLocaleString('es-AR')}</p>
                </div>
              </div>
            </div>
          </section>
        );
      })()}

      {/* Footer */}
      <p className="text-[10px] text-gray-300 text-center pb-4">
        Documento informativo generado por REALIA · {new Date().toLocaleDateString('es-AR')}
      </p>
    </div>
  </>
);
```

**Paso 4: Verificar visualmente** — abrir la ruta directamente, revisar que las 5 secciones se rendericen correctamente. Probar `window.print()` para confirmar el layout imprimible.

---

## Tarea 3 — Botón en el detalle de reserva

**Archivo:** `frontend/src/app/proyectos/[id]/reservas/[reservationId]/page.tsx`

El botón "Imprimir comprobante" ya existe (icono `Printer`). Agregar un botón "Generar reporte" justo al lado.

**Paso 1: Buscar la línea del botón Printer**

Buscar en el archivo el uso de `<Printer` o `window.open.*print`. El botón abre la ruta `/print` en nueva pestaña.

**Paso 2: Agregar el botón de reporte**

Importar `FileText` de lucide-react (si no está ya importado) y agregar junto al botón existente:

```tsx
import { FileText } from 'lucide-react'; // agregar al import existente de lucide-react

// Junto al botón de Printer existente:
<Button
  variant="outline"
  size="sm"
  onClick={() => window.open(`/proyectos/${projectId}/reservas/${reservationId}/reporte`, '_blank')}
  className="flex items-center gap-1.5"
>
  <FileText size={14} />
  Reporte
</Button>
```

**Paso 3: Verificar** — en el detalle de una reserva con plan de pagos, hacer click en "Reporte" debe abrir la nueva página en una pestaña limpia con las 5 secciones.

---

## Secuencia de implementación

1. Tarea 1 — layout vacío (30 segundos)
2. Tarea 2 — página del reporte completa
3. Tarea 3 — botón en detalle de reserva

## Verificación final

- Entrar al detalle de una reserva con plan de pagos → botón "Reporte" visible junto a "Imprimir"
- Click abre nueva pestaña sin sidebar/tabs del proyecto
- Sección "Datos de la operación" muestra comprador, unidad, precio, fecha
- Sección "Avance de obra" muestra barra general + etapas activas con % individual
- Sección "Plan de pagos" muestra tabla completa con estados coloreados
- Sección "Resumen financiero" muestra 3 cifras correctas
- `Ctrl+P` / botón "Imprimir" genera un PDF limpio sin elementos de UI

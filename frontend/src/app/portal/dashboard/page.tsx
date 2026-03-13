'use client';

import { useEffect, useState } from 'react';
import { portalApi, PortalMe, PortalObraData, PaymentPlan } from '@/lib/api';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import PortalHeader from '@/components/PortalHeader';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  Building2,
  CreditCard,
  CheckCircle,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  MapPin,
  Calendar,
  BedDouble,
  Maximize2,
} from 'lucide-react';

// ─── Progress Ring ────────────────────────────────────────────────────────────
function ProgressRing({ value, size = 120 }: { value: number; size?: number }) {
  const stroke = size * 0.075;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E5E7EB" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke="url(#portalGrad)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 1s ease' }}
      />
      <defs>
        <linearGradient id="portalGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1d4ed8" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ─── Stage completion color ───────────────────────────────────────────────────
function stageAccent(pct: number) {
  if (pct === 100) return 'bg-emerald-500';
  if (pct > 0)    return 'bg-blue-600';
  return 'bg-gray-200';
}

// ─── Obra Tab ─────────────────────────────────────────────────────────────────
function ObraTab({ projectId }: { projectId: string }) {
  const [data, setData] = useState<PortalObraData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    portalApi.getObra()
      .then(setData)
      .catch(() => toast.error('No se pudo cargar el avance de obra'))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="space-y-3 pt-6">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full rounded-2xl bg-gray-100" />)}
      </div>
    );
  }

  if (!data || data.etapas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-4">
          <Building2 size={24} className="text-gray-300" />
        </div>
        <p className="text-gray-400 text-sm">Sin información de avance disponible aún.</p>
      </div>
    );
  }

  const active = data.etapas.filter(e => e.activa);

  return (
    <div className="pt-6 space-y-6">
      {/* Hero progress */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 flex flex-col sm:flex-row items-center gap-6">
        <div className="relative shrink-0">
          <ProgressRing value={data.progress} size={132} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-display font-bold text-gray-900 leading-none tabular">{data.progress}</span>
            <span className="text-xs text-gray-400 font-medium mt-0.5">%</span>
          </div>
        </div>
        <div className="flex-1 text-center sm:text-left">
          <h3 className="text-xl font-display font-bold text-gray-900 mb-1">Avance de obra</h3>
          <p className="text-sm text-gray-500 mb-4">
            {data.progress < 30 && 'El proyecto está en sus etapas iniciales.'}
            {data.progress >= 30 && data.progress < 70 && 'El proyecto avanza en etapas intermedias.'}
            {data.progress >= 70 && data.progress < 100 && 'El proyecto está en etapa de terminaciones.'}
            {data.progress === 100 && '¡El proyecto está completamente terminado!'}
          </p>
          {/* Mini stages strip */}
          <div className="flex gap-1.5 flex-wrap justify-center sm:justify-start">
            {active.map(e => (
              <div key={e.id} className="flex items-center gap-1.5 bg-gray-50 rounded-full px-2.5 py-1 border border-gray-100">
                <div className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  e.porcentaje_completado === 100 ? 'bg-emerald-500' :
                  e.porcentaje_completado > 0     ? 'bg-blue-600' : 'bg-gray-300'
                )} />
                <span className="text-[11px] text-gray-500 font-medium truncate max-w-[100px]">{e.nombre}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stage cards */}
      <div className="space-y-2.5">
        {active.map((etapa, idx) => {
          const isOpen = expanded[etapa.id] ?? false;
          const hasUpdates = etapa.updates.length > 0;
          const pct = etapa.porcentaje_completado;

          return (
            <div
              key={etapa.id}
              className={cn(
                'bg-white rounded-2xl border overflow-hidden transition-all duration-200',
                isOpen ? 'border-blue-100 shadow-md shadow-blue-500/5' : 'border-gray-100 shadow-sm'
              )}
            >
              <button
                onClick={() => hasUpdates && setExpanded(p => ({ ...p, [etapa.id]: !p[etapa.id] }))}
                className={cn(
                  'w-full flex items-center gap-4 px-5 py-4 text-left group',
                  hasUpdates ? 'cursor-pointer' : 'cursor-default'
                )}
              >
                {/* Status icon — matches admin obra page */}
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2',
                  pct === 100 ? 'border-emerald-500 bg-emerald-50 text-emerald-500' :
                  pct > 0     ? 'border-blue-500 bg-blue-50 text-blue-500' :
                                'border-gray-200 bg-white text-gray-300'
                )}>
                  {pct === 100
                    ? <CheckCircle size={14} />
                    : pct > 0
                    ? <Clock size={12} />
                    : <span className="w-2 h-2 rounded-full bg-gray-200" />
                  }
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="text-sm font-semibold text-gray-900 truncate">{etapa.nombre}</span>
                    <span className={cn(
                      'text-xs font-bold tabular shrink-0',
                      pct === 100 ? 'text-emerald-600' : pct > 0 ? 'text-blue-600' : 'text-gray-300'
                    )}>
                      {pct}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={cn('h-1.5 rounded-full transition-all duration-700', stageAccent(pct))}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <div className={cn(
                  'shrink-0 text-gray-300 transition-transform duration-200',
                  isOpen ? 'rotate-90' : '',
                  !hasUpdates && 'invisible'
                )}>
                  <ChevronRight size={16} />
                </div>
              </button>

              {/* Updates */}
              {isOpen && hasUpdates && (
                <div className="border-t border-gray-50 bg-gray-50/50">
                  {etapa.updates.map((update, ui) => (
                    <div
                      key={update.id}
                      className={cn(
                        'px-5 py-4',
                        ui < etapa.updates.length - 1 && 'border-b border-gray-100'
                      )}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                        <span className="text-xs text-gray-400 font-medium">
                          {new Date(update.fecha).toLocaleDateString('es-AR', {
                            day: '2-digit', month: 'long', year: 'numeric'
                          })}
                        </span>
                      </div>
                      {update.nota_publica && (
                        <p className="text-sm text-gray-600 leading-relaxed ml-3.5">{update.nota_publica}</p>
                      )}
                      {update.fotos.length > 0 && (
                        <div className="flex gap-2 mt-3 ml-3.5 flex-wrap">
                          {update.fotos.map((foto) => (
                            <a
                              key={foto.id}
                              href={foto.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-24 h-24 rounded-xl overflow-hidden border border-gray-200 bg-gray-100 block hover:opacity-90 transition-opacity shrink-0"
                            >
                              <img
                                src={foto.file_url}
                                alt={foto.caption || foto.filename}
                                className="w-full h-full object-cover"
                              />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Payment Plan Tab ─────────────────────────────────────────────────────────
const ESTADO_STYLE = {
  pagado:   { label: 'Pagado',   icon: CheckCircle,    cls: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  pendiente:{ label: 'Pendiente',icon: Clock,          cls: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200',    dot: 'bg-amber-400'  },
  vencido:  { label: 'Vencido',  icon: AlertCircle,    cls: 'text-red-600',    bg: 'bg-red-50 border-red-200',        dot: 'bg-red-500'    },
  parcial:  { label: 'Parcial',  icon: Clock,          cls: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200',      dot: 'bg-blue-500'   },
} as const;

function PaymentPlanTab({ reservationId }: { reservationId: string }) {
  const [plan, setPlan] = useState<PaymentPlan | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalApi.getPaymentPlan()
      .then(setPlan)
      .catch(() => toast.error('No se pudo cargar el plan de pagos'))
      .finally(() => setLoading(false));
  }, [reservationId]);

  if (loading) {
    return (
      <div className="space-y-3 pt-6">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full rounded-2xl bg-gray-100" />)}
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-4">
          <CreditCard size={24} className="text-gray-300" />
        </div>
        <p className="text-gray-400 text-sm">Todavía no hay un plan de pagos cargado.</p>
      </div>
    );
  }

  const total = plan.installments.reduce((s, i) => s + i.monto, 0);
  const paid = plan.installments
    .filter(i => i.estado === 'pagado')
    .reduce((s, i) => s + i.monto, 0);
  const paidPct = total > 0 ? Math.round((paid / total) * 100) : 0;
  const pending = plan.installments.filter(i => i.estado === 'pendiente' || i.estado === 'parcial').length;
  const overdue = plan.installments.filter(i => i.estado === 'vencido').length;

  return (
    <div className="pt-6 space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1.5">Total</p>
          <p className="text-lg font-display font-bold text-gray-900 tabular leading-none">
            {plan.moneda_base}&nbsp;{Number(total).toLocaleString('es-AR')}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1.5">Abonado</p>
          <p className="text-lg font-display font-bold text-emerald-600 tabular leading-none">
            {paidPct}%
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1.5">
            {overdue > 0 ? 'Vencidas' : 'Pendientes'}
          </p>
          <p className={cn(
            'text-lg font-display font-bold tabular leading-none',
            overdue > 0 ? 'text-red-600' : 'text-amber-600'
          )}>
            {overdue > 0 ? overdue : pending}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
        <div className="flex justify-between items-center mb-2.5">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Progreso de pagos</span>
          <span className="text-sm font-bold text-gray-900 tabular">{paidPct}% completado</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
          <div
            className="h-2.5 rounded-full bg-blue-700 transition-all duration-1000"
            style={{ width: `${paidPct}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-[11px] text-gray-400">
          <span>{plan.moneda_base} {Number(paid).toLocaleString('es-AR')} pagado</span>
          <span>{plan.moneda_base} {Number(total - paid).toLocaleString('es-AR')} restante</span>
        </div>
      </div>

      {/* Installment list */}
      <div className="space-y-2.5">
        {plan.installments.map((inst) => {
          const st = ESTADO_STYLE[inst.estado] ?? ESTADO_STYLE.pendiente;
          const Icon = st.icon;
          const label = inst.concepto === 'anticipo' ? 'Anticipo'
            : inst.concepto === 'saldo' ? 'Saldo final'
            : `Cuota ${inst.numero_cuota}`;
          const due = new Date(inst.fecha_vencimiento + 'T00:00:00');

          return (
            <div
              key={inst.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
            >
              <div className="flex items-center gap-4 px-5 py-4">
                {/* Icon */}
                <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', st.bg, 'border')}>
                  <Icon size={15} className={st.cls} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">{label}</span>
                    <span className={cn(
                      'text-xs font-semibold px-2.5 py-0.5 rounded-full border',
                      st.bg, st.cls
                    )}>
                      {st.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                    <span className="font-semibold text-gray-700 tabular">
                      {inst.moneda} {Number(inst.monto).toLocaleString('es-AR')}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar size={11} />
                      {due.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment records */}
              {inst.records.length > 0 && (
                <div className="border-t border-gray-50 bg-emerald-50/50 px-5 py-3 space-y-1.5">
                  {inst.records.map((rec) => (
                    <div key={rec.id} className="flex items-center gap-2 text-xs text-emerald-700">
                      <CheckCircle size={11} className="shrink-0" />
                      <span>
                        Acreditado el {new Date(rec.fecha_pago + 'T00:00:00').toLocaleDateString('es-AR', {
                          day: '2-digit', month: 'short', year: 'numeric'
                        })} —{' '}
                        <span className="font-semibold tabular">
                          {rec.moneda} {Number(rec.monto_pagado).toLocaleString('es-AR')}
                        </span>
                        {rec.metodo_pago && ` · ${rec.metodo_pago}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PortalDashboardPage() {
  const { reservationId } = usePortalAuth();
  const [me, setMe] = useState<PortalMe | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);

  useEffect(() => {
    portalApi.me()
      .then(setMe)
      .catch(() => {})
      .finally(() => setLoadingMe(false));
  }, []);

  return (
    <div className="min-h-screen w-full" style={{ background: '#F7F7F5' }}>
      <PortalHeader projectName={me?.project_name ?? undefined} />

      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* Unit hero card */}
        {loadingMe ? (
          <Skeleton className="h-36 w-full rounded-3xl bg-gray-100 mb-8" />
        ) : me ? (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm mb-8 overflow-hidden">
            {/* Top accent stripe */}
            <div className="h-1 bg-blue-100" />
            <div className="p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row sm:items-start gap-5">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                  <Building2 size={24} className="text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl font-display font-bold text-gray-900 leading-tight mb-1">
                    {me.project_name}
                  </h1>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
                    {me.unit_identifier && (
                      <span className="flex items-center gap-1.5 text-sm text-gray-500">
                        <Maximize2 size={13} className="text-gray-400" />
                        Unidad {me.unit_identifier} · Piso {me.unit_floor}
                      </span>
                    )}
                    {me.bedrooms && (
                      <span className="flex items-center gap-1.5 text-sm text-gray-500">
                        <BedDouble size={13} className="text-gray-400" />
                        {me.bedrooms} amb.{me.area_m2 ? ` · ${me.area_m2} m²` : ''}
                      </span>
                    )}
                    {me.project_address && (
                      <span className="flex items-center gap-1.5 text-sm text-gray-500">
                        <MapPin size={13} className="text-gray-400" />
                        {me.project_address}
                      </span>
                    )}
                    {me.estimated_delivery && (
                      <span className="flex items-center gap-1.5 text-sm text-gray-500">
                        <Calendar size={13} className="text-gray-400" />
                        Entrega estimada: {me.estimated_delivery}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Tabs */}
        <Tabs defaultValue="obra" className="w-full">
          <TabsList className="bg-white border border-gray-100 shadow-sm rounded-2xl p-1 h-auto w-full grid grid-cols-2 gap-1 mb-2">
            <TabsTrigger
              value="obra"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold data-[state=active]:bg-blue-700 data-[state=active]:text-white data-[state=inactive]:text-gray-500 transition-all"
            >
              <Building2 size={14} />
              Avance de Obra
            </TabsTrigger>
            <TabsTrigger
              value="pagos"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold data-[state=active]:bg-blue-700 data-[state=active]:text-white data-[state=inactive]:text-gray-500 transition-all"
            >
              <CreditCard size={14} />
              Mi Plan de Pagos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="obra" className="w-full">
            {me?.project_id
              ? <ObraTab projectId={me.project_id} />
              : <div className="py-16 text-center text-gray-400 text-sm">Cargando...</div>
            }
          </TabsContent>
          <TabsContent value="pagos" className="w-full">
            {reservationId
              ? <PaymentPlanTab reservationId={reservationId} />
              : <div className="py-16 text-center text-gray-400 text-sm">Sin reserva asociada.</div>
            }
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

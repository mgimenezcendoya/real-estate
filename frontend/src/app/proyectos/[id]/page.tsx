'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, Project, Metrics, Unit, Analytics } from '@/lib/api';
import { Users, Flame, TrendingUp, Building2, Home, DollarSign, ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

function StatCard({
  label,
  value,
  icon: Icon,
  colorClass,
  loading,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  colorClass: string;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-start justify-between mb-3">
          <Skeleton className="w-8 h-8 rounded-xl bg-gray-100" />
        </div>
        <Skeleton className="h-3 w-20 bg-gray-100 mb-2" />
        <Skeleton className="h-8 w-16 bg-gray-200" />
      </div>
    );
  }

  return (
    <div className="relative bg-white border border-gray-200 rounded-2xl p-5 hover:border-gray-300 hover:shadow-md transition-all duration-150 overflow-hidden group">
      {/* Faint icon decoration */}
      <div className={cn('absolute -bottom-3 -right-3 opacity-[0.05] pointer-events-none', colorClass)}>
        <Icon size={64} />
      </div>
      {/* Icon */}
      <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center mb-3', colorClass)}>
        <Icon size={15} />
      </div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-3xl font-bold text-gray-900 tabular leading-none">{value}</p>
    </div>
  );
}

const DELIVERY_CONFIG: Record<string, { label: string; pct: number; indicatorClass: string }> = {
  en_pozo: { label: 'En pozo', pct: 15, indicatorClass: 'bg-amber-500' },
  en_construccion: { label: 'En construcción', pct: 55, indicatorClass: 'bg-blue-500' },
  terminado: { label: 'Terminado', pct: 100, indicatorClass: 'bg-emerald-500' },
};

function formatUSD(value: number) {
  if (value >= 1_000_000) return `USD ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `USD ${(value / 1_000).toFixed(0)}K`;
  return `USD ${value.toLocaleString('es-AR')}`;
}

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

export default function ProjectDashboard() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { role } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (role === 'vendedor') {
      router.replace(`/proyectos/${id}/leads`);
      return;
    }
  }, [role, id, router]);

  useEffect(() => {
    if (!id || role === 'vendedor') return;
    Promise.all([
      api.getProject(id).then(setProject),
      api.getMetrics(id).then(setMetrics),
      api.getUnits(id).then(setUnits),
      api.getAnalytics(id).then(setAnalytics).catch(() => null),
    ])
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const soldUnits = units.filter((u) => u.status === 'sold').length;
  const reservedUnits = units.filter((u) => u.status === 'reserved').length;
  const availableUnits = units.filter((u) => u.status === 'available').length;
  const deliveryConf = DELIVERY_CONFIG[project?.delivery_status || 'en_pozo'];

  // Weekly chart helpers
  const weeklyLeads = analytics?.weekly_leads ?? [];
  const maxWeekTotal = Math.max(...weeklyLeads.map((w) => w.hot + w.warm + w.cold), 1);

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
      {/* Lead metrics */}
      <section>
        <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.14em] mb-4 section-divider">Resumen de leads</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total leads" value={metrics?.total_leads ?? '—'} icon={Users} colorClass="bg-blue-50 text-blue-700" loading={loading} />
          <StatCard label="Hot 🔥" value={metrics?.hot ?? '—'} icon={Flame} colorClass="bg-red-50 text-red-600" loading={loading} />
          <StatCard label="Warm 🌡" value={metrics?.warm ?? '—'} icon={TrendingUp} colorClass="bg-amber-50 text-amber-600" loading={loading} />
          <StatCard label="Cold 🧊" value={metrics?.cold ?? '—'} icon={Users} colorClass="bg-sky-50 text-sky-600" loading={loading} />
        </div>
      </section>

      {/* Unit metrics */}
      <section>
        <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.14em] mb-4 section-divider">Estado de unidades</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Disponibles" value={availableUnits} icon={Building2} colorClass="bg-emerald-50 text-emerald-600" loading={loading} />
          <StatCard label="Reservadas" value={reservedUnits} icon={Home} colorClass="bg-amber-50 text-amber-600" loading={loading} />
          <StatCard label="Vendidas" value={soldUnits} icon={DollarSign} colorClass="bg-red-50 text-red-600" loading={loading} />
          <StatCard label="Total" value={units.length} icon={Building2} colorClass="bg-blue-50 text-blue-700" loading={loading} />
        </div>
      </section>

      {/* Analytics: Funnel */}
      {(loading || analytics) && (
        <section>
          <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.14em] mb-4 section-divider">Funnel de conversión</h2>
          {loading ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <div className="flex gap-3 items-center">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3 flex-1">
                    <Skeleton className="h-20 flex-1 rounded-xl bg-gray-100" />
                    {i < 4 && <Skeleton className="w-5 h-5 bg-gray-200 rounded" />}
                  </div>
                ))}
              </div>
            </div>
          ) : analytics ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <div className="flex gap-1.5 md:gap-3 items-center">
                {[
                  {
                    label: 'Leads totales',
                    value: analytics.funnel.leads_total,
                    pctLabel: null,
                    bg: 'bg-blue-50',
                    border: 'border-blue-200/60',
                    text: 'text-blue-800',
                    numText: 'text-blue-950',
                    badge: 'bg-blue-100 text-blue-700',
                  },
                  {
                    label: 'Hot 🔥',
                    value: analytics.funnel.leads_hot,
                    pctLabel: `${pct(analytics.funnel.leads_hot, analytics.funnel.leads_total)}%`,
                    bg: 'bg-red-50',
                    border: 'border-red-200/60',
                    text: 'text-red-600',
                    numText: 'text-red-900',
                    badge: 'bg-red-100 text-red-600',
                  },
                  {
                    label: 'Reservadas',
                    value: analytics.funnel.units_reserved,
                    pctLabel: `${pct(analytics.funnel.units_reserved, analytics.funnel.leads_total)}%`,
                    bg: 'bg-amber-50',
                    border: 'border-amber-200/60',
                    text: 'text-amber-600',
                    numText: 'text-amber-900',
                    badge: 'bg-amber-100 text-amber-700',
                  },
                  {
                    label: 'Vendidas',
                    value: analytics.funnel.units_sold,
                    pctLabel: `${pct(analytics.funnel.units_sold, analytics.funnel.leads_total)}%`,
                    bg: 'bg-emerald-50',
                    border: 'border-emerald-200/60',
                    text: 'text-emerald-600',
                    numText: 'text-emerald-900',
                    badge: 'bg-emerald-100 text-emerald-700',
                  },
                ].map(({ label, value, pctLabel, bg, border, text, numText, badge }, i) => (
                  <div key={label} className="flex items-center gap-1.5 md:gap-3 flex-1 min-w-0">
                    <div className={cn('flex-1 rounded-xl border p-3 md:p-4 flex flex-col gap-1 min-w-0', bg, border)}>
                      <p className={cn('text-[11px] font-semibold uppercase tracking-wide truncate', text)}>{label}</p>
                      <p className={cn('text-2xl md:text-3xl font-bold tabular leading-none', numText)}>{value}</p>
                      {pctLabel && (
                        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-md w-fit', badge)}>
                          {pctLabel}
                        </span>
                      )}
                    </div>
                    {i < 3 && <ArrowRight size={14} className="text-gray-300 flex-shrink-0" />}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      )}

      {/* Analytics: Revenue */}
      {(loading || analytics) && (
        <section>
          <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.14em] mb-4 section-divider">Revenue</h2>
          {loading ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full bg-gray-100 rounded-xl" />)}
            </div>
          ) : analytics ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-sm font-medium text-gray-500">Potencial total</span>
                    <span className="text-sm font-bold text-gray-800 tabular">{formatUSD(analytics.revenue.potential_usd)}</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gray-200 rounded-full w-full" />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-sm font-medium text-gray-500">Reservado</span>
                    <span className="text-sm font-bold text-amber-700 tabular">
                      {formatUSD(analytics.revenue.reserved_usd)}
                      <span className="font-normal text-gray-400 text-xs ml-1.5">
                        ({pct(analytics.revenue.reserved_usd, analytics.revenue.potential_usd)}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-2.5 bg-amber-50 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all duration-500"
                      style={{ width: `${pct(analytics.revenue.reserved_usd, analytics.revenue.potential_usd)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-sm font-medium text-gray-500">Vendido</span>
                    <span className="text-sm font-bold text-emerald-700 tabular">
                      {formatUSD(analytics.revenue.sold_usd)}
                      <span className="font-normal text-gray-400 text-xs ml-1.5">
                        ({pct(analytics.revenue.sold_usd, analytics.revenue.potential_usd)}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-2.5 bg-emerald-50 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${pct(analytics.revenue.sold_usd, analytics.revenue.potential_usd)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      )}

      {/* Analytics: Weekly bar chart */}
      {!loading && analytics && weeklyLeads.length > 0 && (
        <section>
          <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.14em] mb-4 section-divider">Leads por semana</h2>
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <div className="flex items-end gap-1.5 h-40">
              {weeklyLeads.map((w) => {
                const total = w.hot + w.warm + w.cold;
                const barPx = Math.round(Math.max(total / maxWeekTotal, 0.04) * 120);
                return (
                  <div key={w.week} className="flex-1 flex flex-col items-center gap-1 group">
                    {total > 0 && (
                      <span className="text-[10px] font-bold text-gray-500 tabular leading-none">
                        {total}
                      </span>
                    )}
                    <div
                      className="w-full flex flex-col-reverse rounded-t-lg overflow-hidden cursor-default"
                      style={{ height: `${barPx}px` }}
                      title={`Hot: ${w.hot} | Warm: ${w.warm} | Cold: ${w.cold}`}
                    >
                      {w.cold > 0 && (
                        <div className="bg-sky-300 group-hover:bg-sky-400 transition-colors" style={{ flex: w.cold }} />
                      )}
                      {w.warm > 0 && (
                        <div className="bg-amber-300 group-hover:bg-amber-400 transition-colors" style={{ flex: w.warm }} />
                      )}
                      {w.hot > 0 && (
                        <div className="bg-red-400 group-hover:bg-red-500 transition-colors" style={{ flex: w.hot }} />
                      )}
                    </div>
                    <span className="text-[8px] text-gray-400 text-center leading-tight font-medium">
                      {new Date(w.week + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-5 mt-4 pt-4 border-t border-gray-50">
              <span className="flex items-center gap-1.5 text-xs text-gray-500 font-medium"><span className="w-2 h-2 rounded-sm bg-red-400 inline-block" />Hot</span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500 font-medium"><span className="w-2 h-2 rounded-sm bg-amber-300 inline-block" />Warm</span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500 font-medium"><span className="w-2 h-2 rounded-sm bg-sky-300 inline-block" />Cold</span>
            </div>
          </div>
        </section>
      )}

      {/* Analytics: Lead sources */}
      {!loading && analytics && analytics.lead_sources.length > 0 && (
        <section>
          <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.14em] mb-4 section-divider">Fuentes de leads</h2>
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <div className="flex flex-wrap gap-2">
              {analytics.lead_sources.map(({ source, count }) => {
                const total = analytics.funnel.leads_total;
                const p = pct(count, total);
                return (
                  <div key={source} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-50 border border-gray-200 hover:border-blue-200 hover:bg-blue-50 transition-colors group">
                    <span className="text-xs font-semibold text-gray-700 group-hover:text-blue-800 capitalize transition-colors">{source}</span>
                    <span className="text-xs font-bold text-gray-900 group-hover:text-blue-900 tabular transition-colors">{count}</span>
                    {p > 0 && <span className="text-[10px] text-gray-400 group-hover:text-blue-500 transition-colors font-medium">{p}%</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Obra progress */}
      {loading ? (
        <section>
          <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.14em] mb-4 section-divider">Avance de obra</h2>
          <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-3 shadow-sm">
            <div className="flex justify-between">
              <Skeleton className="h-5 w-32 bg-gray-200" />
              <Skeleton className="h-5 w-10 bg-gray-200" />
            </div>
            <Skeleton className="h-2 w-full bg-gray-200 rounded-full" />
          </div>
        </section>
      ) : project ? (
        <section>
          <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.14em] mb-4 section-divider">Avance de obra</h2>
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-gray-800 font-semibold text-sm">{deliveryConf?.label}</span>
              <span className="text-sm font-bold tabular" style={{ color: deliveryConf?.indicatorClass?.includes('emerald') ? '#059669' : deliveryConf?.indicatorClass?.includes('blue') ? '#1d4ed8' : '#d97706' }}>{deliveryConf?.pct}%</span>
            </div>
            <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-700', deliveryConf?.indicatorClass)}
                style={{ width: `${deliveryConf?.pct}%` }}
              />
            </div>
            {project.construction_start && (
              <div className="flex flex-wrap gap-6 mt-4">
                <div>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Inicio de obra</p>
                  <p className="text-sm font-medium text-gray-700">{project.construction_start}</p>
                </div>
                {project.estimated_delivery && (
                  <div>
                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Entrega estimada</p>
                    <p className="text-sm font-medium text-gray-700">{project.estimated_delivery}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {/* Description */}
      {!loading && project?.description && (
        <section>
          <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.14em] mb-4 section-divider">Descripción</h2>
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <p className="text-gray-600 text-sm leading-relaxed">{project.description}</p>
          </div>
        </section>
      )}

      {/* Amenities */}
      {!loading && project?.amenities && project.amenities.length > 0 && (
        <section>
          <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.14em] mb-4 section-divider">Amenities</h2>
          <div className="flex flex-wrap gap-2">
            {project.amenities.map((a) => (
              <Badge
                key={a}
                className="bg-blue-50 border border-blue-200 text-blue-800 hover:bg-blue-100 text-xs font-medium"
              >
                {a}
              </Badge>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

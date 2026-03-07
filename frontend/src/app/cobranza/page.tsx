'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, CobranzaItem, Project } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { CreditCard, AlertCircle, Clock, Users, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';

function fmtMonto(monto: number) {
  return `USD ${monto.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CobranzaPage() {
  const { organizationName } = useAuth();
  const [items, setItems] = useState<CobranzaItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [proyectoFilter, setProyectoFilter] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('todas');
  const [markingPaid, setMarkingPaid] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, projs] = await Promise.all([
        api.getCobranza(),
        api.getProjects(),
      ]);
      setItems(data);
      setProjects(projs);
    } catch {
      toast.error('Error cargando cobranza');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return items.filter(item => {
      const matchProj = !proyectoFilter || item.project_id === proyectoFilter;
      const matchEstado =
        estadoFilter === 'todas' ||
        (estadoFilter === 'vencida' && item.dias >= 0) ||
        (estadoFilter === 'proxima' && item.dias < 0);
      return matchProj && matchEstado;
    });
  }, [items, proyectoFilter, estadoFilter]);

  const kpis = useMemo(() => {
    const totalVencidoUSD = items
      .filter(i => i.dias >= 0)
      .reduce((acc, i) => acc + i.monto_usd, 0);
    const estaSemana = items.filter(i => i.dias < 0 && i.dias >= -7).length;
    const compradoresEnMora = new Set(
      items.filter(i => i.dias >= 0).map(i => i.buyer_phone)
    ).size;
    const totalVencidas = items.filter(i => i.dias >= 0).length;
    return { totalVencidoUSD, estaSemana, compradoresEnMora, totalVencidas };
  }, [items]);

  const handleMarkPaid = async (item: CobranzaItem) => {
    setMarkingPaid(prev => new Set(prev).add(item.installment_id));
    setItems(prev => prev.filter(i => i.installment_id !== item.installment_id));
    try {
      await api.patchInstallment(item.installment_id, { estado: 'pagado' });
      toast.success(`Cuota ${item.numero_cuota} de ${item.buyer_name} marcada como pagada`);
    } catch {
      setItems(prev => [...prev, item].sort((a, b) =>
        a.fecha_vencimiento.localeCompare(b.fecha_vencimiento)
      ));
      toast.error('Error al marcar como pagada');
    } finally {
      setMarkingPaid(prev => { const s = new Set(prev); s.delete(item.installment_id); return s; });
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto min-h-full animate-fade-in-up">
      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 text-[10px] font-bold uppercase tracking-widest mb-3">
          <CreditCard size={10} />
          {organizationName ?? 'Portafolio'}
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-display font-extrabold text-gray-900 tracking-tight mb-2 leading-none">
              Cobranza
            </h1>
            <p className="text-gray-400 text-sm font-medium">
              Seguimiento de cuotas pendientes y vencidas de todos los proyectos.
            </p>
          </div>
          {kpis.totalVencidas > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-sm font-semibold flex-shrink-0">
              <AlertCircle size={14} />
              {kpis.totalVencidas} vencida{kpis.totalVencidas !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {/* KPI bar */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="bg-white border border-red-100 rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
              <AlertCircle size={16} className="text-red-600" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">Total vencido</p>
              <p className="text-lg font-display font-bold text-gray-900 tabular">{fmtMonto(kpis.totalVencidoUSD)}</p>
            </div>
          </div>
          <div className="bg-white border border-amber-100 rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
              <Clock size={16} className="text-amber-600" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">Vencen esta semana</p>
              <p className="text-lg font-display font-bold text-gray-900 tabular">{kpis.estaSemana} cuota{kpis.estaSemana !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0">
              <Users size={16} className="text-gray-600" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">Compradores en mora</p>
              <p className="text-lg font-display font-bold text-gray-900 tabular">{kpis.compradoresEnMora}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap mb-5">
        <select
          value={proyectoFilter}
          onChange={e => setProyectoFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">Todos los proyectos</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <div className="flex gap-1.5">
          {(['todas', 'vencida', 'proxima'] as const).map(s => (
            <button
              key={s}
              onClick={() => setEstadoFilter(s)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                estadoFilter === s
                  ? s === 'vencida'
                    ? 'bg-red-50 text-red-800 border-red-300'
                    : s === 'proxima'
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : 'bg-blue-50 text-blue-800 border-blue-300'
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              {s === 'todas' ? 'Todas' : s === 'vencida' ? 'Vencidas' : 'Próximas'}
            </button>
          ))}
        </div>

        {!loading && (
          <span className="text-xs text-gray-400 ml-auto">
            {filtered.length} cuota{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full bg-gray-100 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-14 text-center shadow-sm">
          <CheckCircle2 size={32} className="text-emerald-400 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            {items.length === 0
              ? 'No hay cuotas pendientes en ningún proyecto.'
              : 'No hay cuotas para los filtros seleccionados.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3 uppercase tracking-wider">Comprador</th>
                  <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3 uppercase tracking-wider">Proyecto</th>
                  <th className="text-right text-xs font-semibold text-gray-400 px-4 py-3 uppercase tracking-wider">Cuota</th>
                  <th className="text-right text-xs font-semibold text-gray-400 px-4 py-3 uppercase tracking-wider">Monto</th>
                  <th className="text-right text-xs font-semibold text-gray-400 px-4 py-3 uppercase tracking-wider">Vencimiento</th>
                  <th className="text-center text-xs font-semibold text-gray-400 px-4 py-3 uppercase tracking-wider">Mora</th>
                  <th className="text-center text-xs font-semibold text-gray-400 px-4 py-3 uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.installment_id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{item.buyer_name}</p>
                        <p className="text-xs text-gray-400">{item.buyer_phone}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/proyectos/${item.project_id}/reservas/${item.reservation_id}`}
                        className="text-blue-700 hover:text-blue-900 font-medium text-sm hover:underline"
                      >
                        {item.project_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right tabular text-gray-700 font-medium">
                      #{item.numero_cuota}
                    </td>
                    <td className="px-4 py-3 text-right tabular">
                      <span className="font-semibold text-gray-900">{fmtMonto(item.monto_usd)}</span>
                      {item.moneda === 'ARS' && (
                        <p className="text-[10px] text-gray-400">ARS {item.monto.toLocaleString('es-AR')}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 tabular">
                      {fmtFecha(item.fecha_vencimiento)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {item.dias > 0 ? (
                        <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px] font-semibold">
                          hace {item.dias}d
                        </Badge>
                      ) : item.dias === 0 ? (
                        <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px] font-semibold">
                          hoy
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-semibold">
                          en {Math.abs(item.dias)}d
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={cn(
                        'text-[10px] font-semibold border',
                        item.estado === 'vencido'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      )}>
                        {item.estado === 'vencido' ? 'Vencida' : 'Pendiente'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleMarkPaid(item)}
                        disabled={markingPaid.has(item.installment_id)}
                        className="text-xs font-semibold text-emerald-700 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        Marcar pagada
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

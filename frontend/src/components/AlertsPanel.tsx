'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, Alert } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Bell, CheckCheck, Info, AlertTriangle, AlertOctagon, X, ChevronRight } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';

function severityIcon(sev: Alert['severidad']) {
  if (sev === 'critical') return <AlertOctagon size={15} className="text-red-500 flex-shrink-0" />;
  if (sev === 'warning') return <AlertTriangle size={15} className="text-amber-500 flex-shrink-0" />;
  return <Info size={15} className="text-blue-500 flex-shrink-0" />;
}

function alertLink(alert: Alert): string | null {
  const pid = alert.project_id;
  const meta = alert.metadata as Record<string, string> | null;
  switch (alert.tipo) {
    case 'LEAD_SIN_ACTIVIDAD':
      return `/proyectos/${pid}/leads`;
    case 'UNIDAD_RESERVADA_SIN_CONVERTIR':
      return `/proyectos/${pid}/reservas`;
    case 'DESVIO_PRESUPUESTO':
      return `/proyectos/${pid}/financiero`;
    case 'OBRA_ETAPA_ATRASADA':
      return `/proyectos/${pid}/obra`;
    case 'INVERSOR_SIN_REPORTE':
      return `/proyectos/${pid}/inversores`;
    case 'CUOTA_VENCIDA':
    case 'CUOTA_PROXIMA':
      return meta?.reservation_id
        ? `/proyectos/${pid}/reservas/${meta.reservation_id}`
        : `/proyectos/${pid}/reservas`;
    default:
      return meta?.resource_id ? `/proyectos/${pid}` : null;
  }
}

export function useAlertCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const alerts = await api.getAlerts();
      setCount(alerts.filter((a) => !a.leida).length);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { count, refresh };
}

export default function AlertsPanel({
  open,
  onOpenChange,
  onRead,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRead?: () => void;
}) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getAlerts();
      setAlerts(data);
    } catch {
      toast.error('Error cargando alertas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const markRead = async (alert: Alert) => {
    try {
      await api.markAlertRead(alert.id);
      setAlerts((prev) => prev.map((a) => a.id === alert.id ? { ...a, leida: true } : a));
      onRead?.();
    } catch {
      toast.error('Error marcando alerta');
    }
  };

  const markAllRead = async () => {
    setMarking(true);
    try {
      await api.markAllAlertsRead();
      setAlerts((prev) => prev.map((a) => ({ ...a, leida: true })));
      toast.success('Todas las alertas marcadas como leídas');
      onRead?.();
    } catch {
      toast.error('Error');
    } finally {
      setMarking(false);
    }
  };

  const unreadCount = alerts.filter((a) => !a.leida).length;

  const grouped = alerts.reduce<Record<Alert['severidad'], Alert[]>>(
    (acc, a) => { acc[a.severidad].push(a); return acc; },
    { critical: [], warning: [], info: [] },
  );

  const orderedGroups: Array<{ key: Alert['severidad']; label: string }> = [
    { key: 'critical', label: 'Críticas' },
    { key: 'warning', label: 'Advertencias' },
    { key: 'info', label: 'Informativas' },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-96 p-0 flex flex-col bg-white">
        <SheetHeader className="px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-gray-900">
              <Bell size={16} className="text-blue-700" />
              Alertas
              {unreadCount > 0 && (
                <span className="ml-1 min-w-5 h-5 rounded-full bg-blue-700 text-white text-[10px] flex items-center justify-center font-bold px-1">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </SheetTitle>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                disabled={marking}
                className="flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900 font-medium disabled:opacity-50"
              >
                <CheckCheck size={13} /> Marcar todas
              </button>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full bg-gray-100 rounded-xl" />
              ))}
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center px-5">
              <Bell size={32} className="text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">Sin alertas por ahora</p>
            </div>
          ) : (
            <div className="p-4 space-y-6">
              {orderedGroups.map(({ key, label }) => {
                const group = grouped[key];
                if (group.length === 0) return null;
                return (
                  <div key={key}>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">{label}</p>
                    <div className="space-y-2">
                      {group.map((alert) => {
                        const link = alertLink(alert);
                        return (
                          <div
                            key={alert.id}
                            className={cn(
                              'relative rounded-xl border p-3 transition-all',
                              alert.leida
                                ? 'bg-white border-gray-100'
                                : key === 'critical'
                                ? 'bg-red-50 border-red-100'
                                : key === 'warning'
                                ? 'bg-amber-50 border-amber-100'
                                : 'bg-blue-50 border-blue-100',
                            )}
                          >
                            <div className="flex items-start gap-2">
                              <div className="mt-0.5">{severityIcon(alert.severidad)}</div>
                              <div className="flex-1 min-w-0">
                                <p className={cn('text-sm font-medium leading-tight', alert.leida ? 'text-gray-500' : 'text-gray-800')}>
                                  {alert.titulo}
                                </p>
                                {alert.descripcion && (
                                  <p className="text-xs text-gray-400 mt-0.5 leading-snug">{alert.descripcion}</p>
                                )}
                                <div className="flex items-center gap-3 mt-2">
                                  <span className="text-[10px] text-gray-400">
                                    {new Date(alert.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  {link && (
                                    <Link
                                      href={link}
                                      onClick={() => onOpenChange(false)}
                                      className="flex items-center gap-0.5 text-[10px] text-blue-700 hover:text-blue-900 font-medium"
                                    >
                                      Ver <ChevronRight size={10} />
                                    </Link>
                                  )}
                                </div>
                              </div>
                              {!alert.leida && (
                                <button
                                  onClick={() => markRead(alert)}
                                  className="p-1 text-gray-300 hover:text-gray-600 rounded flex-shrink-0"
                                  title="Marcar como leída"
                                >
                                  <X size={13} />
                                </button>
                              )}
                            </div>
                            {!alert.leida && (
                              <span className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-blue-700" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, Reservation } from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Printer, CheckCircle, XCircle, Loader2, ClipboardList, ExternalLink, KeyRound, Copy, Check } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';

const STATUS_CONFIG = {
  active: { label: 'Activa', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  cancelled: { label: 'Cancelada', badgeClass: 'bg-red-50 text-red-700 border-red-200' },
  converted: { label: 'Vendida', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
} as const;

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  financiacion: 'Financiación',
};

function getInitials(name: string) {
  return (
    name
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  );
}

const FILTERS = [
  { key: undefined, label: 'Todas' },
  { key: 'active', label: 'Activas' },
  { key: 'cancelled', label: 'Canceladas' },
  { key: 'converted', label: 'Convertidas' },
] as const;

interface PortalCredentials {
  email: string;
  temp_password: string;
  user_id: string;
  already_existed: boolean;
}

export default function ReservasPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isReader } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string | undefined>(undefined);

  // Confirm dialog
  const [pendingAction, setPendingAction] = useState<{
    reservation: Reservation;
    action: 'cancelled' | 'converted';
  } | null>(null);
  const [patching, setPatching] = useState(false);

  // Portal access
  const [creatingPortalFor, setCreatingPortalFor] = useState<string | null>(null);
  const [portalCredentials, setPortalCredentials] = useState<PortalCredentials | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .getReservations(id, activeFilter)
      .then(setReservations)
      .catch(() => toast.error('No se pudieron cargar las reservas'))
      .finally(() => setLoading(false));
  }, [id, activeFilter]);

  const handlePatch = async () => {
    if (!pendingAction) return;
    setPatching(true);
    try {
      await api.patchReservation(pendingAction.reservation.id, pendingAction.action);
      toast.success(
        pendingAction.action === 'converted' ? 'Convertida en venta' : 'Reserva cancelada'
      );
      setReservations((prev) =>
        prev.map((r) =>
          r.id === pendingAction.reservation.id
            ? { ...r, status: pendingAction.action }
            : r
        )
      );
      setPendingAction(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar la reserva');
    } finally {
      setPatching(false);
    }
  };

  const handleCreatePortalAccess = async (reservation: Reservation) => {
    setCreatingPortalFor(reservation.id);
    try {
      const result = await api.createPortalAccess(reservation.id);
      setPortalCredentials(result);
      if (result.already_existed) {
        toast.success('Acceso regenerado exitosamente');
      } else {
        toast.success('Acceso creado exitosamente');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear el acceso');
    } finally {
      setCreatingPortalFor(null);
    }
  };

  const handleCopyCredentials = () => {
    if (!portalCredentials) return;
    const portalUrl = `${window.location.origin}/portal/login`;
    const text = `Portal REALIA\nURL: ${portalUrl}\nEmail: ${portalCredentials.email}\nContraseña temporal: ${portalCredentials.temp_password}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const visibleReservations = reservations;

  return (
    <div className="p-6 md:p-8">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map(({ key, label }) => (
          <button
            key={label}
            onClick={() => setActiveFilter(key)}
            className={cn(
              'px-4 py-1.5 rounded-full text-sm font-medium border transition-all',
              activeFilter === key
                ? 'bg-blue-700 text-white border-blue-700'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : visibleReservations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mb-4">
            <ClipboardList size={28} className="text-blue-700" />
          </div>
          <p className="text-gray-900 font-semibold mb-2">Sin reservas</p>
          <p className="text-gray-500 text-sm max-w-xs">
            Las reservas aparecerán acá cuando se registren desde una unidad o un lead.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleReservations.map((r) => {
            const statusConf = STATUS_CONFIG[r.status] || STATUS_CONFIG.active;
            return (
              <div
                key={r.id}
                className="bg-white border border-gray-200 rounded-2xl p-4 flex items-start gap-4 group hover:border-gray-300 transition-colors shadow-sm"
              >
                <Avatar className="w-10 h-10 border border-gray-200 flex-shrink-0">
                  <AvatarFallback className="bg-blue-100 text-blue-800 text-xs font-bold">
                    {getInitials(r.buyer_name || r.buyer_phone)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-gray-900 font-semibold text-sm">
                      {r.buyer_name || r.buyer_phone}
                    </span>
                    <Badge className={cn('text-xs border', statusConf.badgeClass)}>
                      {statusConf.label}
                    </Badge>
                  </div>
                  <p className="text-gray-500 text-xs mt-0.5">
                    Unidad {r.unit_identifier} · Piso {r.unit_floor} · {r.unit_bedrooms} amb. ·{' '}
                    {r.unit_area_m2} m²
                  </p>
                  <p className="text-gray-400 text-xs mt-1">
                    {r.amount_usd ? `Seña: USD ${Number(r.amount_usd).toLocaleString('es-AR')}` : 'Sin seña registrada'}
                    {r.payment_method ? ` · ${PAYMENT_LABELS[r.payment_method] || r.payment_method}` : ''}
                    {r.signed_at
                      ? ` · ${new Date(r.signed_at).toLocaleDateString('es-AR')}`
                      : ''}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button
                    title="Ver detalle y plan de pagos"
                    onClick={() => router.push(`/proyectos/${id}/reservas/${r.id}`)}
                    className="p-2 rounded-lg text-gray-400 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                  >
                    <ExternalLink size={15} />
                  </button>
                  <button
                    title="Imprimir comprobante"
                    onClick={() =>
                      window.open(`/proyectos/${id}/reservas/${r.id}/print`, '_blank')
                    }
                    className="p-2 rounded-lg text-gray-400 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                  >
                    <Printer size={15} />
                  </button>
                  {r.status === 'converted' && !isReader && (
                    <button
                      title="Crear / regenerar acceso al portal del comprador"
                      onClick={() => handleCreatePortalAccess(r)}
                      disabled={creatingPortalFor === r.id}
                      className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
                    >
                      {creatingPortalFor === r.id ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <KeyRound size={15} />
                      )}
                    </button>
                  )}
                  {r.status === 'active' && !isReader && (
                    <>
                      <button
                        title="Convertir en venta"
                        onClick={() => setPendingAction({ reservation: r, action: 'converted' })}
                        className="p-2 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                      >
                        <CheckCircle size={15} />
                      </button>
                      <button
                        title="Cancelar reserva"
                        onClick={() => setPendingAction({ reservation: r, action: 'cancelled' })}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <XCircle size={15} />
                      </button>
                    </>
                  )}
                  {r.status === 'converted' && !isReader && (
                    <button
                      title="Cancelar venta"
                      onClick={() => setPendingAction({ reservation: r, action: 'cancelled' })}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <XCircle size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm Dialog */}
      <Dialog open={!!pendingAction} onOpenChange={(v) => !v && setPendingAction(null)}>
        <DialogContent className="sm:max-w-[380px] bg-white">
          <DialogHeader>
            <DialogTitle className="text-gray-900">
              {pendingAction?.action === 'converted'
                ? 'Convertir en venta'
                : pendingAction?.reservation.status === 'converted'
                ? 'Cancelar venta'
                : 'Cancelar reserva'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            {pendingAction?.action === 'converted'
              ? `¿Confirmar la venta de la Unidad ${pendingAction?.reservation.unit_identifier}? La unidad pasará a estado "Vendida" y se registrará el comprador.`
              : pendingAction?.reservation.status === 'converted'
              ? `¿Cancelar la venta de la Unidad ${pendingAction?.reservation.unit_identifier}? La unidad volverá a estar disponible.`
              : `¿Cancelar la reserva de la Unidad ${pendingAction?.reservation.unit_identifier}? La unidad volverá a estar disponible.`}
          </p>
          <DialogFooter className="gap-2">
            <button
              onClick={() => setPendingAction(null)}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Volver
            </button>
            <button
              onClick={handlePatch}
              disabled={patching}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg text-white transition-colors disabled:opacity-50',
                pendingAction?.action === 'converted'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-red-600 hover:bg-red-700'
              )}
            >
              {patching && <Loader2 size={14} className="animate-spin" />}
              {pendingAction?.action === 'converted' ? 'Confirmar venta' : 'Cancelar reserva'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Portal Credentials Dialog */}
      <Dialog
        open={!!portalCredentials}
        onOpenChange={(v) => { if (!v) { setPortalCredentials(null); setCopied(false); } }}
      >
        <DialogContent className="sm:max-w-[420px] bg-white">
          <DialogHeader>
            <DialogTitle className="text-gray-900 flex items-center gap-2">
              <KeyRound size={16} className="text-indigo-600" />
              {portalCredentials?.already_existed ? 'Acceso regenerado' : 'Acceso creado'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500 -mt-1">
            {portalCredentials?.already_existed
              ? 'Se generó una nueva contraseña temporal para este comprador.'
              : 'El comprador puede ingresar al portal con estas credenciales.'}
          </p>
          {portalCredentials && (
            <div className="space-y-3 mt-1">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2.5 text-sm">
                <div>
                  <span className="text-xs text-gray-400 uppercase tracking-wider block mb-0.5">URL del portal</span>
                  <span className="font-mono text-gray-700 text-xs break-all">
                    {typeof window !== 'undefined' ? `${window.location.origin}/portal/login` : '/portal/login'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-gray-400 uppercase tracking-wider block mb-0.5">Email</span>
                  <span className="font-mono text-gray-900">{portalCredentials.email}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-400 uppercase tracking-wider block mb-0.5">Contraseña temporal</span>
                  <span className="font-mono text-gray-900 font-semibold">{portalCredentials.temp_password}</span>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                El comprador deberá cambiar esta contraseña en su primer ingreso.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <button
              onClick={() => { setPortalCredentials(null); setCopied(false); }}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cerrar
            </button>
            <button
              onClick={handleCopyCredentials}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

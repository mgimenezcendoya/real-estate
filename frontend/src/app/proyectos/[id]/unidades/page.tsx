'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, Unit } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { CheckCircle2, Clock, XCircle, Loader2, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import ReservationSheet from '@/components/ReservationSheet';

const STATUS_CONFIG = {
  available: {
    label: 'Disponible',
    bg: 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle2,
  },
  reserved: {
    label: 'Reservada',
    bg: 'bg-amber-50 border-amber-200 hover:bg-amber-100',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: Clock,
  },
  sold: {
    label: 'Vendida',
    bg: 'bg-red-50 border-red-200 hover:bg-red-100',
    text: 'text-red-700',
    dot: 'bg-red-500',
    badgeClass: 'bg-red-50 text-red-700 border-red-200',
    icon: XCircle,
  },
} as const;

type UnitStatus = keyof typeof STATUS_CONFIG;

export default function UnidadesPage() {
  const { id } = useParams<{ id: string }>();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Unit | null>(null);

  // Buyer registration modal (for sold)
  const [buyerUnit, setBuyerUnit] = useState<Unit | null>(null);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerSignedAt, setBuyerSignedAt] = useState('');
  const [savingBuyer, setSavingBuyer] = useState(false);

  // Reservation sheet (for reserved)
  const [reservationUnit, setReservationUnit] = useState<Unit | null>(null);

  useEffect(() => {
    if (id) api.getUnits(id).then(setUnits).finally(() => setLoading(false));
  }, [id]);

  const byFloor = units.reduce<Record<number, Unit[]>>((acc, u) => {
    const f = u.floor ?? 0;
    (acc[f] = acc[f] || []).push(u);
    return acc;
  }, {});
  const floors = Object.keys(byFloor).map(Number).sort((a, b) => b - a);

  const handleStatusChange = async (unit: Unit, newStatus: UnitStatus) => {
    if (unit.status === newStatus || updatingId === unit.id) return;

    // Optimistic update
    const prevStatus = unit.status;
    setUnits((prev) => prev.map((u) => (u.id === unit.id ? { ...u, status: newStatus } : u)));
    setSelected((prev) => (prev?.id === unit.id ? { ...prev, status: newStatus } : prev));
    setUpdatingId(unit.id);

    try {
      await api.updateUnitStatus(unit.id, newStatus);
      toast.success(`Unidad ${unit.identifier} → ${STATUS_CONFIG[newStatus].label}`);
      if (newStatus === 'sold') {
        setBuyerUnit(unit);
        setBuyerName('');
        setBuyerPhone('');
        setBuyerSignedAt(new Date().toISOString().slice(0, 10));
      } else if (newStatus === 'reserved') {
        setReservationUnit(unit);
      }
    } catch {
      // Revert on error
      setUnits((prev) => prev.map((u) => (u.id === unit.id ? { ...u, status: prevStatus } : u)));
      setSelected((prev) => (prev?.id === unit.id ? { ...prev, status: prevStatus } : prev));
      toast.error('No se pudo actualizar el estado');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRegisterBuyer = async () => {
    if (!buyerUnit || !buyerPhone.trim()) return;
    setSavingBuyer(true);
    try {
      await api.registerBuyer(id, {
        unit_id: buyerUnit.id,
        name: buyerName.trim() || '',
        phone: buyerPhone.trim(),
        ...(buyerSignedAt ? { signed_at: buyerSignedAt } : {}),
      });
      toast.success(`Comprador registrado para unidad ${buyerUnit.identifier}`);
      setBuyerUnit(null);
    } catch {
      toast.error('No se pudo registrar el comprador');
    } finally {
      setSavingBuyer(false);
    }
  };

  const counts = {
    available: units.filter((u) => u.status === 'available').length,
    reserved: units.filter((u) => u.status === 'reserved').length,
    sold: units.filter((u) => u.status === 'sold').length,
  };

  return (
    <div className="flex h-full">
      {/* Main grid */}
      <div className="flex-1 p-6 md:p-8 overflow-auto">
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          {(Object.entries(STATUS_CONFIG) as [UnitStatus, typeof STATUS_CONFIG[UnitStatus]][]).map(([key, conf]) => (
            <div key={key} className="flex items-center gap-2 text-xs text-gray-500">
              <div className={cn('w-2.5 h-2.5 rounded-full', conf.dot)} />
              {conf.label} ({counts[key]})
            </div>
          ))}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-start gap-4">
                <Skeleton className="w-10 h-8 bg-gray-200" />
                <div className="flex-1 flex flex-wrap gap-2 pb-4 border-b border-gray-100">
                  {[1, 2, 3, 4, 5].map((j) => (
                    <Skeleton key={j} className="w-14 h-9 rounded-lg bg-gray-100" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {floors.map((floor) => (
              <div key={floor} className="flex items-start gap-4">
                <div className="w-10 pt-2.5 text-right flex-shrink-0">
                  <span className="text-xs text-gray-400 font-medium">P{floor}</span>
                </div>
                <div className="flex-1 flex flex-wrap gap-2 pb-3 border-b border-gray-100">
                  {byFloor[floor]
                    .sort((a, b) => a.identifier.localeCompare(b.identifier))
                    .map((unit) => {
                      const conf = STATUS_CONFIG[unit.status] || STATUS_CONFIG.available;
                      return (
                        <button
                          key={unit.id}
                          onClick={() => setSelected(unit)}
                          disabled={updatingId === unit.id}
                          className={cn(
                            'px-3 py-2 rounded-lg border text-xs font-semibold transition-all duration-150 min-w-[52px]',
                            conf.bg,
                            conf.text,
                            selected?.id === unit.id && 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-white',
                            updatingId === unit.id && 'opacity-50 cursor-wait'
                          )}
                        >
                          {updatingId === unit.id ? (
                            <Loader2 size={12} className="animate-spin mx-auto" />
                          ) : (
                            unit.identifier
                          )}
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Buyer Registration Dialog */}
      <Dialog open={!!buyerUnit} onOpenChange={(v) => !v && setBuyerUnit(null)}>
        <DialogContent className="sm:max-w-[400px] bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-gray-900">
              <UserPlus size={18} className="text-indigo-600" />
              Registrar comprador — Unidad {buyerUnit?.identifier}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">
                Nombre <span className="text-gray-400 font-normal normal-case">(opcional)</span>
              </label>
              <input
                type="text"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="Ej: Martín García"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">
                Teléfono <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={buyerPhone}
                onChange={(e) => setBuyerPhone(e.target.value)}
                placeholder="Ej: +54911XXXXXXXX"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">
                Fecha de firma <span className="text-gray-400 font-normal normal-case">(opcional)</span>
              </label>
              <input
                type="date"
                value={buyerSignedAt}
                onChange={(e) => setBuyerSignedAt(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <button
              onClick={() => setBuyerUnit(null)}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Omitir
            </button>
            <button
              onClick={handleRegisterBuyer}
              disabled={savingBuyer || !buyerPhone.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {savingBuyer ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              Registrar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reservation Sheet */}
      <ReservationSheet
        open={!!reservationUnit}
        onOpenChange={(v) => !v && setReservationUnit(null)}
        projectId={id}
        prefilledUnit={reservationUnit ?? undefined}
        onSuccess={() => setReservationUnit(null)}
      />

      {/* Detail Sheet */}
      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent
          side="right"
          className="w-full sm:w-[320px] border-l border-gray-200 flex flex-col p-0 bg-white"
        >
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className="text-gray-900 text-lg font-bold">
                  Unidad {selected?.identifier}
                </SheetTitle>
                {selected && (
                  <Badge className={cn('mt-1 text-xs border', STATUS_CONFIG[selected.status]?.badgeClass)}>
                    {STATUS_CONFIG[selected.status]?.label}
                  </Badge>
                )}
              </div>
            </div>
          </SheetHeader>

          {selected && (
            <div className="flex-1 overflow-auto px-6 py-4 flex flex-col">
              <div className="space-y-0 flex-1">
                {[
                  { label: 'Piso', value: selected.floor ? `Piso ${selected.floor}` : '—' },
                  { label: 'Ambientes', value: selected.bedrooms ? `${selected.bedrooms} amb.` : '—' },
                  { label: 'Superficie', value: selected.area_m2 ? `${selected.area_m2} m²` : '—' },
                  { label: 'Precio', value: selected.price_usd ? `USD ${Number(selected.price_usd).toLocaleString('es-AR')}` : '—' },
                ].map(({ label, value }, i) => (
                  <div key={label}>
                    <div className="flex justify-between py-3">
                      <span className="text-gray-500 text-sm">{label}</span>
                      <span className="text-gray-900 text-sm font-medium">{value}</span>
                    </div>
                    {i < 3 && <Separator className="bg-gray-100" />}
                  </div>
                ))}
              </div>

              {/* Status change */}
              <div className="mt-6">
                <p className="text-xs text-gray-400 mb-3 font-semibold uppercase tracking-wider">Cambiar estado</p>
                <div className="space-y-2">
                  {(Object.keys(STATUS_CONFIG) as UnitStatus[]).map((s) => {
                    const conf = STATUS_CONFIG[s];
                    const isActive = selected.status === s;
                    const isUpdating = updatingId === selected.id;
                    return (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(selected, s)}
                        disabled={isActive || isUpdating}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all',
                          isActive
                            ? cn(conf.bg, conf.text, 'border-current cursor-default')
                            : 'bg-transparent border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-900',
                          isUpdating && 'opacity-50'
                        )}
                      >
                        <div className={cn('w-2 h-2 rounded-full flex-shrink-0', isActive ? conf.dot : 'bg-gray-300')} />
                        {conf.label}
                        {isActive && <span className="ml-auto text-xs opacity-60">actual</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

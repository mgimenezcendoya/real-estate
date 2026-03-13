'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, Unit, UnitFieldHistory } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  CheckCircle2, Clock, Loader2, UserPlus,
  Pencil, Check, X, ArrowLeft, Building2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import ReservationSheet from '@/components/ReservationSheet';
import { useAuth } from '@/contexts/AuthContext';

const STATUS_CONFIG = {
  available: {
    label: 'Disponible',
    bg: 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    bar: 'bg-emerald-500',
    icon: CheckCircle2,
  },
  reserved: {
    label: 'Reservada',
    bg: 'bg-amber-50 border-amber-200 hover:bg-amber-100',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    bar: 'bg-amber-400',
    icon: Clock,
  },
  sold: {
    label: 'Vendida',
    bg: 'bg-blue-50 border-blue-200 hover:bg-blue-100',
    text: 'text-blue-700',
    dot: 'bg-blue-600',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    bar: 'bg-blue-500',
    icon: CheckCircle2,
  },
} as const;

type UnitStatus = keyof typeof STATUS_CONFIG;

function formatShort(val: number): string {
  if (val >= 1_000_000) return `USD ${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `USD ${(val / 1_000).toFixed(0)}K`;
  return `USD ${val.toLocaleString('es-AR')}`;
}

function formatFull(val: number): string {
  return `USD ${Number(val).toLocaleString('es-AR')}`;
}

export default function UnidadesPage() {
  const { id } = useParams<{ id: string }>();
  const { isReader } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Unit | null>(null);

  // Direct sale modal
  const [saleUnit, setSaleUnit] = useState<Unit | null>(null);
  const [saleForm, setSaleForm] = useState({ buyer_name: '', buyer_phone: '', buyer_email: '', amount_usd: '', payment_method: 'transferencia', signed_at: new Date().toISOString().slice(0, 10) });
  const [savingSale, setSavingSale] = useState(false);

  // Reservation sheet
  const [reservationUnit, setReservationUnit] = useState<Unit | null>(null);

  // Inline edit
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [savingField, setSavingField] = useState(false);

  // History
  const [history, setHistory] = useState<UnitFieldHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (id) api.getUnits(id).then(setUnits).finally(() => setLoading(false));
  }, [id]);

  const byFloor = units.reduce<Record<number, Unit[]>>((acc, u) => {
    const f = u.floor ?? 0;
    (acc[f] = acc[f] || []).push(u);
    return acc;
  }, {});
  const floors = Object.keys(byFloor).map(Number).sort((a, b) => b - a);

  const counts = {
    available: units.filter((u) => u.status === 'available').length,
    reserved: units.filter((u) => u.status === 'reserved').length,
    sold: units.filter((u) => u.status === 'sold').length,
  };

  const byBedrooms = units.reduce<Record<string, { total: number; available: number }>>((acc, u) => {
    const key = u.bedrooms ? `${u.bedrooms} amb.` : 'Otros';
    if (!acc[key]) acc[key] = { total: 0, available: 0 };
    acc[key].total++;
    if (u.status === 'available') acc[key].available++;
    return acc;
  }, {});

  const revenue = {
    total: units.reduce((s, u) => s + (Number(u.price_usd) || 0), 0),
    reserved: units.filter((u) => u.status === 'reserved').reduce((s, u) => s + (Number(u.price_usd) || 0), 0),
    sold: units.filter((u) => u.status === 'sold').reduce((s, u) => s + (Number(u.price_usd) || 0), 0),
  };

  const handleSelectUnit = (unit: Unit) => {
    setSelected(unit);
    setEditingField(null);
    setHistory([]);
    setLoadingHistory(true);
    api.getUnitHistory(unit.id).then(setHistory).catch(() => {}).finally(() => setLoadingHistory(false));
  };

  const handleStatusChange = async (unit: Unit, newStatus: UnitStatus) => {
    if (unit.status === newStatus || updatingId === unit.id) return;
    const prevStatus = unit.status;
    setUnits((prev) => prev.map((u) => (u.id === unit.id ? { ...u, status: newStatus } : u)));
    setSelected((prev) => (prev?.id === unit.id ? { ...prev, status: newStatus } : prev));
    setUpdatingId(unit.id);
    try {
      if (newStatus === 'sold') {
        setUnits((prev) => prev.map((u) => (u.id === unit.id ? { ...u, status: prevStatus } : u)));
        setSelected((prev) => (prev?.id === unit.id ? { ...prev, status: prevStatus } : prev));
        setSaleUnit(unit);
        setSaleForm({ buyer_name: '', buyer_phone: '', buyer_email: '', amount_usd: unit.price_usd ? String(unit.price_usd) : '', payment_method: 'transferencia', signed_at: new Date().toISOString().slice(0, 10) });
      } else {
        await api.updateUnitStatus(unit.id, newStatus);
        toast.success(`Unidad ${unit.identifier} → ${STATUS_CONFIG[newStatus].label}`);
        if (newStatus === 'reserved') setReservationUnit(unit);
      }
    } catch {
      setUnits((prev) => prev.map((u) => (u.id === unit.id ? { ...u, status: prevStatus } : u)));
      setSelected((prev) => (prev?.id === unit.id ? { ...prev, status: prevStatus } : prev));
      toast.error('No se pudo actualizar el estado');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDirectSale = async () => {
    if (!saleUnit || !saleForm.buyer_phone.trim()) return;
    setSavingSale(true);
    try {
      await api.createDirectSale(id, {
        unit_id: saleUnit.id,
        buyer_name: saleForm.buyer_name || undefined,
        buyer_phone: saleForm.buyer_phone,
        buyer_email: saleForm.buyer_email || undefined,
        amount_usd: saleForm.amount_usd ? parseFloat(saleForm.amount_usd) : undefined,
        payment_method: saleForm.payment_method || undefined,
        signed_at: saleForm.signed_at || undefined,
      });
      toast.success(`Venta registrada — Unidad ${saleUnit.identifier}`);
      setSaleUnit(null);
      api.getUnits(id).then(setUnits);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo registrar la venta');
    } finally {
      setSavingSale(false);
    }
  };

  const handleSaveField = async (field: string) => {
    if (!selected) return;
    const num = parseFloat(editValue);
    if (isNaN(num) || num < 0) return toast.error('Valor inválido');
    setSavingField(true);
    try {
      const updated = await api.updateUnit(selected.id, { [field]: num });
      setUnits((prev) => prev.map((u) => u.id === selected.id ? { ...u, ...updated } : u));
      setSelected((prev) => prev ? { ...prev, ...updated } : prev);
      setEditingField(null);
      toast.success('Unidad actualizada');
      api.getUnitHistory(selected.id).then(setHistory).catch(() => {});
    } catch {
      toast.error('No se pudo guardar el cambio');
    } finally {
      setSavingField(false);
    }
  };

  // ── Right panel: Summary ──────────────────────────────────────────────────────
  const SummaryPanel = () => (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-gray-100">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Panel</p>
        <h3 className="text-base font-bold text-gray-900 mt-0.5">Resumen del proyecto</h3>
      </div>

      <div className="px-5 py-5 space-y-6">
        {/* Status breakdown */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Estado</p>
          <div className="space-y-2.5">
            {(Object.entries(STATUS_CONFIG) as [UnitStatus, typeof STATUS_CONFIG[UnitStatus]][]).map(([key, conf]) => {
              const count = counts[key];
              const pct = units.length ? Math.round((count / units.length) * 100) : 0;
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className={cn('w-2 h-2 rounded-full', conf.dot)} />
                      <span className="text-xs font-medium text-gray-700">{conf.label}</span>
                    </div>
                    <span className="text-xs tabular font-semibold text-gray-900">{count} <span className="text-gray-400 font-normal">({pct}%)</span></span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all duration-500', conf.bar)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Separator className="bg-gray-100" />

        {/* Tipología */}
        {Object.keys(byBedrooms).length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Por tipología</p>
            <div className="space-y-1.5">
              {Object.entries(byBedrooms)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([tipo, data]) => (
                  <div key={tipo} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-gray-50 border border-gray-100">
                    <span className="text-xs font-medium text-gray-700">{tipo}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-emerald-600 font-semibold">{data.available} disp.</span>
                      <span className="text-gray-300">·</span>
                      <span className="text-xs text-gray-500">{data.total} total</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        <Separator className="bg-gray-100" />

        {/* Revenue */}
        {revenue.total > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Revenue potencial</p>
            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-gray-500">Total portafolio</span>
                <span className="text-xs font-bold text-gray-800 tabular">{formatShort(revenue.total)}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-gray-500">Reservado</span>
                <span className="text-xs font-semibold text-amber-700 tabular">{formatShort(revenue.reserved)}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-gray-500">Vendido</span>
                <span className="text-xs font-semibold text-emerald-700 tabular">{formatShort(revenue.sold)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Hint */}
        <div className="flex items-start gap-2 px-3 py-3 bg-blue-50/50 rounded-xl border border-blue-100/60">
          <Building2 size={13} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-blue-700/80 leading-relaxed">Hacé clic en una unidad para ver su detalle y cambiar su estado.</p>
        </div>
      </div>
    </div>
  );

  // ── Right panel: Unit detail ──────────────────────────────────────────────────
  const DetailPanel = () => {
    if (!selected) return null;
    const FIELD_LABELS: Record<string, string> = { price_usd: 'Precio', area_m2: 'Superficie', bedrooms: 'Ambientes', floor: 'Piso' };
    const FIELD_SUFFIX: Record<string, string> = { price_usd: '', area_m2: ' m²', bedrooms: ' amb.', floor: '' };
    const fmt = (val: number | null, field: string) => {
      if (val == null) return '—';
      if (field === 'price_usd') return `USD ${Number(val).toLocaleString('es-AR')}`;
      return `${val}${FIELD_SUFFIX[field] ?? ''}`;
    };

    return (
      <>
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <button
                onClick={() => setSelected(null)}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 mb-2 transition-colors"
              >
                <ArrowLeft size={11} /> Resumen
              </button>
              <h3 className="text-lg font-bold text-gray-900">Unidad {selected.identifier}</h3>
              <Badge className={cn('mt-1 text-xs border', STATUS_CONFIG[selected.status]?.badgeClass)}>
                {STATUS_CONFIG[selected.status]?.label}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 flex flex-col gap-5">
          {/* Fields */}
          <div className="space-y-0">
            {[
              { label: 'Piso', field: 'floor', raw: selected.floor, display: selected.floor ? `Piso ${selected.floor}` : '—', suffix: '' },
              { label: 'Ambientes', field: 'bedrooms', raw: selected.bedrooms, display: selected.bedrooms ? `${selected.bedrooms} amb.` : '—', suffix: '' },
              { label: 'Superficie', field: 'area_m2', raw: selected.area_m2, display: selected.area_m2 ? `${selected.area_m2} m²` : '—', suffix: ' m²' },
              { label: 'Precio', field: 'price_usd', raw: selected.price_usd, display: selected.price_usd ? formatFull(Number(selected.price_usd)) : '—', suffix: '' },
            ].map(({ label, field, raw, display, suffix }, i) => (
              <div key={label}>
                <div className="flex justify-between items-center py-3">
                  <span className="text-gray-500 text-sm">{label}</span>
                  {!isReader && editingField === field ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveField(field);
                          if (e.key === 'Escape') setEditingField(null);
                        }}
                        autoFocus
                        className="w-24 text-right border border-blue-300 rounded-lg px-2 py-1 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                      {suffix && <span className="text-xs text-gray-400">{suffix.trim()}</span>}
                      <button onClick={() => handleSaveField(field)} disabled={savingField} className="p-1 rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors">
                        {savingField ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      </button>
                      <button onClick={() => setEditingField(null)} className="p-1 rounded-md text-gray-400 hover:bg-gray-100 transition-colors">
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group/field">
                      <span className="text-gray-900 text-sm font-medium">{display}</span>
                      {!isReader && (
                        <button
                          onClick={() => { setEditingField(field); setEditValue(String(raw ?? '')); }}
                          className="opacity-0 group-hover/field:opacity-100 p-1 rounded-md text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-all"
                        >
                          <Pencil size={11} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {i < 3 && <Separator className="bg-gray-100" />}
              </div>
            ))}
          </div>

          {/* Status change */}
          {!isReader && (
            <div>
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
                        isActive ? cn(conf.bg, conf.text, 'border-current cursor-default') : 'bg-transparent border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-900',
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
          )}

          {/* History */}
          {(loadingHistory || history.length > 0) && (
            <div>
              <p className="text-xs text-gray-400 mb-3 font-semibold uppercase tracking-wider">Historial</p>
              {loadingHistory ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => <div key={i} className="h-8 bg-gray-100 rounded-lg animate-pulse" />)}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {history.map((h) => (
                    <div key={h.id} className="flex items-start justify-between gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-700">{FIELD_LABELS[h.field] ?? h.field}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {new Date(h.changed_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-gray-400 line-through">{fmt(h.old_value, h.field)}</p>
                        <p className="text-xs font-semibold text-gray-900">{fmt(h.new_value, h.field)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="flex h-full">

      {/* ── Left: unit grid ── */}
      <div className={cn(
        'flex-1 p-6 md:p-8 overflow-auto min-w-0',
        // On mobile: hide grid when a unit is selected (panel takes over)
        selected && 'hidden md:block'
      )}>
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
          <div className="space-y-5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-start gap-4">
                <Skeleton className="w-10 h-8 bg-gray-200 flex-shrink-0" />
                <div className="flex flex-wrap gap-2.5">
                  {[1, 2, 3].map((j) => (
                    <Skeleton key={j} className="w-[112px] h-[86px] rounded-xl bg-gray-100" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {floors.map((floor) => (
              <div key={floor} className="flex items-start gap-4">
                {/* Floor label */}
                <div className="w-10 pt-3 text-right flex-shrink-0">
                  <span className="text-xs text-gray-400 font-medium">P{floor}</span>
                </div>
                {/* Unit cards */}
                <div className="flex-1 flex flex-wrap gap-2.5 pb-4 border-b border-gray-100">
                  {byFloor[floor]
                    .sort((a, b) => a.identifier.localeCompare(b.identifier))
                    .map((unit) => {
                      const conf = STATUS_CONFIG[unit.status] || STATUS_CONFIG.available;
                      const isSelected = selected?.id === unit.id;
                      return (
                        <button
                          key={unit.id}
                          onClick={() => handleSelectUnit(unit)}
                          disabled={updatingId === unit.id}
                          className={cn(
                            'w-[112px] p-3 rounded-xl border text-left transition-all duration-150 flex flex-col gap-0.5',
                            conf.bg,
                            isSelected
                              ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-white shadow-sm'
                              : 'hover:shadow-sm',
                            updatingId === unit.id && 'opacity-50 cursor-wait'
                          )}
                        >
                          {updatingId === unit.id ? (
                            <Loader2 size={14} className="animate-spin mx-auto my-4" />
                          ) : (
                            <>
                              <span className={cn('text-sm font-bold leading-tight', conf.text)}>
                                {unit.identifier}
                              </span>
                              <div className="mt-1 space-y-0.5">
                                {unit.bedrooms ? (
                                  <p className="text-[11px] text-gray-500">{unit.bedrooms} amb.</p>
                                ) : null}
                                {unit.area_m2 ? (
                                  <p className="text-[11px] text-gray-500">{unit.area_m2} m²</p>
                                ) : null}
                                {unit.price_usd ? (
                                  <p className={cn('text-[11px] font-semibold mt-1', conf.text)}>
                                    {formatShort(Number(unit.price_usd))}
                                  </p>
                                ) : null}
                              </div>
                            </>
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

      {/* ── Right panel — always visible on desktop, full-width on mobile when selected ── */}
      <div className={cn(
        'flex flex-col border-l border-gray-200 bg-white overflow-hidden flex-shrink-0',
        'w-full md:w-[280px]',
        // On mobile: only show when unit is selected
        selected ? 'flex' : 'hidden md:flex'
      )}>
        {selected ? <DetailPanel /> : <SummaryPanel />}
      </div>

      {/* Direct Sale Dialog */}
      <Dialog open={!!saleUnit} onOpenChange={(v) => !v && setSaleUnit(null)}>
        <DialogContent className="sm:max-w-[420px] bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-gray-900">
              <UserPlus size={18} className="text-blue-700" />
              Registrar venta — Unidad {saleUnit?.identifier}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Nombre</label>
                <input type="text" value={saleForm.buyer_name} onChange={(e) => setSaleForm(f => ({ ...f, buyer_name: e.target.value }))}
                  placeholder="Martín García" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Teléfono <span className="text-red-500">*</span></label>
                <input type="tel" value={saleForm.buyer_phone} onChange={(e) => setSaleForm(f => ({ ...f, buyer_phone: e.target.value }))}
                  placeholder="+54911..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Email</label>
              <input type="email" value={saleForm.buyer_email} onChange={(e) => setSaleForm(f => ({ ...f, buyer_email: e.target.value }))}
                placeholder="comprador@ejemplo.com" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Monto (USD)</label>
                <input type="number" value={saleForm.amount_usd} onChange={(e) => setSaleForm(f => ({ ...f, amount_usd: e.target.value }))}
                  placeholder="0" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Método de pago</label>
                <select value={saleForm.payment_method} onChange={(e) => setSaleForm(f => ({ ...f, payment_method: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="transferencia">Transferencia</option>
                  <option value="cheque">Cheque</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="financiacion">Financiación</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Fecha de firma</label>
              <input type="date" value={saleForm.signed_at} onChange={(e) => setSaleForm(f => ({ ...f, signed_at: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <button onClick={() => setSaleUnit(null)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
              Cancelar
            </button>
            <button onClick={handleDirectSale} disabled={savingSale || !saleForm.buyer_phone.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {savingSale ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              Registrar venta
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
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { api, Reservation, Unit } from '@/lib/api';
import { toast } from 'sonner';
import { ClipboardList, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  prefilledUnit?: {
    id: string;
    identifier: string;
    floor: number;
    bedrooms: number;
    area_m2: number;
    price_usd: number;
  };
  prefilledLead?: { id: string; name: string; phone: string };
  onSuccess: (r: Reservation) => void;
}

const inputClass =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400';

const labelClass = 'text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block';

export default function ReservationSheet({
  open,
  onOpenChange,
  projectId,
  prefilledUnit,
  prefilledLead,
  onSuccess,
}: Props) {
  const [availableUnits, setAvailableUnits] = useState<Unit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState('');

  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [amountUsd, setAmountUsd] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [signedAt, setSignedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset form when opened
  useEffect(() => {
    if (!open) return;
    setBuyerName(prefilledLead?.name || '');
    setBuyerPhone(prefilledLead?.phone || '');
    setBuyerEmail('');
    setAmountUsd('');
    setPaymentMethod('');
    setSignedAt(new Date().toISOString().slice(0, 10));
    setNotes('');
    setSelectedUnitId('');

    if (prefilledLead) {
      api.getUnits(projectId)
        .then((units) => setAvailableUnits(units.filter((u) => u.status === 'available')))
        .catch(() => toast.error('No se pudieron cargar las unidades'));
    }
  }, [open, prefilledLead, projectId]);

  const unitForDisplay = prefilledUnit;

  const handleSubmit = async () => {
    const unitId = prefilledUnit?.id || selectedUnitId;
    if (!unitId || !buyerPhone.trim()) return;

    setSaving(true);
    try {
      const reservation = await api.createReservation(projectId, {
        unit_id: unitId,
        lead_id: prefilledLead?.id ?? null,
        buyer_name: buyerName.trim() || undefined,
        buyer_phone: buyerPhone.trim(),
        buyer_email: buyerEmail.trim() || undefined,
        amount_usd: amountUsd ? parseFloat(amountUsd) : undefined,
        payment_method: paymentMethod || undefined,
        notes: notes.trim() || undefined,
        signed_at: signedAt || undefined,
      });

      toast.success(`Reserva registrada — Unidad ${reservation.unit_identifier}`);
      onSuccess(reservation);

      const printUrl = `/proyectos/${projectId}/reservas/${reservation.id}/print`;
      const win = window.open(printUrl, '_blank');
      if (!win) {
        toast.info('Comprobante listo', {
          action: { label: 'Abrir', onClick: () => window.open(printUrl) },
        });
      }

      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo registrar la reserva');
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = !saving && buyerPhone.trim().length > 0 && (prefilledUnit?.id || selectedUnitId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:w-[480px] border-l border-gray-200 flex flex-col p-0 bg-white"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-gray-100">
          <SheetTitle className="flex items-center gap-2 text-gray-900 text-base font-bold">
            <ClipboardList size={18} className="text-indigo-600" />
            Nueva reserva
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
          {/* UNIDAD */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Unidad</p>
            {unitForDisplay ? (
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 space-y-1">
                <p className="font-semibold text-gray-900">Unidad {unitForDisplay.identifier}</p>
                <p className="text-gray-500 text-xs">
                  Piso {unitForDisplay.floor} · {unitForDisplay.bedrooms} amb. · {unitForDisplay.area_m2} m²
                </p>
                <p className="text-indigo-600 font-semibold text-xs">
                  USD {Number(unitForDisplay.price_usd).toLocaleString('es-AR')}
                </p>
              </div>
            ) : (
              <div>
                <label className={labelClass}>
                  Unidad disponible <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedUnitId}
                  onChange={(e) => setSelectedUnitId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Seleccionar unidad…</option>
                  {availableUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      Unidad {u.identifier} — Piso {u.floor} · {u.bedrooms} amb. · {u.area_m2} m²
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <Separator className="bg-gray-100" />

          {/* COMPRADOR */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Comprador</p>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Nombre</label>
                <input
                  type="text"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  placeholder="Ej: Martín García"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Teléfono <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={buyerPhone}
                  onChange={(e) => setBuyerPhone(e.target.value)}
                  placeholder="Ej: +54911XXXXXXXX"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Email <span className="text-gray-400 font-normal normal-case">(opcional)</span>
                </label>
                <input
                  type="email"
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  placeholder="Ej: martin@email.com"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <Separator className="bg-gray-100" />

          {/* CONDICIONES */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Condiciones</p>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>
                  Monto seña (USD) <span className="text-gray-400 font-normal normal-case">(opcional)</span>
                </label>
                <input
                  type="number"
                  value={amountUsd}
                  onChange={(e) => setAmountUsd(e.target.value)}
                  placeholder="0"
                  min="0"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Método de pago <span className="text-gray-400 font-normal normal-case">(opcional)</span>
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className={inputClass}
                >
                  <option value="">— Sin especificar —</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="cheque">Cheque</option>
                  <option value="financiacion">Financiación</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Fecha de firma</label>
                <input
                  type="date"
                  value={signedAt}
                  onChange={(e) => setSignedAt(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <Separator className="bg-gray-100" />

          {/* NOTAS */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Notas</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Observaciones adicionales…"
              className={inputClass + ' resize-none'}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-4 flex gap-3 bg-white">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <ClipboardList size={15} />
            )}
            Registrar y descargar PDF →
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, Reservation } from '@/lib/api';

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  financiacion: 'Financiación',
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatUSD(val: number | null) {
  if (val === null || val === undefined) return '—';
  return `USD ${Number(val).toLocaleString('es-AR')}`;
}

export default function PrintPage() {
  const { id, reservationId } = useParams<{ id: string; reservationId: string }>();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!reservationId) return;
    api
      .getReservation(reservationId)
      .then(setReservation)
      .finally(() => setLoading(false));
  }, [reservationId]);

  useEffect(() => {
    if (!loading && reservation) {
      const t = setTimeout(() => window.print(), 500);
      return () => clearTimeout(t);
    }
  }, [loading, reservation]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500 text-sm">
        Cargando comprobante…
      </div>
    );
  }

  if (!reservation) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500 text-sm">
        Reserva no encontrada.
      </div>
    );
  }

  const r = reservation;
  const shortId = r.id.replace(/-/g, '').slice(-8).toUpperCase();

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

      {/* Close button — hidden when printing */}
      <div className="no-print flex justify-end p-4 border-b border-gray-100">
        <button
          onClick={() => window.close()}
          className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cerrar ventana
        </button>
      </div>

      {/* Comprobante */}
      <div className="max-w-[700px] mx-auto p-8 text-gray-900">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-2xl font-black text-blue-700 tracking-tight">REALIA</h1>
            <p className="text-xs text-gray-400 mt-0.5">Sistema de gestión inmobiliaria</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-gray-900">Comprobante de Reserva</p>
            <p className="text-xs text-gray-500 mt-0.5">N°: {shortId}</p>
            <p className="text-xs text-gray-500">
              Fecha: {formatDate(r.created_at)}
            </p>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-0 border border-gray-200 rounded-xl overflow-hidden">
          {/* Proyecto */}
          <section className="px-6 py-4 border-b border-gray-200">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Proyecto</p>
            <p className="font-semibold text-gray-900">{r.project_name}</p>
            {r.project_address && <p className="text-sm text-gray-600">{r.project_address}</p>}
          </section>

          {/* Unidad */}
          <section className="px-6 py-4 border-b border-gray-200">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Unidad</p>
            <p className="font-semibold text-gray-900">
              Unidad {r.unit_identifier} · Piso {r.unit_floor} · {r.unit_bedrooms} amb.
            </p>
            <p className="text-sm text-gray-600">
              Superficie: {r.unit_area_m2} m² · Precio: {formatUSD(r.unit_price_usd)}
            </p>
          </section>

          {/* Reservante */}
          <section className="px-6 py-4 border-b border-gray-200">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Reservante</p>
            <p className="font-semibold text-gray-900">{r.buyer_name || '—'}</p>
            <p className="text-sm text-gray-600">
              {r.buyer_phone}
              {r.buyer_email ? ` · ${r.buyer_email}` : ''}
            </p>
          </section>

          {/* Condiciones */}
          <section className="px-6 py-4 border-b border-gray-200">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Condiciones</p>
            <p className="text-sm text-gray-800">
              Seña: <span className="font-semibold">{formatUSD(r.amount_usd)}</span>
              {r.payment_method
                ? ` · ${PAYMENT_LABELS[r.payment_method] || r.payment_method}`
                : ''}
              {r.signed_at ? ` · Fecha firma: ${formatDate(r.signed_at)}` : ''}
            </p>
          </section>

          {/* Notas */}
          {r.notes && (
            <section className="px-6 py-4 border-b border-gray-200">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Notas</p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{r.notes}</p>
            </section>
          )}

          {/* Firmas */}
          <section className="px-6 py-6">
            <div className="flex justify-between gap-8">
              <div className="flex-1">
                <div className="border-b border-gray-400 mb-1 h-8" />
                <p className="text-xs text-gray-500 text-center">Firma comprador</p>
              </div>
              <div className="flex-1">
                <div className="border-b border-gray-400 mb-1 h-8" />
                <p className="text-xs text-gray-500 text-center">Firma vendedor</p>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 text-center mt-4">
              Documento sin validez legal por sí solo. Sujeto a contrato formal de reserva.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}

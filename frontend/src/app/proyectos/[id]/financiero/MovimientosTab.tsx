'use client';

import { useState, useEffect } from 'react';
import { api, Movimiento, Factura } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, FileText, Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import FacturaModal from '@/components/FacturaModal';

interface Props {
  projectId: string;
  isReader: boolean;
}

function formatUSD(v: number | null) {
  if (v == null) return '—';
  if (Math.abs(v) >= 1_000_000) return `USD ${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `USD ${(v / 1_000).toFixed(0)}K`;
  return `USD ${v.toLocaleString('es-AR')}`;
}

function fmtFecha(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: '2-digit' });
}

export default function MovimientosTab({ projectId, isReader }: Props) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [filterTipo, setFilterTipo] = useState<'cobro' | 'egreso' | ''>('');
  const [filterSinComprobante, setFilterSinComprobante] = useState(false);
  const [filterDesde, setFilterDesde] = useState('');
  const [filterHasta, setFilterHasta] = useState('');

  // Edit cobro modal
  const [editingCobro, setEditingCobro] = useState<Movimiento | null>(null);
  const [cobroForm, setCobroForm] = useState({ fecha_pago: '', monto_pagado: '', metodo_pago: 'transferencia' });
  const [savingCobro, setSavingCobro] = useState(false);

  // Factura modal (for egresos + adding comprobante to cobros)
  const [showFacturaModal, setShowFacturaModal] = useState(false);
  const [editingFactura, setEditingFactura] = useState<Factura | null>(null);
  const [prefilledPaymentRecordId, setPrefilledPaymentRecordId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getMovimientos(projectId, {
        tipo: filterTipo || undefined,
        sin_comprobante: filterSinComprobante || undefined,
        desde: filterDesde || undefined,
        hasta: filterHasta || undefined,
      });
      setMovimientos(data);
    } catch {
      toast.error('Error cargando movimientos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId, filterTipo, filterSinComprobante, filterDesde, filterHasta]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteCobro = async (m: Movimiento) => {
    if (!confirm('¿Eliminar este cobro?')) return;
    try {
      await api.deletePaymentRecord(m.id);
      toast.success('Cobro eliminado');
      load();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Error'); }
  };

  const handleDeleteEgreso = async (m: Movimiento) => {
    if (!confirm('¿Eliminar este egreso?')) return;
    try {
      await api.deleteFactura(m.id);
      toast.success('Egreso eliminado');
      load();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Error'); }
  };

  const openEditCobro = (m: Movimiento) => {
    setEditingCobro(m);
    setCobroForm({
      fecha_pago: m.fecha ?? '',
      monto_pagado: m.monto != null ? String(m.monto) : '',
      metodo_pago: m.metodo_pago || 'transferencia',
    });
  };

  const saveCobro = async () => {
    if (!editingCobro) return;
    const monto = parseFloat(cobroForm.monto_pagado);
    if (!cobroForm.monto_pagado || isNaN(monto)) return toast.error('Monto inválido');
    setSavingCobro(true);
    try {
      await api.updatePaymentRecord(editingCobro.id, {
        fecha_pago: cobroForm.fecha_pago,
        monto_pagado: monto,
        metodo_pago: cobroForm.metodo_pago,
      });
      toast.success('Cobro actualizado');
      setEditingCobro(null);
      load();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Error'); }
    finally { setSavingCobro(false); }
  };

  const openAddComprobante = (m: Movimiento) => {
    setEditingFactura(null);
    setPrefilledPaymentRecordId(m.id);
    setShowFacturaModal(true);
  };

  const openNewEgreso = () => {
    setEditingFactura(null);
    setPrefilledPaymentRecordId(null);
    setShowFacturaModal(true);
  };

  const openEditEgreso = async (m: Movimiento) => {
    try {
      const facturas = await api.getFacturas(projectId);
      const f = facturas.find((f) => f.id === m.id) ?? null;
      if (!f) { toast.error('No se encontró la factura'); return; }
      setEditingFactura(f);
      setPrefilledPaymentRecordId(null);
      setShowFacturaModal(true);
    } catch { toast.error('Error cargando factura'); }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none"
            value={filterTipo}
            onChange={(e) => { setFilterTipo(e.target.value as 'cobro' | 'egreso' | ''); }}
          >
            <option value="">Todos</option>
            <option value="cobro">Cobros</option>
            <option value="egreso">Egresos</option>
          </select>
          <input
            type="date"
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none text-gray-700"
            value={filterDesde}
            onChange={(e) => setFilterDesde(e.target.value)}
            title="Desde"
            placeholder="Desde"
          />
          <input
            type="date"
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none text-gray-700"
            value={filterHasta}
            onChange={(e) => setFilterHasta(e.target.value)}
            title="Hasta"
            placeholder="Hasta"
          />
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={filterSinComprobante}
              onChange={(e) => { setFilterSinComprobante(e.target.checked); }}
              className="rounded"
            />
            Sin comprobante
          </label>
        </div>
        {!isReader && (
          <div className="flex items-center gap-2">
            <button
              onClick={openNewEgreso}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-700 text-white hover:bg-blue-800 font-medium"
            >
              <Plus size={13} /> + Agregar
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full bg-gray-100" />)}</div>
      ) : movimientos.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
          <FileText size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Sin movimientos registrados.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Fecha</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Tipo</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Contraparte</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Concepto</th>
                <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Monto</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Comprobante</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => (
                <tr key={`${m.tipo}-${m.id}`} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {m.fecha ? fmtFecha(m.fecha) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={cn('text-[10px]',
                      m.tipo === 'cobro'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                    )}>
                      {m.tipo === 'cobro' ? 'Cobro' : 'Egreso'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-800 font-medium truncate max-w-[160px]">{m.contraparte || '—'}</p>
                    {m.unidad && <p className="text-[10px] text-gray-400">{m.unidad}</p>}
                    {m.etapa_nombre && <p className="text-[10px] text-gray-400">{m.etapa_nombre}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {m.tipo === 'cobro' ? (
                      <span>
                        {m.concepto === 'anticipo' ? 'Anticipo' : m.concepto === 'saldo' ? 'Saldo' : 'Cuota'}
                        {m.numero_cuota != null && ` #${m.numero_cuota}`}
                      </span>
                    ) : (
                      <span className="text-gray-500">{m.budget_categoria || '—'}</span>
                    )}
                  </td>
                  <td className={cn('px-4 py-3 text-right font-medium whitespace-nowrap',
                    m.tipo === 'cobro' ? 'text-emerald-700' : 'text-red-600'
                  )}>
                    {m.tipo === 'cobro' ? '+' : '−'}{formatUSD(m.monto)}
                  </td>
                  <td className="px-4 py-3">
                    {m.tipo === 'cobro' ? (
                      m.comprobante_id ? (
                        <Badge className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 gap-1">
                          <Receipt size={9} />
                          {m.comprobante_numero || 'Vinculado'}
                        </Badge>
                      ) : (
                        <span className="text-xs text-gray-400">— Sin comprobante</span>
                      )
                    ) : (
                      m.comprobante_numero ? (
                        <span className="text-xs text-gray-600">{m.comprobante_numero}</span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {!isReader && m.tipo === 'cobro' && (
                        <>
                          {!m.comprobante_id && (
                            <button
                              onClick={() => openAddComprobante(m)}
                              className="p-1.5 text-gray-400 hover:text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
                              title="Agregar comprobante"
                            >
                              <Plus size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => openEditCobro(m)}
                            className="p-1.5 text-gray-400 hover:text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDeleteCobro(m)}
                            className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                      {!isReader && m.tipo === 'egreso' && (
                        <>
                          <button
                            onClick={() => openEditEgreso(m)}
                            className="p-1.5 text-gray-400 hover:text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDeleteEgreso(m)}
                            className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit cobro modal */}
      {editingCobro && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Editar cobro</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha de pago</label>
                <input
                  type="date"
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={cobroForm.fecha_pago}
                  onChange={(e) => setCobroForm((f) => ({ ...f, fecha_pago: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Monto (USD)</label>
                <input
                  type="number"
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={cobroForm.monto_pagado}
                  onChange={(e) => setCobroForm((f) => ({ ...f, monto_pagado: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Método de pago</label>
                <select
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  value={cobroForm.metodo_pago}
                  onChange={(e) => setCobroForm((f) => ({ ...f, metodo_pago: e.target.value }))}
                >
                  {['transferencia', 'efectivo', 'cheque', 'cripto', 'otro'].map((m) => (
                    <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditingCobro(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={saveCobro}
                disabled={savingCobro}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl hover:opacity-90 disabled:opacity-50"
              >
                {savingCobro ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FacturaModal for egresos and adding comprobante to cobros */}
      {showFacturaModal && (
        <FacturaModal
          open={showFacturaModal}
          projectId={projectId}
          editingFactura={editingFactura}
          onClose={() => { setShowFacturaModal(false); setEditingFactura(null); setPrefilledPaymentRecordId(null); }}
          onSuccess={() => { setShowFacturaModal(false); setEditingFactura(null); setPrefilledPaymentRecordId(null); load(); }}
          defaultCategoria={prefilledPaymentRecordId ? 'ingreso' : 'egreso'}
          prefilledPaymentRecordId={prefilledPaymentRecordId}
        />
      )}
    </div>
  );
}

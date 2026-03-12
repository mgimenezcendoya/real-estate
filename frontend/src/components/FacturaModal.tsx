'use client';

import { useEffect, useState } from 'react';
import { api, Factura, ObraEtapa, BudgetItem, LinkablePayment } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { FileText, ExternalLink, X, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface FacturaModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  projectId: string;
  editingFactura?: Factura | null;
  prefilledEtapaId?: string;
  prefilledEtapaNombre?: string;
}

const FACTURA_EMPTY = {
  tipo: 'otro' as string,
  numero_factura: '',
  categoria: 'egreso' as string,
  proveedor_nombre: '',
  supplier_id: null as string | null,
  cuit_emisor: '',
  moneda: 'ARS' as string,
  monto_total: '' as string | number,
  iva_pct: 21 as number | string,
  monto_neto: '' as string | number,
  monto_usd: '' as string | number,
  budget_id: null as string | null,
  etapa_id: null as string | null,
  fecha_emision: new Date().toISOString().split('T')[0],
  fecha_vencimiento: '',
  file_url: null as string | null,
  notas: '',
  estado: 'cargada' as string,
  payment_record_id: null as string | null,
  reservation_id: null as string | null,
};

export default function FacturaModal({
  open,
  onClose,
  onSuccess,
  projectId,
  editingFactura,
  prefilledEtapaId,
}: FacturaModalProps) {
  const [form, setForm] = useState<typeof FACTURA_EMPTY>({ ...FACTURA_EMPTY });
  const [saving, setSaving] = useState(false);
  const [etapas, setEtapas] = useState<ObraEtapa[]>([]);
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [linkablePayments, setLinkablePayments] = useState<LinkablePayment[]>([]);
  const [paymentSearch, setPaymentSearch] = useState('');
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [tipoCambio, setTipoCambio] = useState<string>('');

  // Load etapas, budget items, and suggested exchange rate when modal opens
  useEffect(() => {
    if (!open) return;
    api.getObra(projectId).then(data => setEtapas(data.etapas ?? [])).catch(() => {});
    api.getBudget(projectId).then(setBudgetItems).catch(() => {});
    api.getExchangeRates().then(rates => {
      const blue = rates.find(r => r.tipo === 'blue');
      if (blue?.venta) setTipoCambio(String(blue.venta));
    }).catch(() => {});
  }, [open, projectId]);

  // Pre-fill etapa if provided
  useEffect(() => {
    if (prefilledEtapaId && open) {
      setForm(f => ({ ...f, etapa_id: prefilledEtapaId }));
    }
  }, [prefilledEtapaId, open]);

  // Initialize form when editing or resetting
  useEffect(() => {
    if (editingFactura) {
      setForm({
        tipo: editingFactura.tipo || 'otro',
        numero_factura: editingFactura.numero_factura || '',
        categoria: editingFactura.categoria || 'egreso',
        proveedor_nombre: editingFactura.proveedor_nombre || '',
        supplier_id: editingFactura.supplier_id || null,
        cuit_emisor: editingFactura.cuit_emisor || '',
        moneda: editingFactura.moneda || 'ARS',
        monto_total: editingFactura.monto_total || '',
        iva_pct: editingFactura.iva_pct ?? 21,
        monto_neto: editingFactura.monto_neto || '',
        monto_usd: editingFactura.monto_usd || '',
        budget_id: editingFactura.budget_id || null,
        etapa_id: editingFactura.etapa_id || null,
        fecha_emision: editingFactura.fecha_emision || new Date().toISOString().split('T')[0],
        fecha_vencimiento: editingFactura.fecha_vencimiento || '',
        file_url: editingFactura.file_url || null,
        notas: editingFactura.notas || '',
        estado: editingFactura.estado || 'cargada',
        payment_record_id: editingFactura.payment_record_id || null,
        reservation_id: editingFactura.reservation_id || null,
      });
    } else {
      setForm({ ...FACTURA_EMPTY, fecha_emision: new Date().toISOString().split('T')[0] });
    }
  }, [editingFactura, open]);

  // Auto-calculate monto_neto from total and IVA
  useEffect(() => {
    const total = parseFloat(String(form.monto_total));
    const iva = parseFloat(String(form.iva_pct));
    if (!isNaN(total) && !isNaN(iva) && iva >= 0) {
      const neto = total / (1 + iva / 100);
      setForm(f => ({ ...f, monto_neto: Math.round(neto * 100) / 100 }));
    }
  }, [form.monto_total, form.iva_pct]);

  // Auto-calculate monto_usd from total and exchange rate
  useEffect(() => {
    const total = parseFloat(String(form.monto_total));
    if (!isNaN(total) && total > 0) {
      if (form.moneda === 'USD') {
        setForm(f => ({ ...f, monto_usd: total }));
      } else {
        const tc = parseFloat(tipoCambio);
        if (!isNaN(tc) && tc > 0) {
          setForm(f => ({ ...f, monto_usd: Math.round(total / tc * 100) / 100 }));
        }
      }
    }
  }, [form.monto_total, form.moneda, tipoCambio]);

  const searchLinkablePayments = async (q: string) => {
    setLoadingPayments(true);
    try {
      const results = await api.getLinkablePayments(projectId, q || undefined);
      setLinkablePayments(results);
    } catch {
      // silently fail
    } finally {
      setLoadingPayments(false);
    }
  };

  const handlePdfUpload = async (file: File) => {
    if (!file) return;
    setUploadingPdf(true);
    try {
      const { file_url } = await api.uploadFacturaPdf(projectId, file);
      setForm(f => ({ ...f, file_url }));
      toast.success('PDF subido correctamente');
    } catch {
      toast.error('Error subiendo el PDF');
    } finally {
      setUploadingPdf(false);
    }
  };

  async function handleSave() {
    if (!form.monto_total || !form.fecha_emision) {
      toast.error('Total y fecha de emisión son obligatorios');
      return;
    }
    setSaving(true);
    try {
      const data = {
        ...form,
        tipo: form.tipo as 'A' | 'B' | 'C' | 'recibo' | 'otro',
        categoria: form.categoria as 'egreso' | 'ingreso',
        moneda: form.moneda as 'ARS' | 'USD',
        estado: form.estado as 'cargada' | 'aprobada' | 'vinculada' | 'pagada',
        monto_total: parseFloat(String(form.monto_total)),
        monto_neto: form.monto_neto ? parseFloat(String(form.monto_neto)) : null,
        monto_usd: form.monto_usd ? parseFloat(String(form.monto_usd)) : null,
        iva_pct: form.iva_pct ? parseFloat(String(form.iva_pct)) : null,
        numero_factura: form.numero_factura || null,
        fecha_vencimiento: form.fecha_vencimiento || null,
      };
      if (editingFactura) {
        await api.patchFactura(editingFactura.id, data);
        toast.success('Entrada actualizada');
      } else {
        await api.createFactura(projectId, data);
        toast.success('Entrada creada');
      }
      onSuccess();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingFactura ? 'Editar entrada' : 'Nueva entrada'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">

          {/* BLOQUE 1: Tipo de comprobante */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Tipo</label>
              <select
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                value={form.tipo}
                onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
              >
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="recibo">Recibo</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Número</label>
              <input
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                value={form.numero_factura}
                onChange={e => setForm(f => ({ ...f, numero_factura: e.target.value }))}
                placeholder="0001-00012345"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Categoría</label>
              <select
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none"
                value={form.categoria}
                onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
              >
                <option value="egreso">Egreso</option>
                <option value="ingreso">Ingreso</option>
              </select>
            </div>
          </div>

          {/* BLOQUE 2: Proveedor */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Proveedor</label>
              <input
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                value={form.proveedor_nombre}
                onChange={e => setForm(f => ({ ...f, proveedor_nombre: e.target.value }))}
                placeholder="Nombre proveedor"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">CUIT emisor</label>
              <input
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                value={form.cuit_emisor}
                onChange={e => setForm(f => ({ ...f, cuit_emisor: e.target.value }))}
                placeholder="20-12345678-9"
              />
            </div>
          </div>

          {/* BLOQUE 3: Importe */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Moneda</label>
              <select
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none"
                value={form.moneda}
                onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))}
              >
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Total *</label>
              <input
                type="number"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                value={form.monto_total}
                onChange={e => setForm(f => ({ ...f, monto_total: e.target.value }))}
                placeholder="0"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">IVA %</label>
              <input
                type="number"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                value={form.iva_pct}
                onChange={e => setForm(f => ({ ...f, iva_pct: e.target.value }))}
                placeholder="21"
                min="0"
                step="0.5"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Monto neto (calculado)</label>
              <input
                type="number"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 bg-gray-50"
                value={form.monto_neto}
                onChange={e => setForm(f => ({ ...f, monto_neto: e.target.value }))}
                placeholder="0"
                min="0"
                step="0.01"
              />
            </div>
            {form.moneda === 'ARS' ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">TC USD/ARS <span className="text-gray-400 font-normal">(blue sugerido)</span></label>
                  <input
                    type="number"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                    value={tipoCambio}
                    onChange={e => setTipoCambio(e.target.value)}
                    placeholder="1200"
                    min="1"
                    step="1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Equivalente USD</label>
                  <input
                    type="number"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 bg-gray-50"
                    value={form.monto_usd}
                    onChange={e => setForm(f => ({ ...f, monto_usd: e.target.value }))}
                    placeholder="0"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Equivalente USD</label>
                <input
                  type="number"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none bg-gray-50"
                  value={form.monto_usd}
                  readOnly
                  placeholder="0"
                />
              </div>
            )}
          </div>

          {/* BLOQUE 4: Clasificación presupuestaria */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Categoría presupuesto</label>
              <select
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none"
                value={form.budget_id ?? ''}
                onChange={e => setForm(f => ({ ...f, budget_id: e.target.value || null }))}
              >
                <option value="">Sin categoría</option>
                {budgetItems.map(b => (
                  <option key={b.id} value={b.id}>{b.categoria}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Etapa de obra</label>
              <select
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none"
                value={form.etapa_id ?? ''}
                onChange={e => setForm(f => ({ ...f, etapa_id: e.target.value || null }))}
              >
                <option value="">Sin etapa (gasto general)</option>
                {etapas.map(e => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          {/* BLOQUE 5: Fechas y estado */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Fecha emisión *</label>
              <input
                type="date"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                value={form.fecha_emision}
                onChange={e => setForm(f => ({ ...f, fecha_emision: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Fecha vencimiento</label>
              <input
                type="date"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                value={form.fecha_vencimiento}
                onChange={e => setForm(f => ({ ...f, fecha_vencimiento: e.target.value }))}
              />
            </div>
          </div>

          {/* Estado */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Estado</label>
            <select
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none"
              value={form.estado}
              onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}
            >
              <option value="cargada">Cargada</option>
              <option value="aprobada">Aprobada</option>
              <option value="vinculada">Vinculada</option>
              <option value="pagada">Pagada</option>
            </select>
          </div>

          {/* PDF upload */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Archivo PDF</label>
            <div className="space-y-2">
              <input
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                id="factura-modal-pdf-input"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handlePdfUpload(file);
                  e.target.value = '';
                }}
              />
              <div className="flex items-center gap-2">
                <label
                  htmlFor="factura-modal-pdf-input"
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors flex-shrink-0',
                    uploadingPdf && 'opacity-50 pointer-events-none',
                  )}
                >
                  <FileText size={14} className="text-gray-400" />
                  {uploadingPdf ? 'Subiendo...' : 'Subir PDF'}
                </label>
                {form.file_url && (
                  <a
                    href={form.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-700 hover:underline truncate"
                  >
                    <ExternalLink size={12} />
                    Ver PDF
                  </a>
                )}
                {form.file_url && (
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, file_url: null }))}
                    className="ml-auto p-1 text-gray-300 hover:text-red-500 rounded transition-colors"
                    title="Quitar PDF"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Notas</label>
            <textarea
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 resize-none"
              rows={2}
              value={form.notas}
              onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              placeholder="Observaciones opcionales"
            />
          </div>

          {/* BLOQUE 6: Vinculación a pago (solo si categoria=ingreso) */}
          {form.categoria === 'ingreso' && (
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 block">
                Vincular a pago registrado
              </label>
              <input
                type="text"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                placeholder="Buscar comprador..."
                value={paymentSearch}
                onChange={e => {
                  setPaymentSearch(e.target.value);
                  searchLinkablePayments(e.target.value);
                }}
                onFocus={() => { if (!linkablePayments.length) searchLinkablePayments(''); }}
              />
              {loadingPayments && (
                <p className="text-xs text-gray-400 px-1">Buscando...</p>
              )}
              {linkablePayments.length > 0 && (
                <div className="border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50 max-h-48 overflow-y-auto min-w-[320px]">
                  {linkablePayments.map(pr => {
                    const isSelected = pr.kind === 'payment_record'
                      ? form.payment_record_id === pr.id
                      : form.reservation_id === pr.id;
                    return (
                      <button
                        key={`${pr.kind}-${pr.id}`}
                        type="button"
                        onClick={() => {
                          if (pr.kind === 'payment_record') {
                            setForm(f => ({ ...f, payment_record_id: f.payment_record_id === pr.id ? null : pr.id, reservation_id: null }));
                          } else {
                            setForm(f => ({ ...f, reservation_id: f.reservation_id === pr.id ? null : pr.id, payment_record_id: null }));
                          }
                        }}
                        className={cn(
                          'w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors',
                          isSelected ? 'bg-blue-50 text-blue-800' : 'hover:bg-gray-50 text-gray-700',
                        )}
                      >
                        <span className="font-medium">{pr.buyer_name || 'Comprador'}</span>
                        <span className="text-gray-400">
                          {pr.kind === 'payment_record'
                            ? `Cuota #${pr.numero_cuota} · ${pr.moneda} ${Number(pr.monto).toLocaleString('es-AR')} · ${new Date(pr.fecha).toLocaleDateString('es-AR')}`
                            : `Venta directa · ${pr.moneda} ${Number(pr.monto).toLocaleString('es-AR')} · ${new Date(pr.fecha).toLocaleDateString('es-AR')}`
                          }
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {(form.payment_record_id || form.reservation_id) && (
                <p className="text-xs text-blue-700 font-medium px-1 flex items-center gap-1">
                  Pago vinculado
                  <button
                    type="button"
                    className="ml-1 text-gray-400 hover:text-red-500"
                    onClick={() => setForm(f => ({ ...f, payment_record_id: null, reservation_id: null }))}
                  >
                    (quitar)
                  </button>
                </p>
              )}
            </div>
          )}

        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={saving || !form.monto_total || !form.fecha_emision}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {editingFactura ? 'Guardar cambios' : 'Crear entrada'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

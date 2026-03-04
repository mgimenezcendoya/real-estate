'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, Investor, InvestorReport, InvestorReportPreview } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Send, Eye, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';

function formatUSD(v: number) {
  if (v >= 1_000_000) return `USD ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `USD ${(v / 1_000).toFixed(0)}K`;
  return `USD ${v.toLocaleString('es-AR')}`;
}

const INVESTOR_EMPTY: Omit<Investor, 'id' | 'created_at'> = {
  nombre: '',
  email: null,
  telefono: null,
  monto_aportado_usd: null,
  fecha_aporte: null,
  porcentaje_participacion: null,
};

export default function InversoresPage() {
  const { id } = useParams<{ id: string }>();
  const { isReader } = useAuth();
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [reports, setReports] = useState<InvestorReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<InvestorReportPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);

  // Report form
  const [repTitle, setRepTitle] = useState('');
  const [repDesde, setRepDesde] = useState('');
  const [repHasta, setRepHasta] = useState('');

  // Investor modal
  const [showModal, setShowModal] = useState(false);
  const [editingInvestor, setEditingInvestor] = useState<Investor | null>(null);
  const [form, setForm] = useState<typeof INVESTOR_EMPTY>(INVESTOR_EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [inv, reps] = await Promise.all([
        api.getInvestors(id),
        api.getInvestorReportHistory(id),
      ]);
      setInvestors(inv);
      setReports(reps);
    } catch {
      toast.error('Error cargando inversores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const openNew = () => {
    setEditingInvestor(null);
    setForm(INVESTOR_EMPTY);
    setShowModal(true);
  };

  const openEdit = (inv: Investor) => {
    setEditingInvestor(inv);
    setForm({
      nombre: inv.nombre,
      email: inv.email,
      telefono: inv.telefono,
      monto_aportado_usd: inv.monto_aportado_usd,
      fecha_aporte: inv.fecha_aporte,
      porcentaje_participacion: inv.porcentaje_participacion,
    });
    setShowModal(true);
  };

  const saveInvestor = async () => {
    if (!id || !form.nombre) return toast.error('Nombre requerido');
    setSaving(true);
    try {
      if (editingInvestor) {
        await api.patchInvestor(id, editingInvestor.id, form);
        toast.success('Inversor actualizado');
      } else {
        await api.createInvestor(id, form);
        toast.success('Inversor agregado');
      }
      setShowModal(false);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const deleteInvestor = async (inv: Investor) => {
    if (!id) return;
    if (!confirm(`¿Eliminar inversor "${inv.nombre}"?`)) return;
    try {
      await api.deleteInvestor(id, inv.id);
      toast.success('Inversor eliminado');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  };

  const loadPreview = async () => {
    if (!id) return;
    setLoadingPreview(true);
    try {
      const p = await api.previewInvestorReport(id);
      setPreview(p);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error cargando preview');
    } finally {
      setLoadingPreview(false);
    }
  };

  const sendReport = async () => {
    if (!id) return;
    if (!confirm('¿Enviar reporte a todos los inversores con teléfono?')) return;
    setSending(true);
    try {
      const res = await api.sendInvestorReport(id, {
        titulo: repTitle || undefined,
        periodo_desde: repDesde || undefined,
        periodo_hasta: repHasta || undefined,
      });
      toast.success(`Reporte enviado a ${res.enviado_a} inversor(es)`);
      await load();
      setPreview(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al enviar');
    } finally {
      setSending(false);
    }
  };

  const totalAportado = investors.reduce((s, inv) => s + (inv.monto_aportado_usd || 0), 0);
  const totalParticipacion = investors.reduce((s, inv) => s + (inv.porcentaje_participacion || 0), 0);

  return (
    <div className="p-6 md:p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Portal de Inversores</h2>
          {investors.length > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">
              {investors.length} inversor(es) · {formatUSD(totalAportado)} aportados · {totalParticipacion.toFixed(1)}% participación total
            </p>
          )}
        </div>
        {!isReader && (
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700"
          >
            <Plus size={15} /> Inversor
          </button>
        )}
      </div>

      {/* Investor cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
              <Skeleton className="h-5 w-32 bg-gray-200" />
              <Skeleton className="h-4 w-24 bg-gray-100" />
              <Skeleton className="h-4 w-20 bg-gray-100" />
            </div>
          ))}
        </div>
      ) : investors.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
          <p className="text-gray-400 text-sm">Sin inversores registrados. Hacé clic en &ldquo;+ Inversor&rdquo; para empezar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {investors.map((inv) => (
            <div key={inv.id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:border-indigo-200 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center flex-shrink-0">
                  <span className="text-indigo-700 text-sm font-bold">{inv.nombre.charAt(0).toUpperCase()}</span>
                </div>
                {!isReader && (
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(inv)} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => deleteInvestor(inv)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
              <h3 className="font-semibold text-gray-900 text-sm mb-1">{inv.nombre}</h3>
              {inv.email && <p className="text-xs text-gray-500">{inv.email}</p>}
              {inv.telefono && <p className="text-xs text-gray-500">{inv.telefono}</p>}
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {inv.porcentaje_participacion != null && (
                  <Badge className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200">
                    {inv.porcentaje_participacion}%
                  </Badge>
                )}
                {inv.monto_aportado_usd != null && (
                  <span className="text-xs font-medium text-gray-700">{formatUSD(inv.monto_aportado_usd)}</span>
                )}
                {inv.fecha_aporte && (
                  <span className="text-xs text-gray-400">
                    {new Date(inv.fecha_aporte + 'T12:00:00').toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Separator />

      {/* Report section */}
      {!isReader && <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Envío de Reporte</h3>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Título del reporte</label>
              <input
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
                value={repTitle}
                onChange={(e) => setRepTitle(e.target.value)}
                placeholder="Reporte Trimestral Q1 2026"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Período desde</label>
              <input type="date" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400" value={repDesde} onChange={(e) => setRepDesde(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Período hasta</label>
              <input type="date" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400" value={repHasta} onChange={(e) => setRepHasta(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadPreview}
              disabled={loadingPreview}
              className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium disabled:opacity-50"
            >
              <Eye size={15} /> {loadingPreview ? 'Cargando...' : 'Previsualizar'}
            </button>
            <button
              onClick={sendReport}
              disabled={sending || investors.length === 0}
              className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              <Send size={15} /> {sending ? 'Enviando...' : 'Enviar a todos'}
            </button>
          </div>

          {preview && (
            <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
              <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">Preview del reporte</p>
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: preview.html }}
              />
            </div>
          )}
        </div>
      </div>}

      {/* Report history */}
      {reports.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Historial de reportes</h3>
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            {reports.map((rep, i) => (
              <div key={rep.id} className={cn('flex items-center justify-between px-5 py-4', i > 0 && 'border-t border-gray-50')}>
                <div>
                  <p className="text-sm font-medium text-gray-800">{rep.titulo}</p>
                  {(rep.periodo_desde || rep.periodo_hasta) && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {rep.periodo_desde} — {rep.periodo_hasta}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {rep.enviado_at ? (
                    <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Enviado</Badge>
                  ) : (
                    <Badge className="text-[10px] bg-gray-100 text-gray-500 border-gray-200">Borrador</Badge>
                  )}
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock size={11} />
                    {new Date(rep.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Investor modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingInvestor ? 'Editar inversor' : 'Nuevo inversor'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Nombre *</label>
              <input
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Nombre completo"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Email</label>
                <input
                  type="email"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
                  value={form.email || ''}
                  onChange={(e) => setForm({ ...form, email: e.target.value || null })}
                  placeholder="email@ejemplo.com"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Teléfono</label>
                <input
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
                  value={form.telefono || ''}
                  onChange={(e) => setForm({ ...form, telefono: e.target.value || null })}
                  placeholder="+549..."
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Monto aportado (USD)</label>
                <input
                  type="number"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
                  value={form.monto_aportado_usd ?? ''}
                  onChange={(e) => setForm({ ...form, monto_aportado_usd: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="0.00"
                  min="0"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Participación (%)</label>
                <input
                  type="number"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
                  value={form.porcentaje_participacion ?? ''}
                  onChange={(e) => setForm({ ...form, porcentaje_participacion: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="0.00"
                  min="0"
                  max="100"
                  step="0.01"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Fecha de aporte</label>
              <input
                type="date"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
                value={form.fecha_aporte || ''}
                onChange={(e) => setForm({ ...form, fecha_aporte: e.target.value || null })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 rounded-lg border border-gray-200 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={saveInvestor}
                disabled={saving}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Guardando...' : editingInvestor ? 'Actualizar' : 'Agregar'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

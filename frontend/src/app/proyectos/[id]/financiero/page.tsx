'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, FinancialSummary, BudgetItem, Expense, Factura, CashFlowRow, LinkablePayment, ObraEtapa } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { DollarSign, TrendingDown, TrendingUp, BarChart2, Plus, Pencil, Trash2, X, FileText, Receipt, ArrowUpCircle, ArrowDownCircle, ExternalLink } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';

function formatUSD(v: number) {
  if (Math.abs(v) >= 1_000_000) return `USD ${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `USD ${(v / 1_000).toFixed(0)}K`;
  return `USD ${v.toLocaleString('es-AR')}`;
}

function KpiCard({
  label,
  value,
  icon: Icon,
  iconClass,
  loading,
  highlight,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  iconClass: string;
  loading?: boolean;
  highlight?: 'green' | 'red';
}) {
  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <Skeleton className="h-4 w-24 bg-gray-200" />
          <Skeleton className="w-9 h-9 rounded-lg bg-gray-100" />
        </div>
        <Skeleton className="h-8 w-20 bg-gray-200" />
      </div>
    );
  }
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:border-blue-200 hover:shadow-md transition-all">
      <div className="flex items-start justify-between mb-4">
        <p className="text-gray-500 text-sm font-medium">{label}</p>
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', iconClass)}>
          <Icon size={17} />
        </div>
      </div>
      <p className={cn('text-3xl font-bold', highlight === 'green' ? 'text-emerald-600' : highlight === 'red' ? 'text-red-500' : 'text-gray-900')}>
        {value}
      </p>
    </div>
  );
}

const EXPENSE_EMPTY: Omit<Expense, 'id' | 'created_at' | 'categoria'> = {
  budget_id: null,
  proveedor: null,
  descripcion: '',
  monto_usd: null,
  monto_ars: null,
  fecha: new Date().toISOString().slice(0, 10),
  comprobante_url: null,
};

const FACTURA_EMPTY = {
  tipo: 'otro' as Factura['tipo'],
  numero_factura: '',
  proveedor_nombre: '',
  cuit_emisor: '',
  fecha_emision: new Date().toISOString().slice(0, 10),
  fecha_vencimiento: '',
  monto_neto: '',
  iva_pct: '21',
  monto_total: '',
  moneda: 'ARS' as 'USD' | 'ARS',
  categoria: 'egreso' as 'egreso' | 'ingreso',
  file_url: '',
  estado: 'cargada' as Factura['estado'],
  notas: '',
  crear_gasto: false,
  gasto_descripcion: '',
  gasto_budget_id: '',
  payment_record_id: '',
};

function fmtMes(mes: string) {
  const [y, m] = mes.split('-');
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${months[parseInt(m) - 1]} ${y}`;
}

export default function FinancieroPage() {
  const { id } = useParams<{ id: string }>();
  const { isReader } = useAuth();
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [budget, setBudget] = useState<BudgetItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipoCambio, setTipoCambio] = useState('');
  const [savingTC, setSavingTC] = useState(false);

  // Filters (expenses)
  const [filterCat, setFilterCat] = useState('');
  const [filterDesde, setFilterDesde] = useState('');
  const [filterHasta, setFilterHasta] = useState('');

  // Expense modal
  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [form, setForm] = useState<typeof EXPENSE_EMPTY>(EXPENSE_EMPTY);
  const [saving, setSaving] = useState(false);

  // Budget modal
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetItem | null>(null);
  const [budgetForm, setBudgetForm] = useState({ categoria: '', descripcion: '', monto_usd: '', etapa_id: '' });
  const [savingBudget, setSavingBudget] = useState(false);
  const [etapas, setEtapas] = useState<ObraEtapa[]>([]);

  // Facturas
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loadingFacturas, setLoadingFacturas] = useState(false);
  const [showFacturaModal, setShowFacturaModal] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [linkablePayments, setLinkablePayments] = useState<LinkablePayment[]>([]);
  const [paymentSearch, setPaymentSearch] = useState('');
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [editingFactura, setEditingFactura] = useState<Factura | null>(null);
  const [facturaForm, setFacturaForm] = useState<typeof FACTURA_EMPTY>(FACTURA_EMPTY);
  const [savingFactura, setSavingFactura] = useState(false);
  const [facturaFilterCat, setFacturaFilterCat] = useState('');
  const [facturaFilterProveedor, setFacturaFilterProveedor] = useState('');

  // Cash flow
  const [cashFlow, setCashFlow] = useState<CashFlowRow[]>([]);
  const [loadingCF, setLoadingCF] = useState(false);
  const defaultDesde = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 2);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const defaultHasta = () => {
    const d = new Date();
    d.setMonth(d.getMonth() + 12);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const [cfDesde, setCfDesde] = useState<string>(defaultDesde());
  const [cfHasta, setCfHasta] = useState<string>(defaultHasta());

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [s, b, e] = await Promise.all([
        api.getFinancialSummary(id),
        api.getBudget(id),
        api.getExpenses(id),
      ]);
      setSummary(s);
      setBudget(b);
      setExpenses(e);
      setTipoCambio(String(s.tipo_cambio));
    } catch {
      toast.error('Error cargando datos financieros');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    if (id) api.getObra(id).then((d) => setEtapas(d.etapas)).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (cashFlow.length === 0) return;
    loadCashFlow(cfDesde, cfHasta);
  }, [cfDesde, cfHasta]);

  const loadExpenses = async () => {
    if (!id) return;
    try {
      const e = await api.getExpenses(id, {
        categoria: filterCat || undefined,
        fecha_desde: filterDesde || undefined,
        fecha_hasta: filterHasta || undefined,
      });
      setExpenses(e);
    } catch {
      toast.error('Error filtrando gastos');
    }
  };

  const saveTipoCambio = async () => {
    if (!id) return;
    const val = parseFloat(tipoCambio);
    if (isNaN(val) || val <= 0) return toast.error('Tipo de cambio inválido');
    setSavingTC(true);
    try {
      await api.patchFinancialsConfig(id, val);
      toast.success('Tipo de cambio actualizado');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setSavingTC(false);
    }
  };

  const openNew = () => {
    setEditingExpense(null);
    setForm(EXPENSE_EMPTY);
    setShowModal(true);
  };

  const openEdit = (exp: Expense) => {
    setEditingExpense(exp);
    setForm({
      budget_id: exp.budget_id,
      proveedor: exp.proveedor,
      descripcion: exp.descripcion,
      monto_usd: exp.monto_usd,
      monto_ars: exp.monto_ars,
      fecha: exp.fecha,
      comprobante_url: exp.comprobante_url,
    });
    setShowModal(true);
  };

  const saveExpense = async () => {
    if (!id || !form.descripcion || !form.fecha) return toast.error('Descripción y fecha son requeridos');
    setSaving(true);
    try {
      if (editingExpense) {
        await api.patchExpense(id, editingExpense.id, form);
        toast.success('Gasto actualizado');
      } else {
        await api.createExpense(id, form);
        toast.success('Gasto creado');
      }
      setShowModal(false);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const deleteExpense = async (exp: Expense) => {
    if (!id) return;
    if (!confirm(`¿Eliminar gasto "${exp.descripcion}"?`)) return;
    try {
      await api.deleteExpense(id, exp.id);
      toast.success('Gasto eliminado');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  };

  const openNewBudget = () => {
    setEditingBudget(null);
    setBudgetForm({ categoria: '', descripcion: '', monto_usd: '', etapa_id: '' });
    setShowBudgetModal(true);
  };

  const openEditBudget = (item: BudgetItem) => {
    setEditingBudget(item);
    setBudgetForm({
      categoria: item.categoria,
      descripcion: item.descripcion || '',
      monto_usd: item.monto_usd != null ? String(item.monto_usd) : '',
      etapa_id: item.etapa_id || '',
    });
    setShowBudgetModal(true);
  };

  const deleteBudgetItem = async (item: BudgetItem) => {
    if (!id) return;
    if (!confirm(`¿Eliminar la categoría "${item.categoria}"? Los gastos asociados quedarán sin categoría.`)) return;
    try {
      await api.deleteBudget(id, item.id);
      toast.success('Categoría eliminada');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  };

  const saveBudget = async () => {
    if (!id || !budgetForm.categoria) return toast.error('Categoría requerida');
    setSavingBudget(true);
    const data = {
      categoria: budgetForm.categoria,
      descripcion: budgetForm.descripcion || null,
      monto_usd: budgetForm.monto_usd ? parseFloat(budgetForm.monto_usd) : null,
      monto_ars: null,
      etapa_id: budgetForm.etapa_id || null,
    };
    try {
      if (editingBudget) {
        await api.patchBudget(id, editingBudget.id, data);
        toast.success('Categoría actualizada');
      } else {
        await api.upsertBudget(id, data);
        toast.success('Categoría creada');
      }
      setShowBudgetModal(false);
      setEditingBudget(null);
      setBudgetForm({ categoria: '', descripcion: '', monto_usd: '', etapa_id: '' });
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setSavingBudget(false);
    }
  };

  const loadFacturas = async () => {
    if (!id) return;
    setLoadingFacturas(true);
    try {
      const f = await api.getFacturas(id, {
        categoria: facturaFilterCat || undefined,
        proveedor: facturaFilterProveedor || undefined,
      });
      setFacturas(f);
    } catch { toast.error('Error cargando facturas'); }
    finally { setLoadingFacturas(false); }
  };

  const loadCashFlow = async (desde?: string, hasta?: string) => {
    if (!id) return;
    setLoadingCF(true);
    try { setCashFlow(await api.getCashFlow(id, desde ?? cfDesde, hasta ?? cfHasta)); }
    catch { toast.error('Error cargando flujo de caja'); }
    finally { setLoadingCF(false); }
  };

  const openNewFactura = () => {
    setEditingFactura(null);
    setFacturaForm(FACTURA_EMPTY);
    setPaymentSearch('');
    setLinkablePayments([]);
    setShowFacturaModal(true);
  };

  const openEditFactura = (f: Factura) => {
    setEditingFactura(f);
    setFacturaForm({
      tipo: f.tipo,
      numero_factura: f.numero_factura || '',
      proveedor_nombre: f.proveedor_nombre || '',
      cuit_emisor: f.cuit_emisor || '',
      fecha_emision: f.fecha_emision,
      fecha_vencimiento: f.fecha_vencimiento || '',
      monto_neto: f.monto_neto != null ? String(f.monto_neto) : '',
      iva_pct: f.iva_pct != null ? String(f.iva_pct) : '21',
      monto_total: String(f.monto_total),
      moneda: f.moneda,
      categoria: f.categoria,
      file_url: f.file_url || '',
      estado: f.estado,
      notas: f.notas || '',
      crear_gasto: false,
      gasto_descripcion: '',
      gasto_budget_id: '',
      payment_record_id: f.payment_record_id || '',
    });
    setPaymentSearch('');
    setLinkablePayments([]);
    if (f.categoria === 'ingreso') {
      searchLinkablePayments('');
    }
    setShowFacturaModal(true);
  };

  const searchLinkablePayments = async (q: string) => {
    if (!id) return;
    setLoadingPayments(true);
    try {
      const results = await api.getLinkablePayments(id as string, q || undefined);
      setLinkablePayments(results);
    } catch {
      // silently fail
    } finally {
      setLoadingPayments(false);
    }
  };

  const handlePdfUpload = async (file: File) => {
    if (!file || !id) return;
    setUploadingPdf(true);
    try {
      const { file_url } = await api.uploadFacturaPdf(id as string, file);
      setFacturaForm(f => ({ ...f, file_url }));
      toast.success('PDF subido correctamente');
    } catch {
      toast.error('Error subiendo el PDF');
    } finally {
      setUploadingPdf(false);
    }
  };

  const saveFactura = async () => {
    if (!id) return;
    if (!facturaForm.fecha_emision || !facturaForm.monto_total) {
      toast.error('Fecha de emisión y monto total son requeridos');
      return;
    }
    setSavingFactura(true);
    try {
      const data = {
        ...facturaForm,
        numero_factura: facturaForm.numero_factura || null,
        proveedor_nombre: facturaForm.proveedor_nombre || null,
        cuit_emisor: facturaForm.cuit_emisor || null,
        fecha_vencimiento: facturaForm.fecha_vencimiento || null,
        monto_neto: facturaForm.monto_neto ? parseFloat(facturaForm.monto_neto) : null,
        iva_pct: facturaForm.iva_pct ? parseFloat(facturaForm.iva_pct) : null,
        monto_total: parseFloat(facturaForm.monto_total),
        file_url: facturaForm.file_url || null,
        notas: facturaForm.notas || null,
        gasto_budget_id: facturaForm.gasto_budget_id || undefined,
        gasto_descripcion: facturaForm.gasto_descripcion || undefined,
        payment_record_id: facturaForm.payment_record_id || null,
      };
      if (editingFactura) {
        await api.patchFactura(editingFactura.id, data);
        toast.success('Factura actualizada');
      } else {
        await api.createFactura(id, data);
        toast.success(data.crear_gasto ? 'Factura creada y gasto registrado' : 'Factura creada');
      }
      setShowFacturaModal(false);
      loadFacturas();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setSavingFactura(false);
    }
  };

  const deleteFactura = async (f: Factura) => {
    if (!confirm(`¿Eliminar factura ${f.numero_factura || f.id.slice(0, 8)}?`)) return;
    try {
      await api.deleteFactura(f.id);
      toast.success('Factura eliminada');
      loadFacturas();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Error'); }
  };

  const categorias = [...budget.map((b) => b.categoria), 'Pagos de Obra'];

  return (
    <div className="p-6 md:p-8">
      <Tabs defaultValue="resumen" onValueChange={(v) => {
        if (v === 'facturas' && facturas.length === 0 && !loadingFacturas) loadFacturas();
        if (v === 'cashflow' && cashFlow.length === 0 && !loadingCF) loadCashFlow();
      }}>
      <TabsList className="mb-6">
        <TabsTrigger value="resumen">Resumen</TabsTrigger>
        <TabsTrigger value="facturas">Facturas</TabsTrigger>
        <TabsTrigger value="cashflow">Flujo de Caja</TabsTrigger>
      </TabsList>

      <TabsContent value="resumen" className="space-y-8">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Dashboard Financiero</h2>
        {!isReader && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">USD/ARS</label>
            <input
              className="w-28 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500"
              value={tipoCambio}
              onChange={(e) => setTipoCambio(e.target.value)}
              type="number"
              min="1"
            />
            <button
              onClick={saveTipoCambio}
              disabled={savingTC}
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-700 text-white font-medium hover:bg-blue-800 disabled:opacity-50"
            >
              {savingTC ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Presupuesto total" value={summary ? formatUSD(summary.presupuesto_total_usd) : '-'} icon={DollarSign} iconClass="bg-blue-50 text-blue-700" loading={loading} />
        <KpiCard label="Ejecutado" value={summary ? formatUSD(summary.ejecutado_usd) : '-'} icon={BarChart2} iconClass="bg-blue-50 text-blue-600" loading={loading} />
        <KpiCard
          label="Desvío"
          value={summary ? `${summary.desvio_pct > 0 ? '+' : ''}${summary.desvio_pct}%` : '-'}
          icon={summary && summary.desvio_usd <= 0 ? TrendingDown : TrendingUp}
          iconClass={summary && summary.desvio_usd <= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}
          highlight={summary ? (summary.desvio_usd <= 0 ? 'green' : 'red') : undefined}
          loading={loading}
        />
        <KpiCard label="Margen proyectado" value={summary ? `${summary.margen_esperado_pct.toFixed(1)}%` : '-'} icon={TrendingUp} iconClass="bg-amber-50 text-amber-600" loading={loading} />
      </div>

      {/* Category bars */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold text-gray-900">Por categoría</h3>
          {!isReader && (
            <button
              onClick={openNewBudget}
              className="flex items-center gap-1.5 text-xs text-blue-700 hover:text-blue-900 font-medium"
            >
              <Plus size={13} /> Nueva categoría
            </button>
          )}
        </div>
        {loading ? (
          <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full bg-gray-100" />)}</div>
        ) : summary && summary.por_categoria.length > 0 ? (
          <div className="space-y-4">
            {summary.por_categoria.map((cat) => {
              const maxVal = Math.max(cat.presupuesto_usd, cat.ejecutado_usd);
              const budPct = maxVal ? (cat.presupuesto_usd / maxVal) * 100 : 0;
              const exePct = maxVal ? (cat.ejecutado_usd / maxVal) * 100 : 0;
              const budgetItem = budget.find((b) => b.categoria === cat.categoria);
              return (
                <div key={cat.categoria} className="group">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-gray-700 font-medium">{cat.categoria}</span>
                    <div className="flex items-center gap-1">
                      {!isReader && budgetItem && (
                        <>
                          <button
                            onClick={() => openEditBudget(budgetItem)}
                            className="p-1 text-gray-300 hover:text-blue-600 rounded transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => deleteBudgetItem(budgetItem)}
                            className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                      <span className={cn('text-xs font-medium', cat.desvio_pct > 0 ? 'text-red-500' : 'text-emerald-600')}>
                        {cat.desvio_pct > 0 ? '+' : ''}{cat.desvio_pct}%
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 w-20">Presupuesto</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gray-400 rounded-full" style={{ width: `${budPct}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-500 w-20 text-right">{formatUSD(cat.presupuesto_usd)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 w-20">Ejecutado</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full', cat.ejecutado_usd > cat.presupuesto_usd ? 'bg-red-400' : 'bg-blue-500')} style={{ width: `${exePct}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-500 w-20 text-right">{formatUSD(cat.ejecutado_usd)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-6">Sin categorías de presupuesto. Agregá una para empezar.</p>
        )}
      </div>

      {/* Expenses table */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h3 className="text-sm font-semibold text-gray-900">Gastos</h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none"
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
            >
              <option value="">Todas las categorías</option>
              {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="date" className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none" value={filterDesde} onChange={(e) => setFilterDesde(e.target.value)} />
            <input type="date" className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none" value={filterHasta} onChange={(e) => setFilterHasta(e.target.value)} />
            <button
              onClick={loadExpenses}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              Filtrar
            </button>
            {(filterCat || filterDesde || filterHasta) && (
              <button onClick={() => { setFilterCat(''); setFilterDesde(''); setFilterHasta(''); load(); }} className="text-gray-400 hover:text-gray-700">
                <X size={14} />
              </button>
            )}
            {!isReader && (
              <button
                onClick={openNew}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-700 text-white font-medium hover:bg-blue-800"
              >
                <Plus size={13} /> Nuevo gasto
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full bg-gray-100" />)}</div>
        ) : expenses.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Sin gastos registrados</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-400 pb-3 pr-4">Fecha</th>
                  <th className="text-left text-xs font-medium text-gray-400 pb-3 pr-4">Proveedor</th>
                  <th className="text-left text-xs font-medium text-gray-400 pb-3 pr-4">Descripción</th>
                  <th className="text-left text-xs font-medium text-gray-400 pb-3 pr-4">Categoría</th>
                  <th className="text-right text-xs font-medium text-gray-400 pb-3 pr-4">Monto USD</th>
                  <th className="text-right text-xs font-medium text-gray-400 pb-3"></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp) => (
                  <tr key={exp.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="py-3 pr-4 text-gray-600 whitespace-nowrap">
                      {exp.fecha ? new Date(exp.fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                    </td>
                    <td className="py-3 pr-4 text-gray-600 whitespace-nowrap">{exp.proveedor || '—'}</td>
                    <td className="py-3 pr-4 text-gray-800 max-w-xs">
                      <span className="truncate block">{exp.descripcion}</span>
                      {exp.etapa_nombre && (
                        <span className="text-[10px] text-gray-400">{exp.etapa_nombre}</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {exp.categoria ? (
                        <Badge className={cn(
                          "text-[10px]",
                          exp.source === 'obra'
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-blue-50 text-blue-800 border-blue-200"
                        )}>{exp.categoria}</Badge>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-3 pr-4 text-right font-medium text-gray-800 whitespace-nowrap">
                      {exp.monto_usd != null ? formatUSD(exp.monto_usd) : '—'}
                    </td>
                    {!isReader && (
                      <td className="py-3 text-right">
                        {exp.source !== 'obra' ? (
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEdit(exp)} className="p-1.5 text-gray-400 hover:text-blue-700 rounded-lg hover:bg-blue-50 transition-colors">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => deleteExpense(exp)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-gray-300 pr-1">Obra</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      </TabsContent>

      {/* ─── Tab: Facturas ─── */}
      <TabsContent value="facturas" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none"
              value={facturaFilterCat}
              onChange={(e) => setFacturaFilterCat(e.target.value)}
            >
              <option value="">Todas</option>
              <option value="egreso">Egresos</option>
              <option value="ingreso">Ingresos</option>
            </select>
            <input
              type="text"
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none w-36"
              placeholder="Proveedor..."
              value={facturaFilterProveedor}
              onChange={(e) => setFacturaFilterProveedor(e.target.value)}
            />
            <button onClick={loadFacturas} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">Filtrar</button>
            {(facturaFilterCat || facturaFilterProveedor) && (
              <button onClick={() => { setFacturaFilterCat(''); setFacturaFilterProveedor(''); loadFacturas(); }} className="text-gray-400 hover:text-gray-700">
                <X size={14} />
              </button>
            )}
          </div>
          {!isReader && (
            <button onClick={openNewFactura} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-700 text-white font-medium hover:bg-blue-800">
              <Plus size={13} /> Nueva factura
            </button>
          )}
        </div>

        {loadingFacturas ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full bg-gray-100" />)}</div>
        ) : facturas.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
            <FileText size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Sin facturas registradas.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Fecha</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Tipo</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">N°</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Proveedor</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Categoría</th>
                  <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Total</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {facturas.map((f) => (
                  <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {new Date(f.fecha_emision + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: '2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className="text-[10px] bg-gray-50 text-gray-700 border-gray-200">Fact. {f.tipo.toUpperCase()}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{f.numero_factura || '—'}</td>
                    <td className="px-4 py-3 text-gray-800 max-w-[140px] truncate">{f.proveedor_nombre || f.proveedor_supplier || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge className={cn('text-[10px]', f.categoria === 'egreso' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200')}>
                        {f.categoria === 'egreso' ? 'Egreso' : 'Ingreso'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800 whitespace-nowrap">
                      {f.moneda} {Number(f.monto_total).toLocaleString('es-AR')}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={cn('text-[10px]',
                        f.estado === 'cargada' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        f.estado === 'vinculada' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        'bg-emerald-50 text-emerald-700 border-emerald-200'
                      )}>
                        {f.estado === 'cargada' ? 'Cargada' : f.estado === 'vinculada' ? 'Vinculada' : 'Pagada'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {f.file_url && (
                          <a href={f.file_url} target="_blank" rel="noreferrer" className="p-1.5 text-gray-400 hover:text-blue-700 rounded-lg hover:bg-blue-50 transition-colors">
                            <ExternalLink size={13} />
                          </a>
                        )}
                        {!isReader && (
                          <>
                            <button onClick={() => openEditFactura(f)} className="p-1.5 text-gray-400 hover:text-blue-700 rounded-lg hover:bg-blue-50 transition-colors">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => deleteFactura(f)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
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
      </TabsContent>

      {/* ─── Tab: Flujo de Caja ─── */}
      <TabsContent value="cashflow" className="space-y-4">
        {/* Filtros de rango */}
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500">Desde</label>
            <input
              type="month"
              value={cfDesde}
              onChange={e => setCfDesde(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500">Hasta</label>
            <input
              type="month"
              value={cfHasta}
              onChange={e => setCfHasta(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            onClick={() => { setCfDesde(defaultDesde()); setCfHasta(defaultHasta()); }}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors underline"
          >
            Resetear
          </button>
        </div>
        {loadingCF ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full bg-gray-100" />)}</div>
        ) : cashFlow.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
            <BarChart2 size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Sin datos de flujo de caja. Registrá pagos de cuotas o gastos primero.</p>
          </div>
        ) : (
          <>
            {/* Bar chart */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Ingresos vs Egresos por mes</h3>
              <div className="flex items-end gap-2 overflow-x-auto pb-2" style={{ minHeight: 120 }}>
                {(() => {
                  const max = Math.max(...cashFlow.map(r => Math.max(r.ingresos + r.proyeccion, r.egresos)), 1);
                  return cashFlow.map(row => (
                    <div key={row.mes} className="flex flex-col items-center gap-1 flex-shrink-0" style={{ minWidth: 48 }}>
                      <div className="flex items-end gap-0.5" style={{ height: 100 }}>
                        <div
                          className="w-4 rounded-t bg-emerald-400 opacity-70"
                          style={{ height: `${((row.ingresos) / max) * 100}%` }}
                          title={`Cobrado: USD ${row.ingresos.toLocaleString('es-AR')}`}
                        />
                        {row.proyeccion > 0 && (
                          <div
                            className="w-4 rounded-t bg-emerald-200"
                            style={{ height: `${(row.proyeccion / max) * 100}%` }}
                            title={`Proyectado: USD ${row.proyeccion.toLocaleString('es-AR')}`}
                          />
                        )}
                        <div
                          className="w-4 rounded-t bg-red-400 opacity-70"
                          style={{ height: `${(row.egresos / max) * 100}%` }}
                          title={`Egresos: USD ${row.egresos.toLocaleString('es-AR')}`}
                        />
                      </div>
                      <span className="text-[9px] text-gray-400">{fmtMes(row.mes).split(' ')[0]}</span>
                    </div>
                  ));
                })()}
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-400 opacity-70" /> Cobrado</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-200" /> Proyectado</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-400 opacity-70" /> Egresos</div>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Mes</th>
                    <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Ingresos</th>
                    <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Proyectado</th>
                    <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Egresos</th>
                    <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Saldo mes</th>
                    <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {cashFlow.map((row) => (
                    <tr key={row.mes} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800">{fmtMes(row.mes)}</td>
                      <td className="px-4 py-3 text-right text-emerald-600 font-medium tabular">
                        {row.ingresos > 0 ? `USD ${row.ingresos.toLocaleString('es-AR')}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-400 tabular">
                        {row.proyeccion > 0 ? `USD ${row.proyeccion.toLocaleString('es-AR')}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-red-500 font-medium tabular">
                        {row.egresos > 0 ? `USD ${row.egresos.toLocaleString('es-AR')}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular">
                        <span className={row.saldo >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                          {row.saldo >= 0 ? <ArrowUpCircle className="inline w-3 h-3 mr-0.5" /> : <ArrowDownCircle className="inline w-3 h-3 mr-0.5" />}
                          USD {Math.abs(row.saldo).toLocaleString('es-AR')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular">
                        <span className={row.acumulado >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                          USD {row.acumulado.toLocaleString('es-AR')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </TabsContent>

      </Tabs>

      {/* Expense modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingExpense ? 'Editar gasto' : 'Nuevo gasto'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Descripción *</label>
              <input
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                placeholder="Descripción del gasto"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Proveedor</label>
                <input
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                  value={form.proveedor || ''}
                  onChange={(e) => setForm({ ...form, proveedor: e.target.value || null })}
                  placeholder="Nombre proveedor"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Categoría</label>
                <select
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none"
                  value={form.budget_id || ''}
                  onChange={(e) => setForm({ ...form, budget_id: e.target.value || null })}
                >
                  <option value="">Sin categoría</option>
                  {budget.map((b) => <option key={b.id} value={b.id}>{b.categoria}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Monto USD</label>
                <input
                  type="number"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                  value={form.monto_usd ?? ''}
                  onChange={(e) => setForm({ ...form, monto_usd: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Monto ARS</label>
                <input
                  type="number"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                  value={form.monto_ars ?? ''}
                  onChange={(e) => setForm({ ...form, monto_ars: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Fecha *</label>
                <input
                  type="date"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                  value={form.fecha}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Comprobante URL</label>
                <input
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                  value={form.comprobante_url || ''}
                  onChange={(e) => setForm({ ...form, comprobante_url: e.target.value || null })}
                  placeholder="https://..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 rounded-lg border border-gray-200 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={saveExpense}
                disabled={saving}
                className="px-4 py-2 text-sm bg-blue-700 text-white rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50"
              >
                {saving ? 'Guardando...' : editingExpense ? 'Actualizar' : 'Crear gasto'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Budget modal */}
      <Dialog open={showBudgetModal} onOpenChange={(open) => { setShowBudgetModal(open); if (!open) setEditingBudget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingBudget ? 'Editar categoría' : 'Nueva categoría de presupuesto'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Categoría *</label>
              <input
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                value={budgetForm.categoria}
                onChange={(e) => setBudgetForm({ ...budgetForm, categoria: e.target.value })}
                placeholder="ej: Estructura, Terminaciones..."
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Descripción</label>
              <input
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                value={budgetForm.descripcion}
                onChange={(e) => setBudgetForm({ ...budgetForm, descripcion: e.target.value })}
                placeholder="Descripción opcional"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Monto presupuestado (USD)</label>
              <input
                type="number"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                value={budgetForm.monto_usd}
                onChange={(e) => setBudgetForm({ ...budgetForm, monto_usd: e.target.value })}
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </div>
            {etapas.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Etapa de obra vinculada</label>
                <select
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none"
                  value={budgetForm.etapa_id}
                  onChange={(e) => setBudgetForm({ ...budgetForm, etapa_id: e.target.value })}
                >
                  <option value="">Sin etapa (gasto general)</option>
                  {etapas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">Los pagos de obra de esta etapa se contabilizarán automáticamente en esta categoría.</p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowBudgetModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 rounded-lg border border-gray-200 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={saveBudget}
                disabled={savingBudget}
                className="px-4 py-2 text-sm bg-blue-700 text-white rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50"
              >
                {savingBudget ? 'Guardando...' : editingBudget ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Factura modal */}
      <Dialog open={showFacturaModal} onOpenChange={setShowFacturaModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingFactura ? 'Editar factura' : 'Nueva factura'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Tipo</label>
                <select className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none" value={facturaForm.tipo} onChange={(e) => setFacturaForm(f => ({ ...f, tipo: e.target.value as Factura['tipo'] }))}>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="recibo">Recibo</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Número</label>
                <input className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" value={facturaForm.numero_factura} onChange={(e) => setFacturaForm(f => ({ ...f, numero_factura: e.target.value }))} placeholder="0001-00012345" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Categoría</label>
                <select className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none" value={facturaForm.categoria} onChange={(e) => setFacturaForm(f => ({ ...f, categoria: e.target.value as 'egreso' | 'ingreso' }))}>
                  <option value="egreso">Egreso</option>
                  <option value="ingreso">Ingreso</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Proveedor</label>
                <input className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" value={facturaForm.proveedor_nombre} onChange={(e) => setFacturaForm(f => ({ ...f, proveedor_nombre: e.target.value }))} placeholder="Nombre proveedor" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">CUIT emisor</label>
                <input className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" value={facturaForm.cuit_emisor} onChange={(e) => setFacturaForm(f => ({ ...f, cuit_emisor: e.target.value }))} placeholder="20-12345678-9" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Fecha emisión *</label>
                <input type="date" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" value={facturaForm.fecha_emision} onChange={(e) => setFacturaForm(f => ({ ...f, fecha_emision: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Fecha vencimiento</label>
                <input type="date" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" value={facturaForm.fecha_vencimiento} onChange={(e) => setFacturaForm(f => ({ ...f, fecha_vencimiento: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Monto neto</label>
                <input type="number" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" value={facturaForm.monto_neto} onChange={(e) => setFacturaForm(f => ({ ...f, monto_neto: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">IVA %</label>
                <input type="number" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" value={facturaForm.iva_pct} onChange={(e) => setFacturaForm(f => ({ ...f, iva_pct: e.target.value }))} placeholder="21" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Total *</label>
                <input type="number" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" value={facturaForm.monto_total} onChange={(e) => setFacturaForm(f => ({ ...f, monto_total: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Moneda</label>
                <select className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none" value={facturaForm.moneda} onChange={(e) => setFacturaForm(f => ({ ...f, moneda: e.target.value as 'USD' | 'ARS' }))}>
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Estado</label>
                <select className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none" value={facturaForm.estado} onChange={(e) => setFacturaForm(f => ({ ...f, estado: e.target.value as Factura['estado'] }))}>
                  <option value="cargada">Cargada</option>
                  <option value="vinculada">Vinculada</option>
                  <option value="pagada">Pagada</option>
                </select>
              </div>
            </div>
            {facturaForm.categoria === 'ingreso' && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Vincular a pago registrado
                </label>
                <input
                  type="text"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                  placeholder="Buscar comprador..."
                  value={paymentSearch}
                  onChange={(e) => {
                    setPaymentSearch(e.target.value);
                    searchLinkablePayments(e.target.value);
                  }}
                  onFocus={() => { if (!linkablePayments.length) searchLinkablePayments(''); }}
                />
                {loadingPayments && (
                  <p className="text-xs text-gray-400 px-1">Buscando...</p>
                )}
                {linkablePayments.length > 0 && (
                  <div className="border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50 max-h-48 overflow-y-auto">
                    {linkablePayments.map((pr) => (
                      <button
                        key={pr.id}
                        type="button"
                        onClick={() =>
                          setFacturaForm(f => ({
                            ...f,
                            payment_record_id: f.payment_record_id === pr.id ? '' : pr.id,
                          }))
                        }
                        className={cn(
                          'w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors',
                          facturaForm.payment_record_id === pr.id
                            ? 'bg-blue-50 text-blue-800'
                            : 'hover:bg-gray-50 text-gray-700',
                        )}
                      >
                        <span className="font-medium">{pr.buyer_name || 'Comprador'}</span>
                        <span className="text-gray-400">
                          Cuota #{pr.numero_cuota} · {pr.moneda} {Number(pr.monto_pagado).toLocaleString('es-AR')} · {new Date(pr.fecha_pago).toLocaleDateString('es-AR')}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {facturaForm.payment_record_id && (
                  <p className="text-xs text-blue-700 font-medium px-1 flex items-center gap-1">
                    ✓ Pago vinculado
                    <button
                      type="button"
                      className="ml-1 text-gray-400 hover:text-red-500"
                      onClick={() => setFacturaForm(f => ({ ...f, payment_record_id: '' }))}
                    >
                      (quitar)
                    </button>
                  </p>
                )}
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">URL archivo (PDF)</label>
              <div className="space-y-2">
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  id="factura-pdf-input"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePdfUpload(file);
                    e.target.value = '';
                  }}
                />
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="factura-pdf-input"
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors flex-shrink-0',
                      uploadingPdf && 'opacity-50 pointer-events-none',
                    )}
                  >
                    <FileText size={14} className="text-gray-400" />
                    {uploadingPdf ? 'Subiendo...' : 'Subir PDF'}
                  </label>
                  {facturaForm.file_url && (
                    <a
                      href={facturaForm.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-700 hover:underline truncate"
                    >
                      <ExternalLink size={12} />
                      Ver PDF
                    </a>
                  )}
                  {facturaForm.file_url && (
                    <button
                      type="button"
                      onClick={() => setFacturaForm(f => ({ ...f, file_url: '' }))}
                      className="ml-auto p-1 text-gray-300 hover:text-red-500 rounded transition-colors"
                      title="Quitar PDF"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Notas</label>
              <input className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" value={facturaForm.notas} onChange={(e) => setFacturaForm(f => ({ ...f, notas: e.target.value }))} placeholder="Observaciones opcionales" />
            </div>
            {!editingFactura && (
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-3">
                <label className="flex items-center gap-2 text-sm text-blue-800 font-medium cursor-pointer">
                  <input type="checkbox" checked={facturaForm.crear_gasto} onChange={(e) => setFacturaForm(f => ({ ...f, crear_gasto: e.target.checked }))} className="rounded" />
                  Registrar también como gasto
                </label>
                {facturaForm.crear_gasto && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Descripción del gasto</label>
                      <input className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none" value={facturaForm.gasto_descripcion} onChange={(e) => setFacturaForm(f => ({ ...f, gasto_descripcion: e.target.value }))} placeholder="Descripción..." />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Categoría presupuesto</label>
                      <select className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none" value={facturaForm.gasto_budget_id} onChange={(e) => setFacturaForm(f => ({ ...f, gasto_budget_id: e.target.value }))}>
                        <option value="">Sin categoría</option>
                        {budget.map((b) => <option key={b.id} value={b.id}>{b.categoria}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="mt-4">
            <button onClick={() => setShowFacturaModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 rounded-lg border border-gray-200 hover:bg-gray-50">Cancelar</button>
            <button onClick={saveFactura} disabled={savingFactura} className="px-4 py-2 text-sm bg-blue-700 text-white rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50">
              {savingFactura ? 'Guardando...' : editingFactura ? 'Actualizar' : 'Crear factura'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

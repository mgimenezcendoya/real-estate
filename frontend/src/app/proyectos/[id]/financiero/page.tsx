'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, FinancialSummary, BudgetItem, Expense, Factura, CashFlowRow, ObraEtapa } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { DollarSign, TrendingDown, TrendingUp, BarChart2, Plus, Pencil, Trash2, X, FileText, ArrowUpCircle, ArrowDownCircle, ExternalLink } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import InversoresContent from '../inversores/InversoresContent';
import FacturaModal from '@/components/FacturaModal';

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


function fmtMes(mes: string) {
  const [y, m] = mes.split('-');
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${months[parseInt(m) - 1]} ${y}`;
}

export default function FinancieroPage() {
  const { id } = useParams<{ id: string }>();
  const { isReader, isAdmin, role } = useAuth();
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [budget, setBudget] = useState<BudgetItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters (expenses)
  const [filterCat, setFilterCat] = useState('');
  const [filterDesde, setFilterDesde] = useState('');
  const [filterHasta, setFilterHasta] = useState('');

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
  const [editingFactura, setEditingFactura] = useState<Factura | null>(null);
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
        {(isAdmin || role === 'gerente') && (
          <TabsTrigger value="inversores">Inversores</TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="resumen" className="space-y-8">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Dashboard Financiero</h2>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Ingreso bruto esperado" value={summary ? formatUSD(summary.revenue_esperado_usd) : '-'} icon={TrendingUp} iconClass="bg-emerald-50 text-emerald-600" loading={loading} />
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
            <button onClick={() => { setEditingFactura(null); setShowFacturaModal(true); }} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-700 text-white font-medium hover:bg-blue-800">
              <Plus size={13} /> + Agregar
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
                      <div className="flex items-center flex-wrap gap-1">
                        <Badge className="text-[10px] bg-gray-50 text-gray-700 border-gray-200">Fact. {f.tipo.toUpperCase()}</Badge>
                        {f.etapa_id && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 rounded">Obra</span>}
                        {!f.etapa_id && f.numero_factura && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded">Factura</span>}
                        {!f.etapa_id && !f.numero_factura && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600 rounded">Gasto</span>}
                      </div>
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
                            <button onClick={() => { setEditingFactura(f); setShowFacturaModal(true); }} className="p-1.5 text-gray-400 hover:text-blue-700 rounded-lg hover:bg-blue-50 transition-colors">
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

      {(isAdmin || role === 'gerente') && (
        <TabsContent value="inversores">
          <InversoresContent projectId={id} />
        </TabsContent>
      )}

      </Tabs>

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

      <FacturaModal
        open={showFacturaModal}
        onClose={() => { setShowFacturaModal(false); setEditingFactura(null); }}
        onSuccess={() => { loadFacturas(); setShowFacturaModal(false); setEditingFactura(null); }}
        projectId={id}
        editingFactura={editingFactura}
      />
    </div>
  );
}

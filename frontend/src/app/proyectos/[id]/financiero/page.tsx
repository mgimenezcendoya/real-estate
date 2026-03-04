'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, FinancialSummary, BudgetItem, Expense } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { DollarSign, TrendingDown, TrendingUp, BarChart2, Plus, Pencil, Trash2, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:border-indigo-200 hover:shadow-md transition-all">
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

export default function FinancieroPage() {
  const { id } = useParams<{ id: string }>();
  const { isReader } = useAuth();
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [budget, setBudget] = useState<BudgetItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipoCambio, setTipoCambio] = useState('');
  const [savingTC, setSavingTC] = useState(false);

  // Filters
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
  const [budgetForm, setBudgetForm] = useState({ categoria: '', descripcion: '', monto_usd: '' });
  const [savingBudget, setSavingBudget] = useState(false);

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

  useEffect(() => { load(); }, [id]);

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

  const saveBudget = async () => {
    if (!id || !budgetForm.categoria) return toast.error('Categoría requerida');
    setSavingBudget(true);
    try {
      await api.upsertBudget(id, {
        categoria: budgetForm.categoria,
        descripcion: budgetForm.descripcion || null,
        monto_usd: budgetForm.monto_usd ? parseFloat(budgetForm.monto_usd) : null,
        monto_ars: null,
      });
      toast.success('Presupuesto guardado');
      setShowBudgetModal(false);
      setBudgetForm({ categoria: '', descripcion: '', monto_usd: '' });
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setSavingBudget(false);
    }
  };

  const categorias = budget.map((b) => b.categoria);

  return (
    <div className="p-6 md:p-8 space-y-8">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Dashboard Financiero</h2>
        {!isReader && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">USD/ARS</label>
            <input
              className="w-28 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-400"
              value={tipoCambio}
              onChange={(e) => setTipoCambio(e.target.value)}
              type="number"
              min="1"
            />
            <button
              onClick={saveTipoCambio}
              disabled={savingTC}
              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {savingTC ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Presupuesto total" value={summary ? formatUSD(summary.presupuesto_total_usd) : '-'} icon={DollarSign} iconClass="bg-indigo-50 text-indigo-600" loading={loading} />
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
              onClick={() => setShowBudgetModal(true)}
              className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
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
              return (
                <div key={cat.categoria}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-gray-700 font-medium">{cat.categoria}</span>
                    <span className={cn('text-xs font-medium', cat.desvio_pct > 0 ? 'text-red-500' : 'text-emerald-600')}>
                      {cat.desvio_pct > 0 ? '+' : ''}{cat.desvio_pct}%
                    </span>
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
                        <div className={cn('h-full rounded-full', cat.ejecutado_usd > cat.presupuesto_usd ? 'bg-red-400' : 'bg-indigo-500')} style={{ width: `${exePct}%` }} />
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
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700"
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
                      {new Date(exp.fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: '2-digit' })}
                    </td>
                    <td className="py-3 pr-4 text-gray-600 whitespace-nowrap">{exp.proveedor || '—'}</td>
                    <td className="py-3 pr-4 text-gray-800 max-w-xs truncate">{exp.descripcion}</td>
                    <td className="py-3 pr-4">
                      {exp.categoria ? <Badge className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200">{exp.categoria}</Badge> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-3 pr-4 text-right font-medium text-gray-800 whitespace-nowrap">
                      {exp.monto_usd != null ? formatUSD(exp.monto_usd) : '—'}
                    </td>
                    {!isReader && (
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(exp)} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => deleteExpense(exp)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                placeholder="Descripción del gasto"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Proveedor</label>
                <input
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
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
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
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
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
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
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
                  value={form.fecha}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Comprobante URL</label>
                <input
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
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
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Guardando...' : editingExpense ? 'Actualizar' : 'Crear gasto'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Budget modal */}
      <Dialog open={showBudgetModal} onOpenChange={setShowBudgetModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nueva categoría de presupuesto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Categoría *</label>
              <input
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
                value={budgetForm.categoria}
                onChange={(e) => setBudgetForm({ ...budgetForm, categoria: e.target.value })}
                placeholder="ej: Estructura, Terminaciones..."
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Descripción</label>
              <input
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
                value={budgetForm.descripcion}
                onChange={(e) => setBudgetForm({ ...budgetForm, descripcion: e.target.value })}
                placeholder="Descripción opcional"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Monto presupuestado (USD)</label>
              <input
                type="number"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
                value={budgetForm.monto_usd}
                onChange={(e) => setBudgetForm({ ...budgetForm, monto_usd: e.target.value })}
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowBudgetModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 rounded-lg border border-gray-200 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={saveBudget}
                disabled={savingBudget}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingBudget ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

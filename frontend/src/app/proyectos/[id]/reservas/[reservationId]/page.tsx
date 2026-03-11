'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, Reservation, PaymentPlan, PaymentInstallment, PaymentRecord } from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ArrowLeft, Plus, Printer, FileText, CreditCard, CheckCircle, Clock, AlertTriangle, Pencil, Trash2, ChevronDown, ChevronUp, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ESTADO_CONFIG = {
  pendiente: { label: 'Pendiente', icon: Clock, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  pagado:    { label: 'Pagado',    icon: CheckCircle, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  vencido:   { label: 'Vencido',  icon: AlertTriangle, color: 'text-red-600 bg-red-50 border-red-200' },
  parcial:   { label: 'Parcial',  icon: CreditCard, color: 'text-blue-600 bg-blue-50 border-blue-200' },
} as const;

const CONCEPTO_LABELS: Record<string, string> = {
  anticipo: 'Anticipo', cuota: 'Cuota', saldo: 'Saldo final',
};

function fmt(n: number, moneda = 'USD') {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: moneda, maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function ReservationDetailPage() {
  const { id: projectId, reservationId } = useParams<{ id: string; reservationId: string }>();
  const router = useRouter();

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [plan, setPlan] = useState<PaymentPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('detalle');

  // Modals
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [showRegisterPayment, setShowRegisterPayment] = useState(false);
  const [showEditRecord, setShowEditRecord] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<PaymentInstallment | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<PaymentRecord | null>(null);
  const [expandedInstallments, setExpandedInstallments] = useState<Set<string>>(new Set());
  const [editingInstallment, setEditingInstallment] = useState<string | null>(null);
  const [editInstallmentForm, setEditInstallmentForm] = useState({ monto: '', fecha_vencimiento: '' });
  const [savingInstallment, setSavingInstallment] = useState(false);
  const [saving, setSaving] = useState(false);

  // Create plan form
  const [planForm, setPlanForm] = useState({
    descripcion: '', monto_total: '', moneda_base: 'USD',
    anticipo_pct: '30', seña_monto: '', n_cuotas: '12', tipo_ajuste: 'ninguno',
  });

  // Register payment form
  const [payForm, setPayForm] = useState({
    fecha_pago: new Date().toISOString().split('T')[0],
    monto_pagado: '', moneda: 'USD', metodo_pago: 'transferencia',
    referencia: '', notas: '',
  });

  // Edit record form
  const [editRecordForm, setEditRecordForm] = useState({
    fecha_pago: '', monto_pagado: '', moneda: 'USD', metodo_pago: 'transferencia',
    referencia: '', notas: '',
  });

  useEffect(() => { load(); }, [reservationId]);

  async function load() {
    setLoading(true);
    try {
      const [res, p] = await Promise.all([
        api.getReservation(reservationId),
        api.getPaymentPlan(reservationId),
      ]);
      setReservation(res);
      setPlan(p);
      // Pre-fill plan form: total = unit price, seña = down payment already committed
      if (res?.unit_price_usd) {
        setPlanForm(f => ({ ...f, monto_total: String(res.unit_price_usd) }));
      }
      if (res?.amount_usd) {
        setPlanForm(f => ({ ...f, seña_monto: String(res.amount_usd) }));
      }
    } catch {
      toast.error('Error al cargar reserva');
    } finally {
      setLoading(false);
    }
  }

  function buildInstallments() {
    const total = parseFloat(planForm.monto_total) || 0;
    const nCuotas = parseInt(planForm.n_cuotas) || 1;
    const moneda = planForm.moneda_base as 'USD' | 'ARS';

    // If a seña was paid, use it as the exact anticipo amount; otherwise fall back to %
    const señaMonto = parseFloat(planForm.seña_monto) || 0;
    const anticipo = señaMonto > 0 ? señaMonto : total * ((parseFloat(planForm.anticipo_pct) || 0) / 100);
    const remaining = total - anticipo;
    const cuota = remaining / nCuotas;

    const today = new Date();
    const insts = [];

    // Anticipo
    insts.push({
      numero_cuota: 1,
      concepto: 'anticipo' as const,
      monto: Math.round(anticipo * 100) / 100,
      moneda,
      fecha_vencimiento: today.toISOString().split('T')[0],
    });

    // Cuotas
    for (let i = 0; i < nCuotas; i++) {
      const d = new Date(today);
      d.setMonth(d.getMonth() + i + 1);
      insts.push({
        numero_cuota: i + 2,
        concepto: 'cuota' as const,
        monto: Math.round(cuota * 100) / 100,
        moneda,
        fecha_vencimiento: d.toISOString().split('T')[0],
      });
    }

    return insts;
  }

  async function handleCreatePlan() {
    const installments = buildInstallments();
    const total = parseFloat(planForm.monto_total);
    if (!total || installments.length === 0) {
      toast.error('Completá los datos del plan');
      return;
    }
    setSaving(true);
    try {
      await api.createPaymentPlan(reservationId, {
        descripcion: planForm.descripcion || undefined,
        moneda_base: planForm.moneda_base,
        monto_total: total,
        tipo_ajuste: planForm.tipo_ajuste,
        installments,
      });
      toast.success('Plan de pagos creado');
      setShowCreatePlan(false);
      setActiveTab('pagos');
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function handleRegisterPayment() {
    if (!selectedInstallment) return;
    const monto = parseFloat(payForm.monto_pagado);
    if (!monto) { toast.error('Ingresá el monto'); return; }
    setSaving(true);
    try {
      await api.createPaymentRecord({
        installment_id: selectedInstallment.id,
        fecha_pago: payForm.fecha_pago,
        monto_pagado: monto,
        moneda: payForm.moneda as 'USD' | 'ARS',
        metodo_pago: payForm.metodo_pago,
        referencia: payForm.referencia || undefined,
        notas: payForm.notas || undefined,
      });
      toast.success('Pago registrado');
      setShowRegisterPayment(false);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  function openRegisterPayment(inst: PaymentInstallment) {
    setSelectedInstallment(inst);
    setPayForm(f => ({ ...f, monto_pagado: String(inst.monto), moneda: inst.moneda }));
    setShowRegisterPayment(true);
  }

  function openEditRecord(record: PaymentRecord) {
    setSelectedRecord(record);
    setEditRecordForm({
      fecha_pago: record.fecha_pago,
      monto_pagado: String(record.monto_pagado),
      moneda: record.moneda,
      metodo_pago: record.metodo_pago,
      referencia: record.referencia || '',
      notas: record.notas || '',
    });
    setShowEditRecord(true);
  }

  async function handleUpdateRecord() {
    if (!selectedRecord) return;
    const monto = parseFloat(editRecordForm.monto_pagado);
    if (!monto) { toast.error('Ingresá el monto'); return; }
    setSaving(true);
    try {
      await api.updatePaymentRecord(selectedRecord.id, {
        fecha_pago: editRecordForm.fecha_pago,
        monto_pagado: monto,
        moneda: editRecordForm.moneda as 'USD' | 'ARS',
        metodo_pago: editRecordForm.metodo_pago,
        referencia: editRecordForm.referencia || undefined,
        notas: editRecordForm.notas || undefined,
      });
      toast.success('Pago actualizado');
      setShowEditRecord(false);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRecord(recordId: string) {
    if (!confirm('¿Eliminar este registro de pago?')) return;
    try {
      await api.deletePaymentRecord(recordId);
      toast.success('Pago eliminado');
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  }

  function openEditInstallment(inst: PaymentInstallment) {
    setEditingInstallment(inst.id);
    setEditInstallmentForm({
      monto: String(inst.monto),
      fecha_vencimiento: inst.fecha_vencimiento,
    });
  }

  async function saveInstallment(instId: string) {
    const monto = parseFloat(editInstallmentForm.monto);
    if (!monto || !editInstallmentForm.fecha_vencimiento) {
      toast.error('Monto y fecha requeridos'); return;
    }
    setSavingInstallment(true);
    try {
      await api.patchInstallment(instId, {
        monto,
        fecha_vencimiento: editInstallmentForm.fecha_vencimiento,
      });
      toast.success('Cuota actualizada');
      setEditingInstallment(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setSavingInstallment(false);
    }
  }

  function toggleExpand(installmentId: string) {
    setExpandedInstallments(prev => {
      const next = new Set(prev);
      if (next.has(installmentId)) next.delete(installmentId);
      else next.add(installmentId);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!reservation) return <div className="p-6 text-muted-foreground">Reserva no encontrada.</div>;

  const totalPagado = plan?.installments.reduce((acc, i) =>
    acc + i.records.reduce((a, r) => a + r.monto_pagado, 0), 0) ?? 0;
  const totalPlan = plan?.monto_total ?? 0;
  const pctPagado = totalPlan > 0 ? Math.min(100, (totalPagado / totalPlan) * 100) : 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-8 w-8">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-display font-semibold">
            Reserva — {reservation.unit_identifier} · Piso {reservation.unit_floor}
          </h1>
          <p className="text-sm text-muted-foreground">{reservation.buyer_name || reservation.buyer_phone}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open(`/proyectos/${projectId}/reservas/${reservationId}/reporte`, '_blank', 'noopener,noreferrer')}
          className="flex items-center gap-1.5"
        >
          <FileText size={14} />
          Reporte
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5"
          onClick={() => router.push(`/proyectos/${projectId}/reservas/${reservationId}/print`)}>
          <Printer className="w-3.5 h-3.5" /> Imprimir
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="detalle">Detalle</TabsTrigger>
          <TabsTrigger value="pagos">Plan de Pagos</TabsTrigger>
        </TabsList>

        {/* ─── Tab Detalle ─── */}
        <TabsContent value="detalle" className="mt-4">
          <div className="glass rounded-xl p-5 grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Comprador</p>
              <p className="font-medium">{reservation.buyer_name || '—'}</p>
              <p className="text-muted-foreground">{reservation.buyer_phone}</p>
              {reservation.buyer_email && <p className="text-muted-foreground">{reservation.buyer_email}</p>}
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Unidad</p>
              <p className="font-medium">{reservation.unit_identifier} · Piso {reservation.unit_floor}</p>
              <p className="text-muted-foreground">{reservation.unit_bedrooms} dorm · {reservation.unit_area_m2} m²</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Seña</p>
              <p className="font-medium">{reservation.amount_usd ? fmt(reservation.amount_usd) : '—'}</p>
              {reservation.payment_method && <p className="text-muted-foreground capitalize">{reservation.payment_method}</p>}
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Fecha</p>
              <p className="font-medium">{reservation.signed_at ? fmtDate(reservation.signed_at) : '—'}</p>
            </div>
            {reservation.notes && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Notas</p>
                <p className="text-muted-foreground">{reservation.notes}</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ─── Tab Plan de Pagos ─── */}
        <TabsContent value="pagos" className="mt-4 space-y-4">
          {!plan ? (
            <div className="glass rounded-xl p-8 text-center">
              <CreditCard className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="font-medium text-foreground mb-1">Sin plan de pagos</p>
              <p className="text-sm text-muted-foreground mb-4">Generá el cronograma de cuotas para esta reserva.</p>
              <Button onClick={() => setShowCreatePlan(true)} className="gap-2">
                <Plus className="w-4 h-4" /> Crear plan de pagos
              </Button>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="glass rounded-xl p-4 flex items-center gap-6">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total</p>
                  <p className="text-lg font-display font-semibold">{fmt(plan.monto_total, plan.moneda_base)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Cobrado</p>
                  <p className="text-lg font-display font-semibold text-emerald-600">{fmt(totalPagado, plan.moneda_base)}</p>
                </div>
                <div className="flex-1">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Progreso</span><span>{Math.round(pctPagado)}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pctPagado}%` }} />
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowCreatePlan(true)}>Editar plan</Button>
              </div>

              {/* Installments table */}
              <div className="glass rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-4 py-2.5 text-xs uppercase tracking-wider text-muted-foreground font-semibold">#</th>
                      <th className="text-left px-4 py-2.5 text-xs uppercase tracking-wider text-muted-foreground font-semibold">Concepto</th>
                      <th className="text-left px-4 py-2.5 text-xs uppercase tracking-wider text-muted-foreground font-semibold">Monto</th>
                      <th className="text-left px-4 py-2.5 text-xs uppercase tracking-wider text-muted-foreground font-semibold">Vencimiento</th>
                      <th className="text-left px-4 py-2.5 text-xs uppercase tracking-wider text-muted-foreground font-semibold">Estado</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {plan.installments.map(inst => {
                      const cfg = ESTADO_CONFIG[inst.estado] ?? ESTADO_CONFIG.pendiente;
                      const Icon = cfg.icon;
                      const isExpanded = expandedInstallments.has(inst.id);
                      return (
                        <React.Fragment key={inst.id}>
                          <tr className="border-b border-border hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3 text-muted-foreground">{inst.numero_cuota}</td>
                            <td className="px-4 py-3 font-medium">{CONCEPTO_LABELS[inst.concepto] ?? inst.concepto}</td>
                            {/* Monto — editable inline */}
                            <td className="px-4 py-3 tabular">
                              {editingInstallment === inst.id ? (
                                <input
                                  type="number"
                                  value={editInstallmentForm.monto}
                                  onChange={e => setEditInstallmentForm(f => ({ ...f, monto: e.target.value }))}
                                  className="w-24 border border-blue-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  autoFocus
                                />
                              ) : (
                                <span className="group/cell relative">
                                  {fmt(inst.monto, inst.moneda)}
                                </span>
                              )}
                            </td>
                            {/* Vencimiento — editable inline */}
                            <td className="px-4 py-3 text-muted-foreground">
                              {editingInstallment === inst.id ? (
                                <input
                                  type="date"
                                  value={editInstallmentForm.fecha_vencimiento}
                                  onChange={e => setEditInstallmentForm(f => ({ ...f, fecha_vencimiento: e.target.value }))}
                                  className="border border-blue-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              ) : (
                                fmtDate(inst.fecha_vencimiento)
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border', cfg.color)}>
                                <Icon className="w-3 h-3" />
                                {cfg.label}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                {editingInstallment === inst.id ? (
                                  <>
                                    <button
                                      onClick={() => saveInstallment(inst.id)}
                                      disabled={savingInstallment}
                                      className="p-1 rounded text-emerald-600 hover:bg-emerald-50 transition-colors"
                                      title="Guardar"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setEditingInstallment(null)}
                                      className="p-1 rounded text-muted-foreground hover:bg-muted transition-colors"
                                      title="Cancelar"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    {inst.estado !== 'pagado' && (
                                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                                        onClick={() => openRegisterPayment(inst)}>
                                        <Plus className="w-3 h-3" /> Registrar pago
                                      </Button>
                                    )}
                                    <button
                                      onClick={() => openEditInstallment(inst)}
                                      className="p-1 rounded text-muted-foreground hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                      title="Editar cuota"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                    {inst.records.length > 0 && (
                                      <button
                                        onClick={() => toggleExpand(inst.id)}
                                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                      >
                                        {inst.records.length} pago{inst.records.length > 1 ? 's' : ''}
                                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                          {isExpanded && inst.records.map(rec => (
                            <tr key={rec.id} className="bg-muted/30 border-b border-border last:border-0">
                              <td colSpan={2} className="pl-8 pr-4 py-2 text-xs text-muted-foreground">
                                {fmtDate(rec.fecha_pago)}
                              </td>
                              <td className="px-4 py-2 text-xs font-medium tabular">{fmt(rec.monto_pagado, rec.moneda)}</td>
                              <td className="px-4 py-2 text-xs text-muted-foreground capitalize">{rec.metodo_pago}</td>
                              <td className="px-4 py-2 text-xs text-muted-foreground">{rec.referencia || '—'}</td>
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => openEditRecord(rec)}
                                    className="p-1 rounded text-muted-foreground hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                    title="Editar pago"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteRecord(rec.id)}
                                    className="p-1 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                                    title="Eliminar pago"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Modal: Crear / editar plan */}
      <Dialog open={showCreatePlan} onOpenChange={setShowCreatePlan}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{plan ? 'Editar plan de pagos' : 'Crear plan de pagos'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Monto total</Label>
                <Input type="number" value={planForm.monto_total}
                  onChange={e => setPlanForm(f => ({ ...f, monto_total: e.target.value }))} placeholder="100000" />
              </div>
              <div className="space-y-1.5">
                <Label>Moneda</Label>
                <Select value={planForm.moneda_base} onValueChange={v => setPlanForm(f => ({ ...f, moneda_base: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="ARS">ARS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                {planForm.seña_monto ? (
                  <>
                    <Label>Seña / Anticipo</Label>
                    <Input type="number" value={planForm.seña_monto}
                      onChange={e => setPlanForm(f => ({ ...f, seña_monto: e.target.value }))} placeholder="0" />
                    {planForm.monto_total && (
                      <p className="text-xs text-muted-foreground">
                        Saldo: {fmt(Math.max(0, (parseFloat(planForm.monto_total) || 0) - (parseFloat(planForm.seña_monto) || 0)), planForm.moneda_base as 'USD' | 'ARS')}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <Label>% Anticipo</Label>
                    <Input type="number" value={planForm.anticipo_pct}
                      onChange={e => setPlanForm(f => ({ ...f, anticipo_pct: e.target.value }))} placeholder="30" />
                  </>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>N° cuotas</Label>
                <Input type="number" value={planForm.n_cuotas}
                  onChange={e => setPlanForm(f => ({ ...f, n_cuotas: e.target.value }))} placeholder="12" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Ajuste</Label>
              <Select value={planForm.tipo_ajuste} onValueChange={v => setPlanForm(f => ({ ...f, tipo_ajuste: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguno">Sin ajuste</SelectItem>
                  <SelectItem value="CAC">Índice CAC</SelectItem>
                  <SelectItem value="UVA">UVA</SelectItem>
                  <SelectItem value="porcentaje_fijo">% Fijo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Descripción (opcional)</Label>
              <Input value={planForm.descripcion}
                onChange={e => setPlanForm(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="Plan estándar 30+12" />
            </div>
            {planForm.monto_total && (
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
                <p className="font-medium text-foreground">Preview:</p>
                {buildInstallments().slice(0, 3).map(i => (
                  <p key={i.numero_cuota}>{i.numero_cuota}. {CONCEPTO_LABELS[i.concepto]} — {fmt(i.monto, planForm.moneda_base as 'USD' | 'ARS')} · {fmtDate(i.fecha_vencimiento)}</p>
                ))}
                {buildInstallments().length > 3 && <p>... y {buildInstallments().length - 3} cuota/s más</p>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreatePlan(false)}>Cancelar</Button>
            <Button onClick={handleCreatePlan} disabled={saving}>
              {saving ? 'Guardando...' : plan ? 'Actualizar plan' : 'Crear plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Editar pago */}
      <Dialog open={showEditRecord} onOpenChange={setShowEditRecord}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Monto pagado</Label>
                <Input type="number" value={editRecordForm.monto_pagado}
                  onChange={e => setEditRecordForm(f => ({ ...f, monto_pagado: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Moneda</Label>
                <Select value={editRecordForm.moneda} onValueChange={v => setEditRecordForm(f => ({ ...f, moneda: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="ARS">ARS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fecha de pago</Label>
                <Input type="date" value={editRecordForm.fecha_pago}
                  onChange={e => setEditRecordForm(f => ({ ...f, fecha_pago: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Método</Label>
                <Select value={editRecordForm.metodo_pago} onValueChange={v => setEditRecordForm(f => ({ ...f, metodo_pago: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="crypto">Crypto</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Referencia (opcional)</Label>
              <Input value={editRecordForm.referencia}
                onChange={e => setEditRecordForm(f => ({ ...f, referencia: e.target.value }))}
                placeholder="Nro. transferencia / cheque" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditRecord(false)}>Cancelar</Button>
            <Button onClick={handleUpdateRecord} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Registrar pago */}
      <Dialog open={showRegisterPayment} onOpenChange={setShowRegisterPayment}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar pago</DialogTitle>
          </DialogHeader>
          {selectedInstallment && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                {CONCEPTO_LABELS[selectedInstallment.concepto]} #{selectedInstallment.numero_cuota} —{' '}
                <span className="font-medium text-foreground">{fmt(selectedInstallment.monto, selectedInstallment.moneda)}</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Monto pagado</Label>
                  <Input type="number" value={payForm.monto_pagado}
                    onChange={e => setPayForm(f => ({ ...f, monto_pagado: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Moneda</Label>
                  <Select value={payForm.moneda} onValueChange={v => setPayForm(f => ({ ...f, moneda: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="ARS">ARS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Fecha de pago</Label>
                  <Input type="date" value={payForm.fecha_pago}
                    onChange={e => setPayForm(f => ({ ...f, fecha_pago: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Método</Label>
                  <Select value={payForm.metodo_pago} onValueChange={v => setPayForm(f => ({ ...f, metodo_pago: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="transferencia">Transferencia</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="efectivo">Efectivo</SelectItem>
                      <SelectItem value="crypto">Crypto</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Referencia (opcional)</Label>
                <Input value={payForm.referencia}
                  onChange={e => setPayForm(f => ({ ...f, referencia: e.target.value }))}
                  placeholder="Nro. transferencia / cheque" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegisterPayment(false)}>Cancelar</Button>
            <Button onClick={handleRegisterPayment} disabled={saving}>
              {saving ? 'Guardando...' : 'Registrar pago'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

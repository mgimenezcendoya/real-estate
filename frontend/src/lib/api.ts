const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const AUTH_TOKEN_KEY = 'realia_token';

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  else sessionStorage.removeItem(AUTH_TOKEN_KEY);
}

async function fetcher<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    ...(!(options?.body instanceof FormData) && { 'Content-Type': 'application/json' }),
    ...(options?.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body.detail || body.error || body.message || `Error ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return res.json();
}

// --- Types ---
export interface Organization {
  id: string;
  name: string;
  tipo: 'desarrolladora' | 'inmobiliaria' | 'ambas';
  cuit?: string;
  activa: boolean;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  role: 'superadmin' | 'admin' | 'gerente' | 'vendedor' | 'lector';
  activo: boolean;
  debe_cambiar_password: boolean;
  ultimo_acceso: string | null;
  created_at: string;
  organization_id: string;
  organization_name: string;
}

export interface Project {
  id: string;
  organization_id: string;
  developer_id?: string; // legacy alias
  name: string;
  slug: string;
  address: string;
  neighborhood: string;
  city: string;
  description: string;
  amenities: string[];
  total_floors: number;
  total_units: number;
  construction_start: string;
  estimated_delivery: string;
  delivery_status: string;
  payment_info: string;
  whatsapp_number: string;
  status: string;
  created_at: string;
}

export interface Unit {
  id: string;
  identifier: string;
  floor: number;
  bedrooms: number;
  area_m2: number;
  price_usd: number;
  status: 'available' | 'reserved' | 'sold';
}

export interface UnitFieldHistory {
  id: string;
  field: string;
  old_value: number | null;
  new_value: number;
  changed_at: string;
}

export interface Lead {
  id: string;
  project_id: string;
  phone: string;
  name: string;
  intent: string;
  financing?: string;
  timeline?: string;
  budget_usd: number;
  bedrooms: number;
  location_pref: string;
  score?: 'hot' | 'warm' | 'cold' | null;
  source?: string;
  created_at: string;
  last_contact?: string;
  project_name?: string;
}

export interface Conversation {
  id: string;
  role: 'user' | 'assistant' | 'system';
  sender_type: 'lead' | 'ai' | 'agent' | 'human' | 'telegram';
  content: string;
  media_type: string | null;
  created_at: string;
}

export interface Document {
  id: string;
  doc_type: string;
  filename: string;
  file_url: string;
  unit_identifier: string | null;
  floor: number | null;
  version: number;
  uploaded_at: string;
}

export interface Metrics {
  total_leads: number;
  hot: number;
  warm: number;
  cold: number;
}

export interface AuthorizedNumber {
  id: string;
  phone: string;
  project_id: string;
  role: string;
  name: string;
  status: string;
  created_at: string;
}

export interface LeadNote {
  id: string;
  author_name: string | null;
  note: string;
  created_at: string;
}

export interface Analytics {
  funnel: {
    leads_total: number;
    leads_hot: number;
    units_reserved: number;
    units_sold: number;
  };
  revenue: {
    potential_usd: number;
    reserved_usd: number;
    sold_usd: number;
  };
  weekly_leads: Array<{ week: string; hot: number; warm: number; cold: number }>;
  lead_sources: Array<{ source: string; count: number }>;
}

export interface ObraFoto {
  id: string;
  update_id: string;
  file_url: string;
  filename: string;
  scope: 'general' | 'unit' | 'floor';
  unit_identifier: string | null;
  floor: number | null;
  caption: string | null;
}

export interface ObraUpdate {
  id: string;
  etapa_id: string | null;
  fecha: string;
  nota_publica: string | null;
  nota_interna: string | null;
  scope: 'general' | 'unit' | 'floor';
  unit_identifier: string | null;
  floor: number | null;
  enviado: boolean;
  created_at: string;
  fotos: ObraFoto[];
}

export interface ObraEtapa {
  id: string;
  project_id: string;
  nombre: string;
  orden: number;
  peso_pct: number;
  es_standard: boolean;
  activa: boolean;
  porcentaje_completado: number;
  updates: ObraUpdate[];
}

export interface ObraData {
  etapas: ObraEtapa[];
  progress: number;
}

export interface Buyer {
  id: string;
  lead_id: string | null;
  unit_id: string;
  phone: string;
  name: string | null;
  signed_at: string | null;
  status: string;
  unit_identifier: string;
  unit_floor: number;
  bedrooms: number;
  area_m2: number;
  price_usd: number;
}

export interface Reservation {
  id: string;
  project_id: string;
  unit_id: string;
  lead_id: string | null;
  buyer_name: string | null;
  buyer_phone: string;
  buyer_email: string | null;
  amount_usd: number | null;
  payment_method: 'efectivo' | 'transferencia' | 'cheque' | 'financiacion' | null;
  notes: string | null;
  signed_at: string | null;
  status: 'active' | 'cancelled' | 'converted';
  created_at: string;
  unit_identifier: string;
  unit_floor: number;
  unit_bedrooms: number;
  unit_area_m2: number;
  unit_price_usd: number;
  project_name?: string;
  project_address?: string;
}

// --- Payment Plan types ---
export interface PaymentRecord {
  id: string;
  installment_id: string;
  fecha_pago: string;
  monto_pagado: number;
  moneda: 'USD' | 'ARS';
  metodo_pago: string;
  referencia: string | null;
  notas: string | null;
  created_at: string;
}

export interface PaymentInstallment {
  id: string;
  plan_id: string;
  numero_cuota: number;
  concepto: 'anticipo' | 'cuota' | 'saldo';
  monto: number;
  moneda: 'USD' | 'ARS';
  fecha_vencimiento: string;
  estado: 'pendiente' | 'pagado' | 'vencido' | 'parcial';
  notas: string | null;
  records: PaymentRecord[];
}

export interface PaymentPlan {
  id: string;
  reservation_id: string;
  descripcion: string | null;
  moneda_base: 'USD' | 'ARS';
  monto_total: number;
  tipo_ajuste: string;
  porcentaje_ajuste: number | null;
  created_at: string;
  installments: PaymentInstallment[];
}

// --- Factura types ---
export interface Factura {
  id: string;
  project_id: string;
  tipo: 'A' | 'B' | 'C' | 'recibo' | 'otro';
  numero_factura: string | null;
  proveedor_nombre: string | null;
  proveedor_supplier: string | null;
  cuit_emisor: string | null;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  monto_neto: number | null;
  iva_pct: number | null;
  monto_total: number;
  moneda: 'USD' | 'ARS';
  categoria: 'egreso' | 'ingreso';
  file_url: string | null;
  gasto_id: string | null;
  estado: 'cargada' | 'vinculada' | 'pagada';
  notas: string | null;
  created_at: string;
  payment_record_id: string | null;
  linked_buyer_name: string | null;
  linked_cuota: number | null;
  linked_monto: number | null;
  linked_moneda: string | null;
  linked_fecha_pago: string | null;
}

export interface LinkablePayment {
  id: string;
  buyer_name: string | null;
  numero_cuota: number;
  concepto: string;
  monto_pagado: number;
  moneda: 'USD' | 'ARS';
  fecha_pago: string;
}

export interface CashFlowRow {
  mes: string; // 'YYYY-MM'
  ingresos: number;
  egresos: number;
  proyeccion: number;
  saldo: number;
  acumulado: number;
}

// --- Financial types ---
export interface BudgetItem {
  id: string;
  categoria: string;
  descripcion?: string | null;
  monto_usd: number | null;
  monto_ars: number | null;
  etapa_id?: string | null;
  etapa_nombre?: string | null;
  created_at?: string;
}

export interface Expense {
  id: string;
  budget_id: string | null;
  proveedor: string | null;
  descripcion: string;
  monto_usd: number | null;
  monto_ars: number | null;
  fecha: string;
  comprobante_url: string | null;
  created_at: string;
  categoria?: string | null;
  source?: 'expense' | 'obra';
  etapa_nombre?: string | null;
}

export interface FinancialSummary {
  presupuesto_total_usd: number;
  ejecutado_usd: number;
  desvio_usd: number;
  desvio_pct: number;
  revenue_esperado_usd: number;
  margen_esperado_pct: number;
  tipo_cambio: number;
  por_categoria: Array<{
    categoria: string;
    presupuesto_usd: number;
    ejecutado_usd: number;
    desvio_pct: number;
  }>;
}

// --- Investor types ---
export interface Investor {
  id: string;
  project_id?: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  monto_aportado_usd: number | null;
  fecha_aporte: string | null;
  porcentaje_participacion: number | null;
  created_at: string;
}

export interface InvestorReport {
  id: string;
  titulo: string;
  periodo_desde: string | null;
  periodo_hasta: string | null;
  enviado_at: string | null;
  created_at: string;
}

export interface InvestorReportPreview {
  html: string;
  progress: number;
  units: { disponibles: number; reservadas: number; vendidas: number; revenue_usd: number };
  fotos: Array<{ file_url: string; caption: string | null }>;
}

// --- Alert types ---
export interface Alert {
  id: string;
  project_id: string;
  tipo: string;
  titulo: string;
  descripcion: string | null;
  severidad: 'info' | 'warning' | 'critical';
  leida: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// --- Exchange Rate types ---
export interface ExchangeRate {
  tipo: string;
  nombre: string;
  compra: number;
  venta: number;
  fecha: string;
}

export interface ExchangeRateHistory {
  fecha: string;
  compra: number;
  venta: number;
}

// --- Supplier & Payment types ---
export interface Supplier {
  id: string;
  nombre: string;
  cuit: string | null;
  rubro: string | null;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  created_at: string;
}

export interface ObraPayment {
  id: string;
  supplier_id: string | null;
  etapa_id: string | null;
  budget_id: string | null;
  descripcion: string;
  monto_usd: number | null;
  monto_ars: number | null;
  fecha_vencimiento: string | null;
  estado: 'pendiente' | 'aprobado' | 'pagado' | 'vencido';
  fecha_pago: string | null;
  comprobante_url: string | null;
  created_at: string;
  supplier_nombre?: string | null;
  etapa_nombre?: string | null;
}

// --- API calls ---
export const api = {
  getProjects: () => fetcher<Project[]>('/admin/projects'),
  getProject: (id: string) => fetcher<Project>(`/admin/projects/${id}`),
  updateProject: (id: string, data: Partial<Project>) =>
    fetcher(`/admin/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  getUnits: (projectId: string) => fetcher<Unit[]>(`/admin/units/${projectId}`),
  updateUnitStatus: (unitId: string, status: string) =>
    fetcher(`/admin/units/${unitId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  updateUnit: (unitId: string, data: { price_usd?: number; area_m2?: number; bedrooms?: number; floor?: number }) =>
    fetcher<Unit>(`/admin/units/${unitId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getUnitHistory: (unitId: string) =>
    fetcher<UnitFieldHistory[]>(`/admin/units/${unitId}/history`),

  getLeads: (projectId?: string, score?: string) => {
    const params = new URLSearchParams();
    if (projectId) params.append('project_id', projectId);
    if (score) params.append('score', score);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return fetcher<Lead[]>(`/admin/leads${queryString}`);
  },
  getLead: (id: string) => fetcher<Lead & { conversations: Conversation[] }>(`/admin/leads/${id}`),

  sendLeadMessage: async (leadId: string, content: string): Promise<void> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (getAuthToken()) headers['Authorization'] = `Bearer ${getAuthToken()}`;
    const res = await fetch(`${BASE_URL}/admin/leads/${leadId}/message`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error('Failed to send message');
  },

  getLeadHandoff: (leadId: string) =>
    fetcher<{ active: boolean; handoff_id: string | null }>(`/admin/leads/${leadId}/handoff`),

  startLeadHandoff: (leadId: string) =>
    fetcher<{ ok: boolean; handoff_id: string }>(`/admin/leads/${leadId}/handoff/start`, { method: 'POST' }),

  closeLeadHandoff: (leadId: string) =>
    fetcher<{ ok: boolean; closed: boolean }>(`/admin/leads/${leadId}/handoff/close`, { method: 'POST' }),

  getMetrics: (projectId: string) => fetcher<Metrics>(`/admin/metrics/${projectId}`),

  getAnalytics: (projectId: string) => fetcher<Analytics>(`/admin/analytics/${projectId}`),

  getLeadNotes: (leadId: string) => fetcher<LeadNote[]>(`/admin/leads/${leadId}/notes`),
  addLeadNote: (leadId: string, note: string, authorName?: string) =>
    fetcher<LeadNote>(`/admin/leads/${leadId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ note, author_name: authorName }),
    }),
  deleteLeadNote: (leadId: string, noteId: string) =>
    fetcher<{ deleted: boolean }>(`/admin/leads/${leadId}/notes/${noteId}`, { method: 'DELETE' }),
  updateLead: (leadId: string, fields: Partial<Pick<Lead, 'name' | 'score' | 'source' | 'budget_usd' | 'intent' | 'timeline' | 'financing' | 'bedrooms' | 'location_pref'>>) =>
    fetcher(`/admin/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify(fields) }),

  getDocuments: (projectId: string, docType?: string) =>
    fetcher<Document[]>(`/admin/documents/${projectId}${docType ? `?doc_type=${docType}` : ''}`),

  uploadDocument: (formData: FormData) => {
    const headers: Record<string, string> = {};
    if (getAuthToken()) headers['Authorization'] = `Bearer ${getAuthToken()}`;
    return fetch(`${BASE_URL}/admin/upload-document`, { method: 'POST', headers, body: formData }).then(r => r.json());
  },

  loadProject: (csvFile: File, developerId: string) => {
    const formData = new FormData();
    formData.append('csv_file', csvFile);
    formData.append('developer_id', developerId);
    const headers: Record<string, string> = {};
    if (getAuthToken()) headers['Authorization'] = `Bearer ${getAuthToken()}`;
    return fetch(`${BASE_URL}/admin/load-project`, { method: 'POST', headers, body: formData }).then(r => r.json());
  },

  getTemplateUrl: () => `${BASE_URL}/admin/project-template/download`,

  // Obra
  initObra: (projectId: string) =>
    fetcher(`/admin/obra/${projectId}/init`, { method: 'POST' }),
  getObra: (projectId: string) =>
    fetcher<ObraData>(`/admin/obra/${projectId}`),
  patchEtapa: (etapaId: string, data: Partial<Pick<ObraEtapa, 'nombre' | 'peso_pct' | 'porcentaje_completado' | 'activa'>>) =>
    fetcher(`/admin/obra/etapas/${etapaId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  updatePesos: (projectId: string, pesos: Array<{ id: string; peso_pct: number }>) =>
    fetcher<{ ok: boolean }>(`/admin/obra/${projectId}/pesos`, { method: 'PUT', body: JSON.stringify(pesos) }),
  addEtapa: (projectId: string, data: { nombre: string; peso_pct: number }) =>
    fetcher<ObraEtapa>(`/admin/obra/${projectId}/etapas`, { method: 'POST', body: JSON.stringify(data) }),
  createObraUpdate: (projectId: string, formData: FormData) => {
    const headers: Record<string, string> = {};
    if (getAuthToken()) headers['Authorization'] = `Bearer ${getAuthToken()}`;
    return fetch(`${BASE_URL}/admin/obra/${projectId}/updates`, { method: 'POST', headers, body: formData }).then(r => r.json());
  },
  deleteObraUpdate: (updateId: string) =>
    fetcher<{ deleted: boolean }>(`/admin/obra/updates/${updateId}`, { method: 'DELETE' }),
  notifyBuyers: (projectId: string, updateId: string) =>
    fetcher<{ sent: number }>(`/admin/obra/${projectId}/notify/${updateId}`, { method: 'POST' }),

  // Buyers
  getBuyers: (projectId: string) =>
    fetcher<Buyer[]>(`/admin/buyers/${projectId}`),
  registerBuyer: (projectId: string, data: { unit_id: string; name: string; phone: string; lead_id?: string; signed_at?: string }) =>
    fetcher<{ id: string; name: string; phone: string }>(`/admin/buyers/${projectId}`, { method: 'POST', body: JSON.stringify(data) }),

  // Reservations
  getReservations: (projectId: string, status?: string) =>
    fetcher<Reservation[]>(`/admin/reservations/${projectId}${status ? `?status=${status}` : ''}`),
  getReservation: (reservationId: string) =>
    fetcher<Reservation>(`/admin/reservation/${reservationId}`),
  createReservation: (projectId: string, data: { unit_id: string; lead_id?: string | null; buyer_name?: string; buyer_phone: string; buyer_email?: string; amount_usd?: number; payment_method?: string; notes?: string; signed_at?: string }) =>
    fetcher<Reservation>(`/admin/reservations/${projectId}`, { method: 'POST', body: JSON.stringify(data) }),
  createDirectSale: (projectId: string, data: { unit_id: string; buyer_name?: string; buyer_phone: string; buyer_email?: string; amount_usd?: number; payment_method?: string; notes?: string; signed_at?: string }) =>
    fetcher<{ reservation_id: string; status: string }>(`/admin/reservations/${projectId}/direct-sale`, { method: 'POST', body: JSON.stringify(data) }),
  patchReservation: (reservationId: string, status: 'cancelled' | 'converted') =>
    fetcher<{ reservation_id: string; status: string }>(`/admin/reservations/${reservationId}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  // --- Financials ---
  getFinancialSummary: (projectId: string) =>
    fetcher<FinancialSummary>(`/admin/financials/${projectId}/summary`),
  getExpenses: (projectId: string, params?: { categoria?: string; fecha_desde?: string; fecha_hasta?: string }) => {
    const qs = new URLSearchParams();
    if (params?.categoria) qs.append('categoria', params.categoria);
    if (params?.fecha_desde) qs.append('fecha_desde', params.fecha_desde);
    if (params?.fecha_hasta) qs.append('fecha_hasta', params.fecha_hasta);
    const q = qs.toString() ? `?${qs}` : '';
    return fetcher<Expense[]>(`/admin/financials/${projectId}/expenses${q}`);
  },
  createExpense: (projectId: string, data: Omit<Expense, 'id' | 'created_at' | 'categoria'>) =>
    fetcher<Expense>(`/admin/financials/${projectId}/expenses`, { method: 'POST', body: JSON.stringify(data) }),
  patchExpense: (projectId: string, expenseId: string, data: Partial<Expense>) =>
    fetcher<{ updated: boolean }>(`/admin/financials/${projectId}/expenses/${expenseId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteExpense: (projectId: string, expenseId: string) =>
    fetcher<{ deleted: boolean }>(`/admin/financials/${projectId}/expenses/${expenseId}`, { method: 'DELETE' }),
  getBudget: (projectId: string) =>
    fetcher<BudgetItem[]>(`/admin/financials/${projectId}/budget`),
  upsertBudget: (projectId: string, data: Omit<BudgetItem, 'id' | 'created_at' | 'etapa_nombre'>) =>
    fetcher<BudgetItem>(`/admin/financials/${projectId}/budget`, { method: 'POST', body: JSON.stringify(data) }),
  patchBudget: (projectId: string, budgetId: string, data: Omit<BudgetItem, 'id' | 'created_at' | 'etapa_nombre'>) =>
    fetcher<BudgetItem>(`/admin/financials/${projectId}/budget/${budgetId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteBudget: (projectId: string, budgetId: string) =>
    fetcher<void>(`/admin/financials/${projectId}/budget/${budgetId}`, { method: 'DELETE' }),
  patchFinancialsConfig: (projectId: string, tipo_cambio_usd_ars: number) =>
    fetcher<{ tipo_cambio: number }>(`/admin/financials/${projectId}/config`, { method: 'PATCH', body: JSON.stringify({ tipo_cambio_usd_ars }) }),

  // --- Investors ---
  getInvestors: (projectId: string) =>
    fetcher<Investor[]>(`/admin/investors/${projectId}`),
  createInvestor: (projectId: string, data: Omit<Investor, 'id' | 'created_at'>) =>
    fetcher<Investor>(`/admin/investors/${projectId}`, { method: 'POST', body: JSON.stringify(data) }),
  patchInvestor: (projectId: string, investorId: string, data: Partial<Investor>) =>
    fetcher<{ updated: boolean }>(`/admin/investors/${projectId}/${investorId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteInvestor: (projectId: string, investorId: string) =>
    fetcher<{ deleted: boolean }>(`/admin/investors/${projectId}/${investorId}`, { method: 'DELETE' }),
  previewInvestorReport: (projectId: string) =>
    fetcher<InvestorReportPreview>(`/admin/investors/${projectId}/report/preview`),
  sendInvestorReport: (projectId: string, data: { titulo?: string; periodo_desde?: string; periodo_hasta?: string }) =>
    fetcher<{ report_id: string; enviado_a: number }>(`/admin/investors/${projectId}/report/send`, { method: 'POST', body: JSON.stringify(data) }),
  getInvestorReportHistory: (projectId: string) =>
    fetcher<InvestorReport[]>(`/admin/investors/${projectId}/report/history`),

  // --- Alerts ---
  getAlerts: (projectId?: string) => {
    const q = projectId ? `?project_id=${projectId}` : '';
    return fetcher<Alert[]>(`/admin/alerts${q}`);
  },
  markAlertRead: (alertId: string) =>
    fetcher<{ ok: boolean }>(`/admin/alerts/${alertId}/read`, { method: 'POST' }),
  markAllAlertsRead: (projectId?: string) => {
    const q = projectId ? `?project_id=${projectId}` : '';
    return fetcher<{ ok: boolean }>(`/admin/alerts/read-all${q}`, { method: 'POST' });
  },

  // --- Suppliers ---
  getSuppliers: () => fetcher<Supplier[]>('/admin/suppliers'),
  createSupplier: (data: Omit<Supplier, 'id' | 'created_at'>) =>
    fetcher<Supplier>('/admin/suppliers', { method: 'POST', body: JSON.stringify(data) }),
  patchSupplier: (supplierId: string, data: Partial<Supplier>) =>
    fetcher<{ updated: boolean }>(`/admin/suppliers/${supplierId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSupplier: (supplierId: string) =>
    fetcher<{ deleted: boolean }>(`/admin/suppliers/${supplierId}`, { method: 'DELETE' }),

  // --- Obra Payments ---
  getObraPayments: (projectId: string, estado?: string) => {
    const q = estado ? `?estado=${estado}` : '';
    return fetcher<ObraPayment[]>(`/admin/obra-payments/${projectId}${q}`);
  },
  createObraPayment: (projectId: string, data: Omit<ObraPayment, 'id' | 'created_at' | 'supplier_nombre' | 'etapa_nombre'>) =>
    fetcher<ObraPayment>(`/admin/obra-payments/${projectId}`, { method: 'POST', body: JSON.stringify(data) }),
  patchObraPayment: (paymentId: string, data: Partial<ObraPayment>) =>
    fetcher<{ updated: boolean; estado: string }>(`/admin/obra-payments/${paymentId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getVencimientos: (projectId: string) =>
    fetcher<ObraPayment[]>(`/admin/obra-payments/${projectId}/vencimientos`),

  // --- Exchange Rates ---
  getExchangeRates: () => fetcher<ExchangeRate[]>('/admin/tools/exchange-rates'),
  getExchangeRateHistory: (tipo: string, days?: number) =>
    fetcher<ExchangeRateHistory[]>(`/admin/tools/exchange-rates/history/${tipo}${days ? `?days=${days}` : ''}`),

  // --- Payment Plans ---
  getPaymentPlan: (reservationId: string) => fetcher<PaymentPlan | null>(`/admin/payment-plans/${reservationId}`),
  createPaymentPlan: (reservationId: string, data: {
    descripcion?: string; moneda_base?: string; monto_total: number;
    tipo_ajuste?: string; porcentaje_ajuste?: number;
    installments: Array<{ numero_cuota: number; concepto?: string; monto: number; moneda?: string; fecha_vencimiento: string; notas?: string }>;
  }) => fetcher<{ plan_id: string; installments_created: number }>(`/admin/payment-plans/${reservationId}`, { method: 'POST', body: JSON.stringify(data) }),
  patchInstallment: (installmentId: string, data: { estado?: string; notas?: string; monto?: number; fecha_vencimiento?: string }) =>
    fetcher<{ id: string; estado: string; monto: number; fecha_vencimiento: string }>(`/admin/payment-installments/${installmentId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  createPaymentRecord: (data: { installment_id: string; fecha_pago: string; monto_pagado: number; moneda?: string; metodo_pago?: string; referencia?: string; notas?: string }) =>
    fetcher<{ record_id: string }>('/admin/payment-records', { method: 'POST', body: JSON.stringify(data) }),
  updatePaymentRecord: (recordId: string, data: { fecha_pago?: string; monto_pagado?: number; moneda?: string; metodo_pago?: string; referencia?: string; notas?: string }) =>
    fetcher<{ ok: boolean }>(`/admin/payment-records/${recordId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePaymentRecord: (recordId: string) =>
    fetcher<{ ok: boolean }>(`/admin/payment-records/${recordId}`, { method: 'DELETE' }),

  // --- Facturas ---
  getFacturas: (projectId: string, params?: { categoria?: string; tipo?: string; proveedor?: string; fecha_desde?: string; fecha_hasta?: string }) => {
    const qs = new URLSearchParams();
    if (params?.categoria) qs.set('categoria', params.categoria);
    if (params?.tipo) qs.set('tipo', params.tipo);
    if (params?.proveedor) qs.set('proveedor', params.proveedor);
    if (params?.fecha_desde) qs.set('fecha_desde', params.fecha_desde);
    if (params?.fecha_hasta) qs.set('fecha_hasta', params.fecha_hasta);
    const q = qs.toString();
    return fetcher<Factura[]>(`/admin/facturas/${projectId}${q ? `?${q}` : ''}`);
  },
  createFactura: (projectId: string, data: Omit<Factura, 'id' | 'project_id' | 'proveedor_supplier' | 'created_at' | 'gasto_id' | 'linked_buyer_name' | 'linked_cuota' | 'linked_monto' | 'linked_moneda' | 'linked_fecha_pago'> & { gasto_id?: string | null; crear_gasto?: boolean; gasto_descripcion?: string; gasto_budget_id?: string }) =>
    fetcher<{ factura_id: string; gasto_id: string | null }>(`/admin/facturas/${projectId}`, { method: 'POST', body: JSON.stringify(data) }),
  patchFactura: (facturaId: string, data: Partial<Omit<Factura, 'id' | 'project_id' | 'proveedor_supplier' | 'created_at'>>) =>
    fetcher<{ ok: boolean }>(`/admin/facturas/${facturaId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteFactura: (facturaId: string) =>
    fetcher<{ ok: boolean }>(`/admin/facturas/${facturaId}`, { method: 'DELETE' }),
  uploadFacturaPdf: (projectId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return fetcher<{ file_url: string }>(`/admin/facturas/${projectId}/upload-pdf`, {
      method: 'POST',
      body: form,
    });
  },
  getLinkablePayments: (projectId: string, q?: string) =>
    fetcher<LinkablePayment[]>(
      `/admin/facturas/${projectId}/linkable-payments${q ? `?q=${encodeURIComponent(q)}` : ''}`,
    ),

  // --- Cash Flow ---
  getCashFlow: (projectId: string) =>
    fetcher<CashFlowRow[]>(`/admin/cash-flow/${projectId}`),

  // --- Users ---
  getUsers: () => fetcher<User[]>('/admin/users'),
  getUser: (id: string) => fetcher<User>(`/admin/users/${id}`),
  createUser: (data: { organization_id: string; email: string; password: string; nombre: string; apellido?: string; role?: string }) =>
    fetcher<User>('/admin/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: { nombre?: string; apellido?: string; role?: string; activo?: boolean }) =>
    fetcher<User>(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id: string) =>
    fetcher<{ ok: boolean }>(`/admin/users/${id}`, { method: 'DELETE' }),
  resetUserPassword: (id: string, newPassword: string) =>
    fetcher<{ ok: boolean }>(`/admin/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ new_password: newPassword }) }),

  // --- Organizations ---
  getOrganizations: () => fetcher<Organization[]>('/admin/organizations'),

  login: (username: string, password: string) =>
    fetch(`${BASE_URL}/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.detail || data.error || 'Error al iniciar sesión';
        throw new Error(typeof msg === 'string' ? msg : msg.message || 'Error al iniciar sesión');
      }
      return data as { token: string; user: string; role: string; nombre?: string; user_id?: string; organization_id?: string; debe_cambiar_password?: boolean };
    }),

  authMe: () => fetcher<{ user: string | null; role?: string; nombre?: string; user_id?: string; organization_id?: string; debe_cambiar_password?: boolean }>('/admin/auth/me'),
  changePassword: (current_password: string, new_password: string) =>
    fetcher<{ ok: boolean }>('/admin/auth/change-password', { method: 'POST', body: JSON.stringify({ current_password, new_password }) }),
};

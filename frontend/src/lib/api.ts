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
    'Content-Type': 'application/json',
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
export interface Project {
  id: string;
  developer_id: string;
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

// --- API calls ---
export const api = {
  getProjects: () => fetcher<Project[]>('/admin/projects'),
  getProject: (id: string) => fetcher<Project>(`/admin/projects/${id}`),
  updateProject: (id: string, data: Partial<Project>) =>
    fetcher(`/admin/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  getUnits: (projectId: string) => fetcher<Unit[]>(`/admin/units/${projectId}`),
  updateUnitStatus: (unitId: string, status: string) =>
    fetcher(`/admin/units/${unitId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),

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
  patchReservation: (reservationId: string, status: 'cancelled' | 'converted') =>
    fetcher<{ reservation_id: string; status: string }>(`/admin/reservations/${reservationId}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

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
      return data as { token: string; user: string };
    }),

  authMe: () => fetcher<{ user: string | null }>('/admin/auth/me'),
};

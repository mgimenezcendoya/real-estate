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
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
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
  sender_type: 'lead' | 'ai' | 'agent' | 'human';
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

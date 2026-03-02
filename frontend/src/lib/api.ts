const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function fetcher<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
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
  financing: string;
  timeline: string;
  budget_usd: number;
  bedrooms: number;
  location_pref: string;
  score: 'hot' | 'warm' | 'cold';
  source: string;
  created_at: string;
  last_contact: string;
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

  getLeads: (projectId: string, score?: string) =>
    fetcher<Lead[]>(`/admin/leads?project_id=${projectId}${score ? `&score=${score}` : ''}`),
  getLead: (id: string) => fetcher<Lead>(`/admin/leads/${id}`),

  getMetrics: (projectId: string) => fetcher<Metrics>(`/admin/metrics/${projectId}`),

  getDocuments: (projectId: string, docType?: string) =>
    fetcher<Document[]>(`/admin/documents/${projectId}${docType ? `?doc_type=${docType}` : ''}`),

  uploadDocument: (formData: FormData) =>
    fetch(`${BASE_URL}/admin/upload-document`, { method: 'POST', body: formData }).then(r => r.json()),

  loadProject: (csvFile: File, developerId: string) => {
    const formData = new FormData();
    formData.append('csv_file', csvFile);
    formData.append('developer_id', developerId);
    return fetch(`${BASE_URL}/admin/load-project`, { method: 'POST', body: formData }).then(r => r.json());
  },

  getTemplateUrl: () => `${BASE_URL}/admin/project-template/download`,
};

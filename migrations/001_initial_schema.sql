-- Realia: Initial schema
-- Requires: PostgreSQL with pgvector extension

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================
-- Core
-- ============================================================

CREATE TABLE developers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    contact_phone TEXT,
    contact_email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id UUID REFERENCES developers(id),
    name TEXT NOT NULL,
    whatsapp_number TEXT UNIQUE,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id),
    identifier TEXT,
    floor INT,
    bedrooms INT,
    area_m2 DECIMAL,
    price_usd DECIMAL,
    status VARCHAR(20) DEFAULT 'available',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE authorized_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT NOT NULL,
    project_id UUID REFERENCES projects(id),
    role VARCHAR(20) NOT NULL,
    name TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    activation_code VARCHAR(6),
    activated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(phone, project_id)
);

-- ============================================================
-- Leads & Conversations
-- ============================================================

CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id),
    phone TEXT NOT NULL,
    name TEXT,
    intent VARCHAR(20),
    financing VARCHAR(20),
    timeline VARCHAR(20),
    score VARCHAR(10),
    source TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_contact TIMESTAMPTZ
);

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id),
    wa_message_id TEXT UNIQUE,
    role VARCHAR(10),
    sender_type VARCHAR(10) DEFAULT 'agent',
    sender_id UUID,
    handoff_id UUID,
    content TEXT,
    media_type VARCHAR(20),
    media_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sessions (
    phone TEXT NOT NULL,
    project_id UUID REFERENCES projects(id),
    lead_id UUID REFERENCES leads(id),
    state JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (phone, project_id)
);

-- ============================================================
-- RAG
-- ============================================================

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id),
    doc_type VARCHAR(50),
    filename TEXT,
    file_url TEXT,
    file_size_bytes BIGINT,
    unit_identifier TEXT,
    floor INT,
    version INT DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    source VARCHAR(20) DEFAULT 'whatsapp',
    uploaded_by UUID REFERENCES authorized_numbers(id),
    rag_status VARCHAR(20) DEFAULT 'pending',
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id),
    project_id UUID NOT NULL,
    content TEXT,
    embedding VECTOR(1536),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Obra & Buyers
-- ============================================================

CREATE TABLE buyers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id),
    lead_id UUID REFERENCES leads(id),
    unit_id UUID REFERENCES units(id),
    phone TEXT NOT NULL,
    name TEXT,
    signed_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'active'
);

CREATE TABLE obra_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id),
    fecha DATE NOT NULL,
    etapa VARCHAR(50),
    porcentaje_avance INT,
    fotos_urls TEXT[],
    nota_publica TEXT,
    nota_interna TEXT,
    source VARCHAR(20) DEFAULT 'whatsapp',
    created_by UUID REFERENCES authorized_numbers(id),
    enviado BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE obra_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id),
    name TEXT NOT NULL,
    etapa VARCHAR(50),
    floor INT,
    completed_at TIMESTAMPTZ DEFAULT NOW(),
    notify_buyers BOOLEAN DEFAULT FALSE,
    notified BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES authorized_numbers(id)
);

-- ============================================================
-- Handoffs
-- ============================================================

CREATE TABLE handoffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id),
    project_id UUID REFERENCES projects(id),
    assigned_to UUID REFERENCES authorized_numbers(id),
    trigger VARCHAR(30) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    context_summary TEXT,
    lead_note TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Developer Conversations (internal)
-- ============================================================

CREATE TABLE developer_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    authorized_number_id UUID REFERENCES authorized_numbers(id),
    project_id UUID REFERENCES projects(id),
    role VARCHAR(10),
    content TEXT,
    media_type VARCHAR(20),
    media_url TEXT,
    action_type VARCHAR(30),
    action_result JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_leads_project_score ON leads(project_id, score);
CREATE INDEX idx_leads_phone ON leads(phone);
CREATE INDEX idx_conversations_lead ON conversations(lead_id, created_at);
CREATE INDEX idx_conversations_wa_msg ON conversations(wa_message_id);
CREATE INDEX idx_document_chunks_project ON document_chunks(project_id);
CREATE INDEX idx_handoffs_lead ON handoffs(lead_id, status);
CREATE INDEX idx_authorized_phone ON authorized_numbers(phone, project_id);

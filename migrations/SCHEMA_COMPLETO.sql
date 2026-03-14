-- =============================================================================
-- REALIA — Schema Completo Consolidado
-- =============================================================================
-- Este archivo consolida TODAS las migraciones en orden (001 → 028) para
-- facilitar la creación de una DB desde cero o como referencia del estado
-- actual del schema.
--
-- Para crear una DB nueva: ejecutar este archivo completo.
-- Para DBs existentes: aplicar solo las migraciones incrementales que faltan.
--
-- Migraciones sin archivo .sql (solo scripts Python):
--   008 — no existe
--   020 — migrate_factura_files.py   (migración de archivos S3, no DDL)
--   021 — migrate_all_files.py       (migración de archivos S3, no DDL)
--
-- Migraciones aplicadas en Neon según MEMORY.md: 001–007, 009–014, 016–022
-- Migraciones recientes (verificar si están aplicadas): 023–028
-- =============================================================================


-- ===== Migration 001: initial_schema =====

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================
-- Core
-- ============================================================

-- NOTE: Migration 016 renames this table to "organizations"
-- When creating from scratch, create it as "organizations" directly.
-- The incremental migration 016 handles the rename for existing DBs.
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    contact_phone TEXT,
    contact_email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    address TEXT,
    neighborhood TEXT,
    city TEXT DEFAULT 'CABA',
    description TEXT,
    amenities TEXT[],
    total_floors INT,
    total_units INT,
    construction_start DATE,
    estimated_delivery DATE,
    delivery_status VARCHAR(30) DEFAULT 'en_pozo',
    payment_info TEXT,
    whatsapp_number TEXT UNIQUE,
    status VARCHAR(20) DEFAULT 'active',
    lat FLOAT,
    lng FLOAT,
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

CREATE TABLE unit_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID NOT NULL REFERENCES units(id),
    author_name TEXT,
    note TEXT NOT NULL,
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
    budget_usd INTEGER,
    bedrooms SMALLINT,
    location_pref TEXT,
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
-- Indexes (001)
-- ============================================================

CREATE INDEX idx_leads_project_score ON leads(project_id, score);
CREATE INDEX idx_leads_phone ON leads(phone);
CREATE INDEX idx_conversations_lead ON conversations(lead_id, created_at);
CREATE INDEX idx_conversations_wa_msg ON conversations(wa_message_id);
CREATE INDEX idx_documents_project_active ON documents(project_id, is_active);
CREATE INDEX idx_document_chunks_project ON document_chunks(project_id);
CREATE INDEX idx_unit_notes_unit ON unit_notes(unit_id, created_at);
CREATE INDEX idx_handoffs_lead ON handoffs(lead_id, status);
CREATE INDEX idx_authorized_phone ON authorized_numbers(phone, project_id);
CREATE INDEX idx_projects_organization ON projects(organization_id);
CREATE INDEX idx_projects_slug ON projects(slug);
CREATE INDEX idx_dev_conversations_auth ON developer_conversations(authorized_number_id, created_at);


-- ===== Migration 002: lead_qualification_fields =====
-- Adds budget_usd, bedrooms, location_pref to leads (already included in 001 above for fresh DBs)

ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget_usd INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS bedrooms SMALLINT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS location_pref TEXT;


-- ===== Migration 003: project_details =====
-- Adds slug, address, neighborhood, city, description, amenities, floors, units, dates, delivery_status, payment_info
-- (already included in 001 above for fresh DBs)

ALTER TABLE projects ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS neighborhood TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS city TEXT DEFAULT 'CABA';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS amenities TEXT[];
ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_floors INT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_units INT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS construction_start DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS estimated_delivery DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(30) DEFAULT 'en_pozo';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS payment_info TEXT;


-- ===== Migration 004: unit_notes =====
-- Creates unit_notes table (already included in 001 above for fresh DBs)

CREATE TABLE IF NOT EXISTS unit_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID NOT NULL REFERENCES units(id),
    author_name TEXT,
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ===== Migration 006: lead_notes =====

CREATE TABLE IF NOT EXISTS lead_notes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    author_name TEXT,
    note        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON lead_notes(lead_id, created_at DESC);


-- ===== Migration 007: obra_etapas =====

CREATE TABLE IF NOT EXISTS obra_etapas (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    nombre                TEXT NOT NULL,
    orden                 INT NOT NULL,
    peso_pct              DECIMAL(5,2) NOT NULL DEFAULT 0,
    es_standard           BOOLEAN DEFAULT TRUE,
    activa                BOOLEAN DEFAULT TRUE,
    porcentaje_completado INT DEFAULT 0 CHECK (porcentaje_completado BETWEEN 0 AND 100),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_obra_etapas_order  ON obra_etapas(project_id, orden);
CREATE INDEX        IF NOT EXISTS idx_obra_etapas_project ON obra_etapas(project_id);

-- Link updates to a stage + add scope metadata
ALTER TABLE obra_updates
    ADD COLUMN IF NOT EXISTS etapa_id UUID REFERENCES obra_etapas(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS scope    VARCHAR(20) DEFAULT 'general';

-- Structured photo storage per update
CREATE TABLE IF NOT EXISTS obra_fotos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    update_id       UUID REFERENCES obra_updates(id) ON DELETE CASCADE,
    file_url        TEXT NOT NULL,
    filename        TEXT NOT NULL,
    scope           VARCHAR(20) DEFAULT 'general',  -- 'general' | 'unit' | 'floor'
    unit_identifier TEXT,
    floor           INT,
    caption         TEXT,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obra_fotos_update  ON obra_fotos(update_id);
CREATE INDEX IF NOT EXISTS idx_obra_fotos_project ON obra_fotos(project_id);


-- ===== Migration 008: (no .sql file — skipped) =====


-- ===== Migration 009: reservations =====

CREATE TABLE IF NOT EXISTS reservations (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    unit_id        UUID NOT NULL REFERENCES units(id),
    lead_id        UUID REFERENCES leads(id),
    buyer_name     TEXT,
    buyer_phone    TEXT NOT NULL,
    buyer_email    TEXT,
    amount_usd     DECIMAL,
    payment_method VARCHAR(30),   -- efectivo | transferencia | cheque | financiacion
    notes          TEXT,
    signed_at      DATE,
    status         VARCHAR(20) NOT NULL DEFAULT 'active',  -- active | cancelled | converted
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Una sola reserva activa por unidad
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_unit_active
    ON reservations(unit_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_reservations_project ON reservations(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_lead    ON reservations(lead_id) WHERE lead_id IS NOT NULL;


-- ===== Migration 010: authorized_numbers_test_mode =====

ALTER TABLE authorized_numbers
    ADD COLUMN IF NOT EXISTS test_mode BOOLEAN NOT NULL DEFAULT FALSE;


-- ===== Migration 011: financial_tracking =====

CREATE TABLE project_budget (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    categoria TEXT NOT NULL,
    descripcion TEXT,
    monto_usd DECIMAL(14,2),
    monto_ars DECIMAL(18,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    budget_id UUID REFERENCES project_budget(id) ON DELETE SET NULL,
    proveedor TEXT,
    descripcion TEXT NOT NULL,
    monto_usd DECIMAL(14,2),
    monto_ars DECIMAL(18,2),
    fecha DATE NOT NULL,
    comprobante_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_financials_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
    tipo_cambio_usd_ars DECIMAL(10,2) NOT NULL DEFAULT 1000,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_budget_project ON project_budget(project_id);
CREATE INDEX idx_project_expenses_project ON project_expenses(project_id);
CREATE INDEX idx_project_expenses_budget ON project_expenses(budget_id);
CREATE INDEX idx_project_expenses_fecha ON project_expenses(fecha);


-- ===== Migration 012: investors =====

CREATE TABLE investors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    email TEXT,
    telefono TEXT,
    monto_aportado_usd DECIMAL(14,2),
    fecha_aporte DATE,
    porcentaje_participacion DECIMAL(5,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE investor_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    contenido_html TEXT NOT NULL,
    periodo_desde DATE,
    periodo_hasta DATE,
    enviado_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_investors_project ON investors(project_id);
CREATE INDEX idx_investor_reports_project ON investor_reports(project_id);


-- ===== Migration 013: alerts =====

CREATE TABLE project_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    titulo TEXT NOT NULL,
    descripcion TEXT,
    severidad TEXT NOT NULL DEFAULT 'info',
    leida BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_alerts_project ON project_alerts(project_id);
CREATE INDEX idx_project_alerts_leida ON project_alerts(leida) WHERE NOT leida;


-- ===== Migration 014: suppliers =====

CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    cuit TEXT,
    rubro TEXT,
    telefono TEXT,
    email TEXT,
    notas TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE obra_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    etapa_id UUID REFERENCES obra_etapas(id) ON DELETE SET NULL,
    descripcion TEXT NOT NULL,
    monto_usd DECIMAL(14,2),
    monto_ars DECIMAL(18,2),
    fecha_vencimiento DATE,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    fecha_pago DATE,
    comprobante_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_obra_payments_project ON obra_payments(project_id);
CREATE INDEX idx_obra_payments_estado ON obra_payments(estado);
CREATE INDEX idx_obra_payments_vencimiento ON obra_payments(fecha_vencimiento);


-- ===== Migration 015: unit_price_history =====

CREATE TABLE IF NOT EXISTS unit_field_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id     UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  field       VARCHAR(50) NOT NULL,
  old_value   NUMERIC,
  new_value   NUMERIC NOT NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unit_field_history_unit_id ON unit_field_history(unit_id);


-- ===== Migration 016: organizations =====
-- Renames developers → organizations, adds tipo field and other columns.
-- For existing DBs only. Fresh DBs already have organizations table from above.

-- ALTER TABLE developers RENAME TO organizations;  -- already "organizations" for fresh DBs

CREATE TYPE organization_tipo AS ENUM ('desarrolladora', 'inmobiliaria', 'ambas');
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS tipo organization_tipo NOT NULL DEFAULT 'ambas';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cuit TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS telefono TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS activa BOOLEAN NOT NULL DEFAULT true;

-- For existing DBs (rename FK column):
-- ALTER TABLE projects RENAME COLUMN developer_id TO organization_id;
-- ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_developer_id_fkey;
-- ALTER TABLE projects ADD CONSTRAINT projects_organization_id_fkey
--   FOREIGN KEY (organization_id) REFERENCES organizations(id);
-- DROP INDEX IF EXISTS idx_projects_developer;
-- CREATE INDEX IF NOT EXISTS idx_projects_organization ON projects(organization_id);


-- ===== Migration 017: users =====

CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'gerente', 'vendedor', 'lector');

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  nombre          TEXT NOT NULL,
  apellido        TEXT NOT NULL DEFAULT '',
  role            user_role NOT NULL DEFAULT 'vendedor',
  activo          BOOLEAN NOT NULL DEFAULT true,
  debe_cambiar_password BOOLEAN NOT NULL DEFAULT true,
  ultimo_acceso   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_organization ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);


-- ===== Migration 018: payment_plans =====

CREATE TYPE payment_moneda AS ENUM ('USD', 'ARS');
CREATE TYPE payment_ajuste AS ENUM ('ninguno', 'CAC', 'UVA', 'porcentaje_fijo');
CREATE TYPE installment_concepto AS ENUM ('anticipo', 'cuota', 'saldo');
CREATE TYPE installment_estado AS ENUM ('pendiente', 'pagado', 'vencido', 'parcial');
CREATE TYPE payment_metodo AS ENUM ('transferencia', 'cheque', 'efectivo', 'crypto', 'otro');

CREATE TABLE IF NOT EXISTS payment_plans (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id   UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  descripcion      TEXT,
  moneda_base      payment_moneda NOT NULL DEFAULT 'USD',
  monto_total      NUMERIC(14,2) NOT NULL,
  tipo_ajuste      payment_ajuste NOT NULL DEFAULT 'ninguno',
  porcentaje_ajuste NUMERIC(5,2),   -- usado cuando tipo_ajuste = porcentaje_fijo
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_installments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id          UUID NOT NULL REFERENCES payment_plans(id) ON DELETE CASCADE,
  numero_cuota     INT NOT NULL,
  concepto         installment_concepto NOT NULL DEFAULT 'cuota',
  monto            NUMERIC(14,2) NOT NULL,
  moneda           payment_moneda NOT NULL DEFAULT 'USD',
  fecha_vencimiento DATE NOT NULL,
  estado           installment_estado NOT NULL DEFAULT 'pendiente',
  notas            TEXT
);

CREATE TABLE IF NOT EXISTS payment_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_id   UUID NOT NULL REFERENCES payment_installments(id) ON DELETE CASCADE,
  fecha_pago       DATE NOT NULL,
  monto_pagado     NUMERIC(14,2) NOT NULL,
  moneda           payment_moneda NOT NULL DEFAULT 'USD',
  metodo_pago      payment_metodo NOT NULL DEFAULT 'transferencia',
  referencia       TEXT,
  comprobante_url  TEXT,
  notas            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_plans_reservation ON payment_plans(reservation_id);
CREATE INDEX IF NOT EXISTS idx_payment_installments_plan ON payment_installments(plan_id);
CREATE INDEX IF NOT EXISTS idx_payment_installments_vencimiento ON payment_installments(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_payment_records_installment ON payment_records(installment_id);


-- ===== Migration 019: facturas =====

CREATE TYPE factura_tipo AS ENUM ('A', 'B', 'C', 'recibo', 'otro');
CREATE TYPE factura_categoria AS ENUM ('egreso', 'ingreso');
CREATE TYPE factura_estado AS ENUM ('cargada', 'vinculada', 'pagada');

CREATE TABLE IF NOT EXISTS facturas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id  UUID REFERENCES organizations(id),
  tipo             factura_tipo NOT NULL DEFAULT 'otro',
  numero_factura   TEXT,
  proveedor_id     UUID REFERENCES suppliers(id),
  proveedor_nombre TEXT,                -- fallback si no está en suppliers
  cuit_emisor      TEXT,
  fecha_emision    DATE NOT NULL,
  fecha_vencimiento DATE,
  monto_neto       NUMERIC(14,2),
  iva_pct          NUMERIC(5,2) DEFAULT 21,
  monto_total      NUMERIC(14,2) NOT NULL,
  moneda           payment_moneda NOT NULL DEFAULT 'ARS',
  categoria        factura_categoria NOT NULL DEFAULT 'egreso',
  file_url         TEXT,
  gasto_id         UUID REFERENCES project_expenses(id),
  estado           factura_estado NOT NULL DEFAULT 'cargada',
  notas            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facturas_project ON facturas(project_id);
CREATE INDEX IF NOT EXISTS idx_facturas_fecha ON facturas(fecha_emision);
CREATE INDEX IF NOT EXISTS idx_facturas_proveedor ON facturas(proveedor_id);


-- ===== Migration 020: migrate_factura_files.py (no .sql — S3 file migration only) =====
-- ===== Migration 021: migrate_all_files.py    (no .sql — S3 file migration only) =====


-- ===== Migration 022: factura_payment_record =====

ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS payment_record_id UUID REFERENCES payment_records(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_facturas_payment_record ON facturas(payment_record_id);


-- ===== Migration 023: obra_payment_budget =====

ALTER TABLE obra_payments
  ADD COLUMN IF NOT EXISTS budget_id UUID REFERENCES project_budget(id) ON DELETE SET NULL;


-- ===== Migration 024: budget_etapa_link =====

ALTER TABLE project_budget
  ADD COLUMN IF NOT EXISTS etapa_id UUID REFERENCES obra_etapas(id) ON DELETE SET NULL;


-- ===== Migration 025: soft_delete_financials =====

ALTER TABLE project_expenses  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
ALTER TABLE payment_records   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
ALTER TABLE facturas           ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
ALTER TABLE investors          ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;


-- ===== Migration 026: audit_log =====

CREATE TABLE IF NOT EXISTS audit_log (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID,                     -- NULL for legacy env-var sessions
    user_nombre  TEXT,                     -- denormalized for readability
    action       TEXT NOT NULL,            -- INSERT | UPDATE | DELETE
    table_name   TEXT NOT NULL,
    record_id    UUID,
    project_id   UUID,
    details      JSONB,                    -- optional context (e.g. names, amounts)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_table_record ON audit_log (table_name, record_id);
CREATE INDEX IF NOT EXISTS audit_log_user         ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS audit_log_project      ON audit_log (project_id);
CREATE INDEX IF NOT EXISTS audit_log_created_at   ON audit_log (created_at DESC);


-- ===== Migration 027: handoff_last_activity =====

ALTER TABLE handoffs ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

-- Backfill existing active handoffs with started_at as last activity
UPDATE handoffs SET last_activity_at = started_at WHERE last_activity_at IS NULL AND started_at IS NOT NULL;


-- ===== Migration 028: multi_tenant_messaging =====

CREATE TABLE tenant_channels (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider         TEXT        NOT NULL CHECK (provider IN ('twilio', 'meta')),
    phone_number     TEXT        NOT NULL,        -- E.164 number, e.g. +14155238886
    display_name     TEXT,                        -- optional human label
    -- Twilio credentials
    account_sid      TEXT,
    auth_token       TEXT,                        -- stored as plaintext
    -- Meta credentials
    access_token     TEXT,                        -- stored as plaintext
    phone_number_id  TEXT,                        -- Meta phone_number_id
    verify_token     TEXT,
    waba_id          TEXT,
    -- state
    activo           BOOLEAN     NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, phone_number, provider)
);

CREATE INDEX idx_tenant_channels_phone    ON tenant_channels (phone_number, provider) WHERE activo = true;
CREATE INDEX idx_tenant_channels_phone_id ON tenant_channels (phone_number_id, provider) WHERE activo = true AND phone_number_id IS NOT NULL;
CREATE INDEX idx_tenant_channels_org      ON tenant_channels (organization_id) WHERE activo = true;

CREATE TABLE agent_configs (
    id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        UUID        NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    agent_name             TEXT        NOT NULL DEFAULT 'Asistente',
    system_prompt_override TEXT,       -- if set, replaces the base template entirely
    system_prompt_append   TEXT,       -- appended to base template (more common)
    model                  TEXT        NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
    max_tokens             INT         NOT NULL DEFAULT 800,
    temperature            FLOAT       NOT NULL DEFAULT 0.7 CHECK (temperature >= 0.0 AND temperature <= 2.0),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE processed_messages (
    message_id      TEXT        NOT NULL,
    provider        TEXT        NOT NULL CHECK (provider IN ('twilio', 'meta')),
    organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, provider)
);

CREATE INDEX idx_processed_messages_cleanup ON processed_messages (processed_at);
-- Row cleanup: DELETE WHERE processed_at < NOW() - INTERVAL '48 hours'

-- =============================================================================
-- Post-migration seed: insert default agent_config for all existing orgs
-- Uncomment when running against a DB that already has org data:
-- INSERT INTO agent_configs (organization_id) SELECT id FROM organizations ON CONFLICT DO NOTHING;
-- =============================================================================

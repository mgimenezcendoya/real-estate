-- Migration 017: Users table with granular roles

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

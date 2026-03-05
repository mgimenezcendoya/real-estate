-- Migration 016: Rename developers → organizations + add tipo field
-- Also renames developer_id → organization_id in projects

-- 1. Rename table
ALTER TABLE developers RENAME TO organizations;

-- 2. Add tipo column
CREATE TYPE organization_tipo AS ENUM ('desarrolladora', 'inmobiliaria', 'ambas');
ALTER TABLE organizations ADD COLUMN tipo organization_tipo NOT NULL DEFAULT 'ambas';

-- 3. Add extra contact fields (optional but useful)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cuit TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS telefono TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS activa BOOLEAN NOT NULL DEFAULT true;

-- Migrate existing contact_phone → telefono if telefono is new
-- (contact_phone already exists on developers, telefono is new — skip if duplicate)

-- 4. Rename FK column in projects
ALTER TABLE projects RENAME COLUMN developer_id TO organization_id;

-- 5. Update FK constraint name (drop old, add new)
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_developer_id_fkey;
ALTER TABLE projects ADD CONSTRAINT projects_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id);

-- 6. Update index
DROP INDEX IF EXISTS idx_projects_developer;
CREATE INDEX IF NOT EXISTS idx_projects_organization ON projects(organization_id);

-- Migration 024: Link project_budget categories to obra_etapas
ALTER TABLE project_budget
  ADD COLUMN IF NOT EXISTS etapa_id UUID REFERENCES obra_etapas(id) ON DELETE SET NULL;

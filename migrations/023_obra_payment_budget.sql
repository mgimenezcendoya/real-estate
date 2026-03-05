-- Migration 023: Link obra_payments to project_budget categories
ALTER TABLE obra_payments
  ADD COLUMN IF NOT EXISTS budget_id UUID REFERENCES project_budget(id) ON DELETE SET NULL;

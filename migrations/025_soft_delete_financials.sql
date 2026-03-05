-- Soft delete support for financial records
ALTER TABLE project_expenses  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
ALTER TABLE payment_records   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
ALTER TABLE facturas           ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
ALTER TABLE investors          ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

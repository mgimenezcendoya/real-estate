-- Migration 022: Add payment_record_id FK to facturas for income linkage

ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS payment_record_id UUID REFERENCES payment_records(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_facturas_payment_record ON facturas(payment_record_id);

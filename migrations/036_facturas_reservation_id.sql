-- migrations/036_facturas_reservation_id.sql
-- Adds reservation_id to facturas to support linking to direct-sale reservations

ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_facturas_reservation_id ON facturas(reservation_id);

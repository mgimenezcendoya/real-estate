-- Migration 037: Add comprador role and reservation_id to users

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'comprador';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_reservation_id ON users(reservation_id);

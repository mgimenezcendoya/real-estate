-- Migracion incremental: agregar campos de detalle a projects
-- Solo necesaria si la DB fue creada con 001 antes de este cambio.

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

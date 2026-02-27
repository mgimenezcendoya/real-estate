-- Migracion incremental: agregar campos de calificacion a leads
-- Solo necesaria si la DB fue creada con 001 antes de este cambio.
-- Si se creo la DB con la version actual de 001, estos campos ya existen.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget_usd INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS bedrooms SMALLINT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS location_pref TEXT;

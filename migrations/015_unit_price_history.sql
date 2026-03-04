-- Migration 015: Unit field change history (price, area, bedrooms, floor)
CREATE TABLE IF NOT EXISTS unit_field_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id     UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  field       VARCHAR(50) NOT NULL,
  old_value   NUMERIC,
  new_value   NUMERIC NOT NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unit_field_history_unit_id ON unit_field_history(unit_id);

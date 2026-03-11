-- 034: Add tags and internal_notes to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS internal_notes TEXT;

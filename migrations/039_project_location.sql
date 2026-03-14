-- migrations/039_project_location.sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS lat FLOAT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS lng FLOAT;

-- Migration 029: Add slug column to organizations for readable S3 paths
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Populate existing orgs (add entries for new orgs manually or via app logic)
-- UPDATE organizations SET slug = 'my-org-name' WHERE name = 'My Org Name';

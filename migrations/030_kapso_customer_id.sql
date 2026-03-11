-- migrations/030_kapso_customer_id.sql
-- Add kapso_customer_id to organizations so we can map orgs to Kapso customers.

ALTER TABLE organizations ADD COLUMN kapso_customer_id TEXT;

CREATE INDEX idx_organizations_kapso_customer
    ON organizations (kapso_customer_id)
    WHERE kapso_customer_id IS NOT NULL;

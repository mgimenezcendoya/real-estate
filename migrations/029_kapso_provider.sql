-- migrations/029_kapso_provider.sql
-- Add 'kapso' and 'ycloud' to provider constraints in tenant_channels and processed_messages.
-- Note: 'ycloud' was already implemented in code but missing from the DB constraint.

ALTER TABLE tenant_channels
  DROP CONSTRAINT tenant_channels_provider_check,
  ADD CONSTRAINT tenant_channels_provider_check
    CHECK (provider IN ('twilio', 'meta', 'ycloud', 'kapso'));

ALTER TABLE processed_messages
  DROP CONSTRAINT processed_messages_provider_check,
  ADD CONSTRAINT processed_messages_provider_check
    CHECK (provider IN ('twilio', 'meta', 'ycloud', 'kapso'));

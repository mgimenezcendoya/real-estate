-- =============================================================================
-- Migration 030: Add YCloud as a WhatsApp provider
-- =============================================================================
-- Extends tenant_channels and processed_messages to support provider='ycloud'.
-- Inserts the Realia WABA channel for YCloud.
-- =============================================================================

-- 1. Update CHECK constraint on tenant_channels.provider
ALTER TABLE tenant_channels
    DROP CONSTRAINT IF EXISTS tenant_channels_provider_check;
ALTER TABLE tenant_channels
    ADD CONSTRAINT tenant_channels_provider_check
    CHECK (provider IN ('twilio', 'meta', 'ycloud'));

-- 2. Update CHECK constraint on processed_messages.provider
ALTER TABLE processed_messages
    DROP CONSTRAINT IF EXISTS processed_messages_provider_check;
ALTER TABLE processed_messages
    ADD CONSTRAINT processed_messages_provider_check
    CHECK (provider IN ('twilio', 'meta', 'ycloud'));

-- 3. Insert Realia's YCloud channel
-- Replace <ORG_ID> with the actual organization UUID before running.
-- INSERT INTO tenant_channels (
--     organization_id, provider, phone_number, phone_number_id, waba_id, display_name, activo
-- )
-- VALUES (
--     '<ORG_ID>',
--     'ycloud',
--     '+5491150407423',
--     '1044304662093453',
--     '1210493091068332',
--     'Realia',
--     true
-- );

-- To find your org ID:
-- SELECT id, name FROM organizations;

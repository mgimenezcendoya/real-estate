-- Migration 038: add notify_phone to tenant_channels
-- This field stores the advisor's WhatsApp number to notify on HITL activation.

ALTER TABLE tenant_channels
  ADD COLUMN IF NOT EXISTS notify_phone TEXT;

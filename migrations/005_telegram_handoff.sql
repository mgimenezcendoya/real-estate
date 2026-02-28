-- Add Telegram thread ID to handoffs for mapping replies to active handoffs
ALTER TABLE handoffs ADD COLUMN IF NOT EXISTS telegram_thread_id BIGINT;

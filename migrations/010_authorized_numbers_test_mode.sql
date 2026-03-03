-- Migration 010: Add test_mode column to authorized_numbers
-- Replaces in-memory _test_mode dict in router.py with DB-persisted state

ALTER TABLE authorized_numbers
    ADD COLUMN IF NOT EXISTS test_mode BOOLEAN NOT NULL DEFAULT FALSE;

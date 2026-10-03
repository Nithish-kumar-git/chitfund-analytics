-- =============================================================================
-- Chit Fund Analytics — Idempotency Key for Ledger Entries
-- Migration: 20261003000003_add_idempotency_key.sql
-- Phase: 8A.1 (double-submit protection)
-- =============================================================================
-- PURPOSE:
--   Prevent accidental duplicate financial entries from double-click/double-submit
--   while still allowing legitimate multiple transactions for the same auction event
--   (e.g., split payments, multiple tranches).
--
-- APPROACH:
--   Add optional idempotency_key column to ledger_entries.
--   Client generates UUID on form open, passes same key on retry/resubmit.
--   Unique constraint on (profile_id, idempotency_key) prevents duplicates.
--   Legitimate second transaction uses different form instance = different key.
--
-- DOMAIN BEHAVIOR PRESERVED:
--   - Multiple transactions per auction_event still allowed (different keys)
--   - Accidental resubmit with same key is rejected
--   - NULL idempotency_key allowed for backward compatibility / direct SQL
-- =============================================================================

-- Add idempotency_key column (nullable for backward compatibility)
ALTER TABLE public.ledger_entries
  ADD COLUMN idempotency_key UUID;

COMMENT ON COLUMN public.ledger_entries.idempotency_key IS
  'Phase 8A.1: Optional client-generated UUID to prevent double-submit. '
  'Same form submission must use same key. '
  'Legitimate second transaction for same event uses different key. '
  'NULL allowed for backward compatibility and direct SQL inserts.';

-- Unique constraint: same user cannot use same idempotency key twice
CREATE UNIQUE INDEX ledger_entries_idempotency_key_unique
  ON public.ledger_entries(profile_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON INDEX ledger_entries_idempotency_key_unique IS
  'Phase 8A.1: Prevents same idempotency_key being used twice by same user. '
  'Partial index excludes NULL keys (backward compatibility, direct SQL).';

-- =============================================================================
-- Chit Fund Analytics — Cash-Flow Verification Invalidation Triggers
-- Migration: 20261003000002_verification_invalidation_triggers.sql
-- Phase: 7F (atomicity fix)
-- =============================================================================
-- PURPOSE:
--   Automatically clear verified_at / verified_by on the parent chit whenever
--   a new ledger_entry or auction_event is inserted. This makes invalidation
--   atomic: the INSERT and the chit UPDATE share the same Postgres transaction.
--   If the INSERT rolls back, the chit UPDATE also rolls back.
--   If the INSERT commits, verified_at is guaranteed to be null.
--
-- WHY TRIGGERS INSTEAD OF APPLICATION-LAYER CALLS:
--   Application-layer calls (even in the same server request) issue two
--   separate HTTP round-trips to Postgres. If the second call fails, the
--   primary INSERT is already committed and the verification state becomes
--   stale. Triggers eliminate this race entirely.
--
-- STYLE:
--   Follows the existing handle_updated_at() pattern in the initial schema.
--   Two separate trigger functions are used (one per table) for clarity.
--
-- IMPORTANT:
--   - These triggers clear verification on INSERT only.
--   - They do NOT fire on UPDATE or DELETE (ledger_entries is append-only).
--   - They do NOT modify any financial values.
--   - The WHERE verified_at IS NOT NULL guard avoids unnecessary writes when
--     the chit is already unverified.
--   - Ownership is implicit: chit_id FK references the chit owned by profile_id.
--     No cross-user verification is possible because RLS restricts all queries
--     to the authenticated user's profile_id, and INSERT also requires a
--     matching profile_id.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Trigger function 1: ledger_entry inserted → clear parent chit verification
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invalidate_verification_on_ledger_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only issue the UPDATE when the chit is currently verified.
  -- This avoids a write amplification on every insert for unverified chits.
  UPDATE public.chits
    SET verified_at = NULL,
        verified_by = NULL
    WHERE id = NEW.chit_id
      AND verified_at IS NOT NULL;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.invalidate_verification_on_ledger_insert() IS
  'Phase 7F atomicity: clears verified_at/verified_by on the parent chit '
  'whenever a new ledger_entry is inserted. Runs in the same transaction as '
  'the INSERT so invalidation is guaranteed to be atomic.';


-- ---------------------------------------------------------------------------
-- Trigger function 2: auction_event inserted → clear parent chit verification
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invalidate_verification_on_auction_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.chits
    SET verified_at = NULL,
        verified_by = NULL
    WHERE id = NEW.chit_id
      AND verified_at IS NOT NULL;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.invalidate_verification_on_auction_insert() IS
  'Phase 7F atomicity: clears verified_at/verified_by on the parent chit '
  'whenever a new auction_event is inserted. Runs in the same transaction as '
  'the INSERT so invalidation is guaranteed to be atomic.';


-- ---------------------------------------------------------------------------
-- Attach triggers
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_ledger_entries_invalidate_verification
  BEFORE INSERT ON public.ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.invalidate_verification_on_ledger_insert();

COMMENT ON TRIGGER trg_ledger_entries_invalidate_verification ON public.ledger_entries IS
  'Phase 7F: Atomically invalidates parent chit cash-flow verification on '
  'every ledger_entry INSERT. BEFORE trigger so the UPDATE happens in the '
  'same implicit transaction.';


CREATE TRIGGER trg_auction_events_invalidate_verification
  BEFORE INSERT ON public.auction_events
  FOR EACH ROW
  EXECUTE FUNCTION public.invalidate_verification_on_auction_insert();

COMMENT ON TRIGGER trg_auction_events_invalidate_verification ON public.auction_events IS
  'Phase 7F: Atomically invalidates parent chit cash-flow verification on '
  'every auction_event INSERT. BEFORE trigger so the UPDATE happens in the '
  'same implicit transaction.';

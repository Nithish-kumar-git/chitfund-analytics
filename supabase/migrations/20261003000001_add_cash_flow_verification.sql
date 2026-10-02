-- =============================================================================
-- Chit Fund Analytics — Cash-Flow Verification Fields
-- Migration: 20261003000001_add_cash_flow_verification.sql
-- Phase: 7F
-- =============================================================================
-- PURPOSE:
--   Allow the user to explicitly confirm that all actual cash flows for a
--   COMPLETED chit have been recorded. Until this confirmation is stored,
--   the ROI engine refuses to display a calculated result.
--
-- DESIGN DECISIONS:
--   1. Two nullable columns on chits (not a separate table) to keep V1 simple.
--   2. verified_at = NULL AND verified_by = NULL → unverified (or invalidated).
--   3. Both populated → verified. Both cleared together atomically.
--   4. verified_by references auth.users(id) directly — matches the existing
--      pattern used by profile_id throughout this schema.
--   5. No boolean column: the timestamp is the audit record ("when verified").
--   6. Invalidation is performed by application-level mutation paths, not by DB
--      triggers, to remain consistent with the existing architecture.
-- =============================================================================

ALTER TABLE public.chits
  ADD COLUMN verified_at   TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN verified_by   UUID        DEFAULT NULL REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.chits.verified_at IS
  'Timestamp when the user explicitly confirmed that all actual cash flows for '
  'this chit are complete and accurately recorded. NULL means unverified or '
  'invalidated. Must ONLY be set by the verifyChitCashFlows server action. '
  'Must be cleared (set back to NULL) by any financial mutation path.';

COMMENT ON COLUMN public.chits.verified_by IS
  'UUID of the authenticated user who performed the cash-flow verification. '
  'Mirrors auth.users(id). Cleared together with verified_at on invalidation. '
  'Do NOT accept this value from the client — derive from the auth session.';

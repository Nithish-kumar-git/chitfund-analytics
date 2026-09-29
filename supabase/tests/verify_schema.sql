-- =============================================================================
-- Chit Fund Analytics — Schema Verification Tests
-- File: supabase/tests/verify_schema.sql
-- =============================================================================
-- Run these queries against your Supabase project to verify Phase 1 is complete.
-- Expected result for each check: returns 1 row with the expected value.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Verify all 8 tables exist
-- ---------------------------------------------------------------------------
SELECT
  table_name,
  CASE WHEN table_name IS NOT NULL THEN 'EXISTS ✓' ELSE 'MISSING ✗' END AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'profiles', 'chit_companies', 'chits', 'source_messages',
    'auction_events', 'ledger_entries', 'context_events', 'user_rules'
  )
ORDER BY table_name;
-- Expected: 8 rows, all 8 table names

-- ---------------------------------------------------------------------------
-- 2. Verify all money columns use NUMERIC (not FLOAT / REAL)
-- ---------------------------------------------------------------------------
SELECT
  table_name,
  column_name,
  data_type,
  numeric_precision,
  numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'chits', 'auction_events', 'ledger_entries'
  )
  AND column_name IN (
    'face_value', 'base_installment', 'commission_value',
    'thallu', 'commission', 'net_thallu', 'member_thallu',
    'non_winner_payment', 'our_payout_amount',
    'amount', 'rule_value'
  )
ORDER BY table_name, column_name;
-- Expected: ALL rows have data_type = 'numeric'

-- ---------------------------------------------------------------------------
-- 3. Verify RLS is enabled on all 8 tables
-- ---------------------------------------------------------------------------
SELECT
  relname AS table_name,
  relrowsecurity AS rls_enabled
FROM pg_class
WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND relname IN (
    'profiles', 'chit_companies', 'chits', 'source_messages',
    'auction_events', 'ledger_entries', 'context_events', 'user_rules'
  )
ORDER BY relname;
-- Expected: 8 rows with rls_enabled = true

-- ---------------------------------------------------------------------------
-- 4. Verify all foreign keys exist
-- ---------------------------------------------------------------------------
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name  AS referenced_table,
  ccu.column_name AS referenced_column
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;
-- Expected FKs:
--   chit_companies.profile_id → profiles.id
--   chits.profile_id          → profiles.id
--   chits.company_id          → chit_companies.id
--   source_messages.profile_id → profiles.id
--   source_messages.chit_id    → chits.id
--   source_messages.matched_auction_event_id → auction_events.id
--   auction_events.profile_id  → profiles.id
--   auction_events.chit_id     → chits.id
--   auction_events.source_message_id → source_messages.id
--   ledger_entries.profile_id  → profiles.id
--   ledger_entries.chit_id     → chits.id
--   ledger_entries.auction_event_id → auction_events.id
--   ledger_entries.corrects_entry_id → ledger_entries.id
--   context_events.profile_id  → profiles.id
--   user_rules.profile_id      → profiles.id
--   user_rules.chit_id         → chits.id

-- ---------------------------------------------------------------------------
-- 5. Verify our_payout_amount is nullable (winner settlement unverified)
-- ---------------------------------------------------------------------------
SELECT
  column_name,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'auction_events'
  AND column_name = 'our_payout_amount';
-- Expected: is_nullable = 'YES'

-- ---------------------------------------------------------------------------
-- 6. Verify event_type CHECK constraint includes FINAL and SPECIAL_NO_AUCTION
-- ---------------------------------------------------------------------------
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.auction_events'::regclass
  AND contype = 'c'
  AND conname LIKE '%event_type%';
-- Expected: definition contains FINAL and SPECIAL_NO_AUCTION

-- ---------------------------------------------------------------------------
-- 7. Verify ledger_entries has corrects_entry_id (correction relationship)
-- ---------------------------------------------------------------------------
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ledger_entries'
  AND column_name = 'corrects_entry_id';
-- Expected: data_type = 'uuid', is_nullable = 'YES'

-- ---------------------------------------------------------------------------
-- 8. Verify source_messages has raw_text as NOT NULL
-- ---------------------------------------------------------------------------
SELECT
  column_name,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'source_messages'
  AND column_name = 'raw_text';
-- Expected: is_nullable = 'NO'

-- ---------------------------------------------------------------------------
-- 9. Verify (chit_id, round_number) unique constraint on auction_events
-- ---------------------------------------------------------------------------
SELECT
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'auction_events'
  AND tc.constraint_type = 'UNIQUE'
ORDER BY kcu.ordinal_position;
-- Expected: 2 rows — chit_id and round_number in a UNIQUE constraint

-- ---------------------------------------------------------------------------
-- 10. Verify RLS policies exist for each table (sample check)
-- ---------------------------------------------------------------------------
SELECT
  schemaname,
  tablename,
  policyname,
  cmd AS operation
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
-- Expected: see migration 20260928000002_rls_policies.sql for full list
-- Key checks:
--   ledger_entries: only SELECT and INSERT policies exist (no UPDATE, no DELETE)
--   source_messages: only SELECT, INSERT, UPDATE policies exist (no DELETE)
--   profiles: only SELECT, INSERT, UPDATE policies exist (no DELETE)

-- ---------------------------------------------------------------------------
-- 11. Security: unauthenticated user cannot access records
--     (Run this as an unauthenticated request — expect 0 rows or auth error)
-- ---------------------------------------------------------------------------
-- SELECT * FROM public.chits;   -- Should return 0 rows when not authenticated
-- SELECT * FROM public.ledger_entries;  -- Same

-- ---------------------------------------------------------------------------
-- 12. Verify auto-profile trigger exists
-- ---------------------------------------------------------------------------
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';
-- Expected: 1 row pointing to handle_new_user() function on auth.users

-- ---------------------------------------------------------------------------
-- 13. Verify handle_updated_at trigger exists on tables with updated_at
-- ---------------------------------------------------------------------------
SELECT
  trigger_name,
  event_object_table
FROM information_schema.triggers
WHERE trigger_name LIKE '%_updated_at'
  AND trigger_schema = 'public'
ORDER BY event_object_table;
-- Expected: triggers on profiles, chit_companies, chits, source_messages,
--           auction_events, context_events, user_rules (NOT ledger_entries)

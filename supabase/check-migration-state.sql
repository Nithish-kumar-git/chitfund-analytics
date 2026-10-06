-- =============================================================================
-- READ-ONLY Production Migration State Check
-- Purpose: Determine if migration 20261003000003 has been applied
-- =============================================================================

-- Check 1: Does the idempotency_key column exist?
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ledger_entries'
  AND column_name = 'idempotency_key';

-- Check 2: Does the unique index exist?
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'ledger_entries'
  AND indexname = 'ledger_entries_idempotency_key_unique';

-- Check 3: Current ledger_entries schema (all columns)
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ledger_entries'
ORDER BY ordinal_position;

-- Check 4: All indexes on ledger_entries
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'ledger_entries'
ORDER BY indexname;

-- Check 5: Row count (verify no data loss during inspection)
SELECT 
  'ledger_entries' as table_name,
  COUNT(*) as row_count
FROM public.ledger_entries;

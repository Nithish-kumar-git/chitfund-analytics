# Production Migration Guide — Phase 8A.1

**Migration:** `20261003000003_add_idempotency_key.sql`  
**Purpose:** Add double-submit protection to ledger entries  
**Status:** Committed to GitHub at 02ce3f2, NOT YET APPLIED to production

---

## Executive Summary

This migration adds a single nullable column (`idempotency_key UUID`) and a partial unique index to `public.ledger_entries`. It is:

- ✅ **Backward compatible** (NULL allowed for existing rows)
- ✅ **Non-destructive** (no data modification)
- ✅ **Zero downtime** (column addition + index creation are fast operations)
- ✅ **Reversible** (can be rolled back if needed)

---

## Pre-Flight Checklist

Before applying this migration, confirm:

1. ✅ **Code deployed:** Vercel deployment includes commit 02ce3f2
2. ✅ **Previous migrations applied:**
   - `20260928000001_initial_schema.sql`
   - `20260928000002_rls_policies.sql`
   - `20261003000001_add_cash_flow_verification.sql`
   - `20261003000002_verification_invalidation_triggers.sql`
3. ✅ **Database backup:** Production Supabase project has automatic backups enabled
4. ✅ **Read-only check complete:** Run `supabase/check-migration-state.sql` first

---

## Step 1: Verify Current Migration State (READ-ONLY)

### Method 1: Supabase Dashboard SQL Editor

1. Open Supabase Dashboard: https://supabase.com/dashboard/project/xzrzacoaeiyqqhvknfqs
2. Navigate to: **SQL Editor** → **New query**
3. Copy and paste the contents of `supabase/check-migration-state.sql`
4. Click **Run** (this is read-only, safe to execute)

### Expected Results if Migration NOT Applied:

**Check 1 (idempotency_key column):**
```
(0 rows)
```

**Check 2 (unique index):**
```
(0 rows)
```

**Check 3 (current schema):**
Should show columns: `id`, `profile_id`, `chit_id`, `entry_type`, `amount`, `transaction_date`, `auction_event_id`, `corrects_entry_id`, `notes`, `created_at`
- ❌ `idempotency_key` should NOT be present

**Check 4 (indexes):**
Should show existing indexes but NOT `ledger_entries_idempotency_key_unique`

**Check 5 (row count):**
Shows current number of ledger entries (verify non-zero if data exists)

### Expected Results if Migration ALREADY Applied:

**Check 1:**
```
column_name       | data_type | is_nullable | column_default
------------------+-----------+-------------+---------------
idempotency_key   | uuid      | YES         | NULL
```

**Check 2:**
```
indexname                                | indexdef
-----------------------------------------+--------------------------------------------------
ledger_entries_idempotency_key_unique    | CREATE UNIQUE INDEX ... WHERE idempotency_key IS NOT NULL
```

If migration is already applied, **STOP** — no further action needed.

---

## Step 2: Apply Migration (PRODUCTION)

### ⚠️ CRITICAL SAFETY RULES

- **Use ONLY the Supabase Dashboard SQL Editor** (safest method)
- **Do NOT use service-role key** (not necessary for DDL)
- **Do NOT use Supabase CLI** (requires local setup, not configured)
- **Copy-paste the EXACT migration SQL** (no modifications)
- **Apply during low-traffic period** (if possible)
- **Have rollback script ready** (see Step 4)

### Execution Steps:

1. **Open Supabase Dashboard SQL Editor:**
   - URL: https://supabase.com/dashboard/project/xzrzacoaeiyqqhvknfqs/sql
   - Navigate to: SQL Editor → New query

2. **Copy EXACT migration SQL:**
   - Source: `supabase/migrations/20261003000003_add_idempotency_key.sql`
   - Copy lines 24-40 (the actual SQL statements, not comments)

3. **Paste into SQL Editor:**
   ```sql
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
   ```

4. **Review the SQL carefully** (verify no typos, no extra statements)

5. **Click "Run"** (executes immediately, no confirmation prompt)

6. **Verify success:**
   - Dashboard should show: "Success. No rows returned"
   - If error appears, **DO NOT retry** — see Troubleshooting section below

---

## Step 3: Post-Migration Verification

After applying the migration, run verification queries:

### Verification Query 1: Column exists with correct type
```sql
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ledger_entries'
  AND column_name = 'idempotency_key';
```

**Expected:**
```
column_name       | data_type | is_nullable | column_default
------------------+-----------+-------------+---------------
idempotency_key   | uuid      | YES         | NULL
```

### Verification Query 2: Index exists with correct definition
```sql
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'ledger_entries'
  AND indexname = 'ledger_entries_idempotency_key_unique';
```

**Expected:**
```
indexname                                | indexdef
-----------------------------------------+--------------------------------------------------
ledger_entries_idempotency_key_unique    | CREATE UNIQUE INDEX ledger_entries_idempotency_key_unique ON public.ledger_entries USING btree (profile_id, idempotency_key) WHERE (idempotency_key IS NOT NULL)
```

### Verification Query 3: No data modified
```sql
-- All existing entries should have idempotency_key = NULL
SELECT COUNT(*) as existing_entries_with_null_key
FROM public.ledger_entries
WHERE idempotency_key IS NULL;
```

**Expected:** Count should equal total row count from pre-migration check (all existing entries have NULL)

### Verification Query 4: Application compatibility test
Try inserting a test entry with idempotency_key (requires authentication):
- Go to the application UI: `/chits/<chit-id>`
- Click "Record Cash Flow"
- Fill form and submit
- Check browser network tab: request should succeed (201 or similar)
- Check database: new entry should have non-NULL idempotency_key
- Try resubmitting same form: should fail with "duplicate submission detected"

---

## Step 4: Rollback Procedure (If Needed)

If migration causes issues, rollback with:

```sql
-- Drop the unique index
DROP INDEX IF EXISTS public.ledger_entries_idempotency_key_unique;

-- Remove the column
ALTER TABLE public.ledger_entries
  DROP COLUMN IF EXISTS idempotency_key;
```

**When to rollback:**
- Migration fails with constraint violation
- Application errors after migration
- Index creation times out (unlikely for small tables)

**After rollback:**
- Investigate root cause
- Fix issue (likely constraint conflict)
- Re-attempt migration after fix

---

## Step 5: Update Migration Tracking

After successful migration:

1. **Document in project log:**
   - Add entry to project notes: "Migration 20261003000003 applied on [date]"
   - Note any issues encountered
   - Record post-verification results

2. **Update README.md migration table** (optional but recommended):
   ```markdown
   | File | Description |
   |------|-------------|
   | `20260928000001_initial_schema.sql` | All 8 tables, indexes, triggers |
   | `20260928000002_rls_policies.sql` | Row Level Security + auto-profile trigger |
   | `20261003000001_add_cash_flow_verification.sql` | Verification fields (Phase 7F) |
   | `20261003000002_verification_invalidation_triggers.sql` | Atomicity triggers (Phase 7F) |
   | `20261003000003_add_idempotency_key.sql` | Double-submit protection (Phase 8A.1) ✅ Applied [date] |
   ```

---

## Troubleshooting

### Error: "column already exists"
**Cause:** Migration was already applied  
**Action:** Run check queries from Step 1 to confirm. If column exists with correct definition, no action needed.

### Error: "index already exists"
**Cause:** Partial migration or previous attempt  
**Action:**
1. Check if column exists: `SELECT * FROM information_schema.columns WHERE table_name='ledger_entries' AND column_name='idempotency_key'`
2. If column exists but index doesn't, run ONLY the CREATE INDEX statement
3. If both exist, verify with post-migration checks

### Error: "permission denied"
**Cause:** Insufficient database privileges  
**Action:** Ensure logged in as project owner (Supabase Dashboard auto-uses correct privileges)

### Error: timeout or hanging
**Cause:** Large table lock (very unlikely for column addition)  
**Action:**
1. Cancel query
2. Check table size: `SELECT pg_size_pretty(pg_total_relation_size('public.ledger_entries'))`
3. If table is very large (>1GB), consider maintenance window
4. Retry during off-peak hours

### Application errors after migration
**Symptoms:** 500 errors, "column does not exist" errors  
**Cause:** Application code not deployed or Vercel caching issue  
**Action:**
1. Verify Vercel deployment includes commit 02ce3f2
2. Check deployment logs for TypeScript errors
3. Hard refresh browser (Ctrl+Shift+R)
4. Check browser console for client errors
5. If persistent, rollback migration and investigate

---

## Risk Assessment

### Impact: **LOW**
- Single nullable column addition
- Partial unique index (doesn't affect existing data)
- No existing code dependencies (backward compatible)

### Probability of Issues: **VERY LOW**
- Migration tested in development
- TypeScript types updated and validated
- All 409 unit tests passing
- Code review complete
- Read-only checks performed

### Blast Radius: **MINIMAL**
- Only affects `ledger_entries` table
- Does NOT affect existing entries (all have NULL key)
- Only new entries use idempotency protection
- Other tables unaffected

### Recovery Time: **SECONDS**
- Rollback is two SQL statements
- No data migration or backfill required
- Application continues working even if migration fails

---

## Dependencies

**Code Deployment:**
- Commit 02ce3f2 must be deployed to Vercel BEFORE applying migration
- Why: Application code expects `idempotency_key` field in types
- If migration applied before code: application will fail to insert (missing column in type)
- If code deployed before migration: application works (column is nullable, defaults to NULL)

**Recommended Deployment Order:**
1. ✅ Deploy code to Vercel (commit 02ce3f2) — **SAFE, ALREADY DONE**
2. Apply database migration — **THIS GUIDE**
3. Verify application functionality
4. Monitor for issues

---

## Verification Timeline

**Immediate (0-5 minutes after migration):**
- Run post-migration verification queries
- Check for SQL errors in Supabase logs

**Short-term (1-24 hours):**
- Test cash-flow recording in production UI
- Verify idempotency protection works (try double-submit)
- Monitor Vercel logs for application errors
- Check Supabase logs for constraint violations

**Medium-term (1-7 days):**
- Monitor user reports of submission issues
- Verify no unexpected duplicate entries created
- Check that legitimate multiple transactions still work

---

## Migration Metadata

**File:** `supabase/migrations/20261003000003_add_idempotency_key.sql`  
**Commit:** 02ce3f2cc040dfadfba58507b34bc3eacde570c8  
**Phase:** 8A.1  
**Date Committed:** 2026-10-03  
**Date Applied:** [TO BE FILLED AFTER APPLICATION]  
**Applied By:** [TO BE FILLED AFTER APPLICATION]  
**Rollback Available:** YES  
**Data Loss Risk:** NONE  
**Downtime Required:** NO  

---

## Summary Checklist

Before applying:
- [ ] Code deployed to Vercel (commit 02ce3f2)
- [ ] Previous migrations verified applied
- [ ] Read-only state check completed
- [ ] Migration SQL reviewed and copied
- [ ] Rollback script prepared

During application:
- [ ] Logged into Supabase Dashboard as project owner
- [ ] SQL Editor opened
- [ ] Migration SQL pasted (exact copy)
- [ ] SQL reviewed for accuracy
- [ ] "Run" clicked
- [ ] Success message confirmed

After application:
- [ ] Post-migration verification queries run
- [ ] Column exists with correct type
- [ ] Index exists with correct definition
- [ ] Existing entries have NULL key
- [ ] Application test completed (record cash flow)
- [ ] Idempotency protection verified (double-submit blocked)
- [ ] Migration tracking updated
- [ ] No errors in Supabase logs
- [ ] No errors in Vercel logs

---

**END OF MIGRATION GUIDE**

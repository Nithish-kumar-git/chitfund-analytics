# Chit Fund Analytics — financial-integrity repair handoff

Updated 22 October 2026 (Asia/Calcutta). This records the bounded repair and disposable PostgreSQL verification at application commit `77936ccd85f19e19193fbd06a43ec61b9f1f3a8b`. It is not a production-readiness certification.

## Repository state inspected before the repair

| Item | Verified value |
| --- | --- |
| Repository | <https://github.com/Nithish-kumar-git/chitfund-analytics> |
| Checkout | `C:\Users\itsni\Documents\Codex\2026-10-22\task-chit-fund-analytics-fix-confirmed\chitfund-analytics` |
| Branch / tracking | `main` tracking `origin/main` |
| Verified application commit | `77936ccd85f19e19193fbd06a43ec61b9f1f3a8b` |
| Branch / synchronization | `main` matched `origin/main`; zero ahead and zero behind |
| Working tree before closeout | Clean |
| Repair CI | Run 39692273666 completed successfully on the verified commit using Node 22 |

The earlier implementation reference `d65a9cd9f02005f66951f42a9f8437cd8ebb65ff` remains in history. The README and the prior closeout documentation were preserved; this handoff is the intentional update to the latter.

## Implemented repairs

1. Confirmed imports no longer create `INSTALLMENT_PAID` or payout ledger rows. Parsed amounts remain expected auction-event facts until a user explicitly records an actual cash movement.
2. Auction dates are taken only from explicit complete source dates. Incomplete or invalid source dates are retained in source metadata/notes while `auction_date` remains null; the current date is never substituted as history.
3. Confirmation now calls one `confirm_ingestion` PostgreSQL function, so source-message and auction-event changes commit or roll back together.
4. A partial unique index enforces one correction per original ledger entry. The correction trigger validates ownership and event consistency and applies `MANUAL_OVERRIDE` in the same transaction; the action safely maps a concurrent uniqueness conflict.
5. Parent `updated_at` values are strictly monotonic. Auction insert/update/delete and ledger insert triggers always invalidate and version the parent, even when it was already unverified. Whole-chit verification is a locked database function sharing the parent-row serialization point.
6. Auction rounds are constrained to `1..duration_months`, and verification checks the exact expected round set rather than a row count.
7. Composite foreign keys enforce profile/chit ownership across source messages, auction events, ledger entries and corrections. Existing RLS remains enabled and unchanged.
8. CI now uses Node 22, matching the installed Supabase packages' declared runtime requirement.

The migration preflights existing rows and aborts on inconsistent historical data instead of silently rewriting financial history.

## Changed areas

- Application actions: ingestion, queue confirmation, ledger correction and verification.
- Ingestion/date support: persistence payloads, source-date extraction and database function types.
- Database: `supabase/migrations/20261021225438_financial_integrity_repairs.sql`.
- Database regression specification: `supabase/tests/financial_integrity_regression.sql`.
- Focused Vitest coverage for dates, atomic RPC payloads, due-versus-paid semantics, bounds, correction conflicts and locked verification.
- CI runtime: `.github/workflows/ci.yml`.

## Verification evidence

- Focused regression run: 6 files, 67 tests passed.
- Full Vitest run: 26 files passed, 498 tests passed; 1 file / 17 placeholder integration tests remained intentionally skipped. They were not enabled by removing `describe.skip`.
- TypeScript: `npx tsc --noEmit` passed.
- Production build: `npm run build` passed on Node `v22.20.0`.
- Diff hygiene: `git diff --check` passed after final formatting.
- Lint is not green repository-wide: the existing configuration reports 163 errors and 48 warnings, dominated by existing `no-explicit-any` and React hook findings. This repair did not broaden into a lint cleanup.
- `npm ci` reported the repository's existing dependency audit findings (3 moderate, 9 high, 2 critical); no broad dependency upgrade was performed.

## Disposable PostgreSQL verification

The migration was verified with PostgreSQL 18.1 native Windows binaries in a fresh cluster listening only on `127.0.0.1:55432`, using a separate `chitfund_verify` database. A minimal synthetic Supabase prerequisite layer supplied `auth.users`, `auth.uid()`, and the `anon`/`authenticated` roles. No production or remote database was contacted.

- All seven tracked migrations applied successfully in filename order, including `20261021225438_financial_integrity_repairs.sql`.
- `supabase/tests/financial_integrity_regression.sql` passed and rolled back cleanly.
- A controlled `23514` ingestion failure left zero source-message, auction-event and ledger rows; subsequent transactions succeeded.
- Two correction sessions overlapped. Session A committed; session B received `23505` on `ledger_entries_one_correction_per_original_uk`; exactly one correction remained and the linked event was `MANUAL_OVERRIDE`.
- Mutation-first verification waited on the parent lock and then rejected the newly flagged round. In the reverse ordering, the ledger insert waited for verification, committed, and left the parent unverified.
- Nine inspected composite ownership constraints were validated. Valid rounds `1..duration_months` succeeded; missing and out-of-range rounds were rejected.
- The server, cluster, database, logs, scripts, outputs and synthetic fixtures were removed after results were collected.

This confirms the PostgreSQL behavior under test. It does not cover GoTrue, the Supabase Data API, or complete client-side RLS integration because the disposable test used a minimal authentication shim.

## Deployment and permission boundary

No deployment was performed. No production data, RLS policy, production permission, credential or hosted configuration was inspected or changed. The migration adds constraints, triggers and authenticated invoker functions but does not weaken existing RLS.

## Remaining blockers and freeze decision

The bounded financial-integrity repair can be frozen at `77936ccd85f19e19193fbd06a43ec61b9f1f3a8b`; its migration, committed SQL regression, concurrency interleavings and CI all passed. Do not describe that conclusion as comprehensive production readiness. A full Supabase Auth/Data API/RLS integration check and confirmation of which commit is deployed remain separate questions. Existing repository-wide lint findings and dependency-audit findings also remain outside this bounded repair.

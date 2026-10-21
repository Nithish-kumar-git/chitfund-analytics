# Chit Fund Analytics — financial-integrity repair handoff

Updated 22 October 2026 (Asia/Calcutta). This records the bounded repair based on `a62c4b895f18f36e44dfa3ebba8b0ec1edf7f371`. It is not a production-readiness certification.

## Repository state inspected before the repair

| Item | Verified value |
| --- | --- |
| Repository | <https://github.com/Nithish-kumar-git/chitfund-analytics> |
| Checkout | `C:\Users\itsni\Documents\Codex\2026-10-22\task-chit-fund-analytics-fix-confirmed\chitfund-analytics` |
| Branch / tracking | `main` tracking `origin/main` |
| Starting HEAD | `a62c4b895f18f36e44dfa3ebba8b0ec1edf7f371` |
| Starting synchronization | Zero commits ahead and zero behind |
| Starting working tree | Clean |
| Latest pre-repair CI | Run 39619933315, successful on the starting HEAD; the workflow still used Node 20 |

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

## PostgreSQL verification limitation

The SQL regression file covers atomic rollback, round bounds and exact completeness, monotonic invalidation, correction uniqueness/side effects, and cross-owner links. It was not executed: `psql` is unavailable, the installed Docker client has no running engine, and this checkout has no local Supabase configuration. No production or remote database was contacted. Therefore migration execution and real PostgreSQL concurrency behavior remain unverified.

## Deployment and permission boundary

No deployment was performed. No production data, RLS policy, production permission, credential or hosted configuration was inspected or changed. The migration adds constraints, triggers and authenticated invoker functions but does not weaken existing RLS.

## Remaining blockers and freeze decision

Before release or freeze, apply the migration to a disposable PostgreSQL/Supabase instance, run `supabase/tests/financial_integrity_regression.sql`, add a two-session correction/verification race exercise, and confirm the post-push GitHub Actions run. Any preflight failure must be reviewed and repaired through an audited data process; do not edit history automatically.

The bounded code repair is complete, but the project should **not be frozen or called production-ready** until those database and CI checks pass. Identify the repair commit with `git log -1 --format=%H` and verify the remote tip with `git ls-remote origin refs/heads/main`.

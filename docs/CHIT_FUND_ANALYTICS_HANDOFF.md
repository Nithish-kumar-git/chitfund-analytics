# Chit Fund Analytics — maintenance handoff

Updated 21 October 2026 (Asia/Calcutta). This is the authoritative resumption record for the current repository state. It does not certify the application for production financial use.

## Repository and Git state

| Item | Verified value |
| --- | --- |
| Repository | <https://github.com/Nithish-kumar-git/chitfund-analytics> |
| Authoritative checkout for this closeout | `C:\Users\itsni\OneDrive\Documents\ChatGPT\project collections\chitfund-analytics` |
| Default / active branch | `main` / `main` |
| Documentation base commit | `d65a9cd9f02005f66951f42a9f8437cd8ebb65ff` |
| Base synchronization | Local `main` matched `origin/main`; zero ahead and zero behind |
| Base working tree | Clean; no modified or untracked user work |

The documentation commit containing this file cannot embed its own hash. After committing, identify it with `git log -1 --format=%H -- docs/CHIT_FUND_ANALYTICS_HANDOFF.md` and verify the remote tip with `git ls-remote origin refs/heads/main`. Never reset, clean, stash, force-push or rewrite history.

## Purpose and architecture

The project records personal chit-fund source messages, expected auction-round state, reviewed discrepancies and actual cash-flow ledger entries. It exposes dashboards, verification queues, printable statements, Excel exports and a Markdown audit export.

- Frontend/server: Next.js 16, React 19, TypeScript 5 and Tailwind CSS 4.
- Data/auth: Supabase Auth and PostgreSQL with tracked RLS policies.
- Calculations: Big.js-backed expected-value and ROI logic.
- Tests/hosting: Vitest, GitHub Actions and Vercel.
- Verified development assumption: Node.js 20 as used by CI; PowerShell examples are appropriate on the current Windows checkout.

The conceptual boundary is source information -> expected state -> human verification -> actual ledger -> analytics. Current code does not fully enforce that boundary, as described below.

## Environment-variable names

Values are private and must never be printed or committed.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`

## Setup, run and checks

```powershell
npm ci
Copy-Item .env.local.example .env.local
npm run dev
```

Focused project commands:

```sh
npm test
npx tsc --noEmit
npm run lint
npm run build
npm start
```

Do not install dependencies or run full suites merely for documentation edits. Do not apply Supabase migrations, inspect production rows, change credentials or alter permissions without explicit approval.

## Verification evidence

- The repository README previously recorded 518 Vitest tests at the application checkpoint. This closeout did not rerun them and does not present that count as fresh evidence.
- The tracked GitHub Actions workflow runs `npm ci`, tests, TypeScript and the production build on `main` pushes and pull requests.
- The tracked schema verification script is `supabase/tests/verify_schema.sql`; it was not executed against any database in this closeout.
- Documentation validation in this closeout is limited to Markdown/link/image checks, code/config consistency and Git preservation checks.

## Deployment state

| Item | Verified value |
| --- | --- |
| Public URL | <https://chitfund-analytics.vercel.app/> |
| HTTP check | `200`, with unauthenticated redirect to `/login`, on 21 October 2026 |
| Vercel state | `READY`, production |
| Deployed commit | `d65a9cd9f02005f66951f42a9f8437cd8ebb65ff` |
| Deployment ID | `dpl_CKM24BkWrNPYiMgqb3Z8g9Wscgm7` |

This proves the identified build is hosted and reachable. It does not prove production database contents, correctness of live financial records or the absence of race conditions.

## Unresolved blockers

1. Import confirmation currently treats parsed `stated_payment` as an actual `INSTALLMENT_PAID` entry; due/stated and paid semantics must be separated.
2. Import confirmation assigns current timestamps to auction and transaction dates instead of preserving reviewed historical dates.
3. Auction, ledger and source-message persistence uses sequential Supabase calls without one PostgreSQL transaction and can leave partial ingestion.
4. Correction is a check-then-insert flow without a database uniqueness guarantee on `corrects_entry_id`, allowing concurrent duplicate corrections.
5. Whole-chit verification has an optimistic `updated_at` guard, but per-round confirmation paths do not consistently prove a conditional state transition or distinguish a zero-row update from success.
6. The schema does not enforce the full append-only, correction-shape, sign, single-correction and cross-owner relationship invariants described by the model.

Proposed fixes are not current behavior. Keep these blockers in every release note until implementation, isolated PostgreSQL verification and concurrency tests are complete.

## Next action and approval boundary

Next code action: design a single reviewed PostgreSQL RPC/transaction for confirmation that accepts explicit historical event/payment dates and separates expected installments from actual payments. In the same approved repair, add database constraints for correction and ownership invariants, then test concurrent correction and verification paths against isolated PostgreSQL.

Explicit approval is required before changing application code, applying migrations, touching production Supabase data or permissions, rotating credentials, changing Vercel settings, deploying a repair, force-pushing or rewriting history.

## Freeze decision

Documentation may be frozen after this closeout. The application must remain in **needs code repairs** state; do not label it production-ready.

# Chit Fund Analytics

An authenticated personal chit-fund tracker for recording auction rounds, preserving source messages, separating expected calculations from actual cash flows, reviewing discrepancies, and exporting statements. The current implementation is a portfolio project with a live authenticated deployment; it is **not production-ready financial software**.

[![Live app](https://img.shields.io/badge/Live_app-Authenticated-111827?logo=vercel)](https://chitfund-analytics.vercel.app/)
[![CI](https://github.com/Nithish-kumar-git/chitfund-analytics/actions/workflows/ci.yml/badge.svg)](https://github.com/Nithish-kumar-git/chitfund-analytics/actions/workflows/ci.yml)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com/)

- Live app: <https://chitfund-analytics.vercel.app/> (redirects unauthenticated visitors to `/login`)
- Source: <https://github.com/Nithish-kumar-git/chitfund-analytics>
- Maintenance handoff: [docs/CHIT_FUND_ANALYTICS_HANDOFF.md](docs/CHIT_FUND_ANALYTICS_HANDOFF.md)

Screenshots use fictional illustrative data.

| Dashboard | Round detail | Verification |
| --- | --- | --- |
| ![Dashboard mockup](docs/assets/dashboard-mockup.jpg) | ![Round-detail mockup](docs/assets/chit-detail-mockup.jpg) | ![Verification mockup](docs/assets/verification-mockup.jpg) |

## Implemented capabilities

- Supabase Auth and row-level-security policies for owner-scoped records.
- Chit configuration, auction-round records, source-message ingestion and manual classification of unknown events.
- Calculation paths for normal rounds, `SPECIAL_NO_AUCTION`, final rounds and unknown events.
- Verification states: `VERIFIED_FORMULA`, `CONFIRM_SOURCE`, `MANUAL_OVERRIDE`, `FLAGGED_MISMATCH` and the legacy/default state used before review.
- Append-oriented ledger reads, explicit installment and payout recording, manual correction entries, and client-generated idempotency keys for supported forms.
- Atomic confirmed ingestion that keeps expected auction amounts separate from explicitly recorded cash flow and preserves source dates without inventing missing history.
- Database-enforced correction uniqueness, exact round bounds, monotonic verification invalidation, and cross-record profile/chit ownership constraints.
- Completion and verification gates before final ROI is displayed; active chits show actual cash-flow summaries instead.
- Printable statements, XLSX exports and a Markdown audit export.

## Financial model

For a normal auction round, the implemented expected-value calculation is:

```text
net_thallu        = thallu - commission
member_thallu     = net_thallu / member_count
expected_payment  = base_installment - member_thallu
```

Expected values are not automatically proof that money changed hands. Ledger entries represent recorded cash flow. Auction dates and payment dates are separate fields. Installment savings reduce outflow relative to the base installment; they are not profit. Final ROI remains blocked for incomplete, unverified or mismatched data.

See [docs/financial-model-spec.md](docs/financial-model-spec.md), [docs/roi-engine-audit.md](docs/roi-engine-audit.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Financial-integrity verification

The bounded repair at commit `77936ccd85f19e19193fbd06a43ec61b9f1f3a8b` was verified on an isolated PostgreSQL 18.1 cluster. All seven migrations applied in order, the committed SQL regression passed, controlled ingestion failure left no partial source/event/ledger rows, concurrent correction allowed exactly one commit, and both verification/mutation race orderings ended safely. Exact round bounds and nine composite ownership constraints were also exercised.

The disposable test used a minimal Supabase authentication shim. It did not exercise GoTrue, the Supabase Data API, or complete client-side RLS integration, and it does not establish that the repaired commit is deployed. Treat the application as review-assisted financial software rather than an authoritative accounting ledger.

## Architecture

```text
Browser
  -> Next.js 16 server actions and route handlers
  -> Supabase Auth
  -> PostgreSQL tables protected by RLS

Source messages -> parsed proposal -> human confirmation
                -> auction events (expected state)
                -> ledger entries (recorded actual cash flow)
                -> verification gates -> analytics / exports
```

Stack: Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, Supabase Auth/PostgreSQL, Big.js, Vitest and Vercel.

## Local setup

Requires Node.js 22+ and npm. From the repository root:

```powershell
npm ci
Copy-Item .env.local.example .env.local
npm run dev
```

Set only these names in `.env.local`; keep their values private:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public client key used with Auth and RLS |
| `NEXT_PUBLIC_APP_URL` | Application origin used by auth redirects |

The tracked SQL migrations are under `supabase/migrations/`. Do not apply them to a production database as part of local setup or documentation work.

## Focused checks

```sh
npm test
npx tsc --noEmit
npm run lint
npm run build
```

GitHub Actions runs install, tests, type-checking and build for pushes and pull requests to `main`. The repair checkpoint passed 498 tests with 17 placeholder integration tests intentionally skipped; focused database behavior was verified separately in disposable PostgreSQL.

## Deployment status

The last recorded deployment evidence identifies commit `d65a9cd9f02005f66951f42a9f8437cd8ebb65ff` as `READY`. This documentation closeout did not deploy or establish that the verified repair commit is live.

## Project status

The bounded financial-integrity repair can be frozen at commit `77936ccd85f19e19193fbd06a43ec61b9f1f3a8b`. This is not a production-readiness certification: deployment status and full Supabase Auth/Data API/RLS integration remain separate verification questions, and the repository retains documented lint and dependency-audit findings.

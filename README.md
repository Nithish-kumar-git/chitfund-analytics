# Chit Fund Analytics

A professional, privacy-first financial tracking application designed for managing personal and family Indian chit fund investments. It replaces manual spreadsheet tracking and fragmented WhatsApp messages with a strict, append-only financial ledger, automated event classification, and robust data-quality safeguards.

## What Is a Chit Fund?

A chit fund is a traditional Indian financial instrument that combines borrowing and savings. A group of members contributes a fixed base installment every month. Each month, an auction is held, and one member takes the "pot" (the accumulated pool of money) at a discount. The discounted amount (the "thallu" or dividend) is distributed equally among all members, reducing their required payment for that month.

Because the required payment fluctuates every month based on the auction results, tracking expected payments, actual cash flows, and overall Return on Investment (ROI) across multiple chit funds simultaneously is notoriously difficult to manage manually.

## The Problem

Managing family chit funds typically involves:
- Fragmented unstructured information scattered across WhatsApp messages.
- Difficulty distinguishing between the mathematically *expected* payment and the *actual* cash paid.
- Ambiguity regarding auction outcomes (e.g., who won, at what discount, on what date).
- Silent tracking errors where missing data or rounding differences go unnoticed until maturity.
- Unsafe ROI calculations that assume the chit is complete or verified when it is not.

## What This System Does

Chit Fund Analytics imports unstructured data, projects the expected mathematical state of the chit, and enforces strict reconciliation through a Verification Review Queue. Only verified data is committed to the append-only ledger, ensuring that all dashboards, cash flow analytics, and exports are built on absolute financial truth.

## Core Features

- **Command Center Dashboard:** A unified view of portfolio health, active cash flow requirements, and data quality alerts.
- **Chit Tracking & Round Classification:** Manages complete lifecycles of multiple chits, classifying events automatically (e.g., standard auctions vs. special festive months without auctions).
- **Financial Verification Review Queue:** A dedicated UI for resolving discrepancies between imported source data and mathematically expected values before they enter the ledger.
- **Append-Only Financial Ledger:** Immutable transaction history. Mistakes are corrected via explicit overriding entries (`corrects_entry_id`) rather than destructive updates.
- **Installment Savings Tracking:** Calculates the real savings generated from monthly dividends.
- **ROI Eligibility Safeguards:** ROI is strictly guarded and only computed when a chit has reached maturity and all prior rounds are fully verified.
- **PDF/Print Statements:** Professional, printable statements of a chit's lifecycle.
- **XLSX Export:** Export detailed historical and financial data into Excel for external auditing.
- **Claude Financial Audit Export:** Formats historical data into a structured `.md` payload optimized for LLM-based financial audits.
- **Actual Payout Recording:** Enables users to explicitly record and verify actual cash payouts for won auction rounds against the append-only ledger.

## Financial Safety Model

The core philosophy of this application is financial safety and data integrity:

- **Expected payment != actual payment:** The system tracks both and highlights variances.
- **Actual cash flow != profit:** Cash flow and profit are distinct metrics; cash flow tracks liquidity requirements, while profit requires maturity.
- **Installment savings != profit:** Savings reduce monthly outflows but do not equate to finalized profit.
- **Auction date != transaction/payment date:** These concepts are never conflated, ensuring accurate time-value-of-money calculations.
- **`UNKNOWN` remains `UNKNOWN`:** Missing data is never silently interpolated.
- **`SPECIAL_NO_AUCTION` has no individual winner:** Explicitly handled as a non-auction event.
- **Mismatches are not silently corrected:** They are flagged as `FLAGGED_MISMATCH` and placed in the Review Queue.
- **Financial corrections preserve append-only history:** Destructive operations are prevented at the database level.
- **ROI remains blocked:** If required verification or completeness conditions are not met, ROI is explicitly locked to prevent misleading financial decisions.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed information on the system boundaries, data flow, and database schema.

## Screenshots / Showcase

*(Due to strict privacy and data security policies regarding real family financial data, sanitized synthetic screenshots are omitted from this public repository at this time. Mock data cannot safely be generated within the existing application without risking production code/data integrity. The application is actively used in production for live financial tracking.)*

## Testing & Reliability

The application is heavily tested with Vitest, focusing extensively on the mathematical and domain logic inside `src/lib`.

- **Test Suite:** 501 passed, 17 skipped, 518 total tests.
- **TypeScript:** Strict type checking (`npx tsc --noEmit`) passes with zero errors.
- **Build:** Production build (`npm run build`) compiles successfully.

## Technology Stack

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS v4
- **Language:** TypeScript
- **Backend & Database:** Supabase PostgreSQL, Supabase Auth
- **Testing:** Vitest, React Testing Library
- **Deployment:** Vercel

## Local Development

```bash
# Install dependencies
npm install

# Copy environment template and fill in your Supabase credentials
cp .env.local.example .env.local

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Documentation

- [Historical Project Specification](docs/historical-spec.md)
- [Architecture Reference](docs/ARCHITECTURE.md)

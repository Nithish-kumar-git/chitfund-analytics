# Chit Fund Analytics

Private family chit fund tracking and analytics application.

## Stack

- **Frontend:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4
- **Backend:** Supabase PostgreSQL · Supabase Auth
- **Deployment:** Vercel

## Project Status

**PRODUCTION** 

The application is deployed to production, actively managing real financial records for 3 live chits (3L A Group, 3L B Group, 3L C Group).

All core transaction workflows (append-only ledger, corrections, auction rounds) are fully implemented and verified. Currently iterating on Phase 1 of the Dashboard features, focusing on Installment Savings, Data Quality / Attention Required, and AI Financial Auditing integrations.

**Important Safety Rule for Contributors:**
- Do NOT modify database schema.
- Do NOT modify/delete/re-import production data.
- Do NOT alter the underlying 3 real chits.
- Do NOT change ROI logic or Installment Savings calculation.
- Preserve UNKNOWN / FLAGGED_MISMATCH / MANUAL_OVERRIDE semantics.

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

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Security

This is a private application. Never commit `.env.local` or any file containing Supabase credentials, service-role keys, or other secrets.

# Chit Fund Analytics

Private family chit fund tracking and analytics application.

## Stack

- **Frontend:** Next.js 16 (App Router) · TypeScript · Tailwind CSS v4
- **Backend:** Supabase PostgreSQL · Supabase Auth
- **Hosting:** Vercel

## Project Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Database foundation, schema, RLS security |
| Phase 2 | Planned | Authentication UI, Chit management |
| Phase 3+ | Planned | Auction data entry, analytics |

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

## Database

Migrations are in `supabase/migrations/`. Apply in order via the Supabase Dashboard → SQL Editor.

| File | Description |
|------|-------------|
| `20260928000001_initial_schema.sql` | All 8 tables, indexes, triggers |
| `20260928000002_rls_policies.sql` | Row Level Security + auto-profile trigger |

Verification queries: `supabase/tests/verify_schema.sql`

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Security

This is a private application. Never commit `.env.local` or any file containing
Supabase credentials, service-role keys, or other secrets.

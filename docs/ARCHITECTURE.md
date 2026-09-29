# Chit Fund Analytics — Architecture & Schema Reference

> Phase 1 · Private family chit fund tracker · Last updated 2026-09-28

---

## Overview

A private, single-family application for tracking chit fund investments.
Built on Next.js + TypeScript (frontend), Supabase PostgreSQL + Auth (backend).
Designed so new chits can be added from the UI without code changes.

---

## Table Reference

### 1. `profiles`
Auth anchor. One row per authenticated user. `id` mirrors `auth.users(id)`.
Auto-created on signup via `handle_new_user()` trigger.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID PK | = auth.users(id) |
| `display_name` | TEXT | Optional |

---

### 2. `chit_companies`
Optional registry for chit companies (Shriram, Margadarsi, etc.).
A chit does **not** require a company (`chits.company_id` is nullable).

---

### 3. `chits`
Master record for one complete chit scheme.

Key financial fields:
- `face_value`, `base_installment`, `member_count`, `duration_months` — scheme parameters
- `face_value ≈ base_installment × member_count` — expected relationship, NOT a hard constraint
- `commission_type` + `commission_value` — configurable; NOT hardcoded at 2.5%
- `status` — ACTIVE / COMPLETED / EXITED / ARCHIVED

`chits` can be added from the UI without schema changes — this satisfies the
*"new chits without code changes"* requirement.

---

### 4. `source_messages`
Verbatim WhatsApp messages. **raw_text is immutable after insert.**

- `parse_status`: PENDING → PARSED / PARSE_FAILED / DUPLICATE / SUPERSEDED
- `content_hash`: SHA-256 of raw_text (application-computed) for dedup
- `matched_auction_event_id`: nullable FK to auction_events (circular FK resolved via ALTER TABLE)
- **No DELETE policy** — source messages are preserved permanently

---

### 5. `auction_events`
One row per monthly round.

| Field | Notes |
|-------|-------|
| `round_number` | 1-indexed. Use "round_number", NOT "chit number" |
| `event_type` | NORMAL / SPECIAL_NO_AUCTION / FINAL / UNKNOWN |
| `our_payout_amount` | **NULLABLE** — winner settlement mechanics unverified |
| `calculation_status` | VERIFIED_FORMULA / INDUSTRY_DEFAULT / MANUAL_OVERRIDE / FLAGGED_MISMATCH |

> **CRITICAL**: FINAL and SPECIAL_NO_AUCTION events must NOT be processed
> through the normal auction formula. The formula applies to NORMAL events only.

Unique constraint: `(chit_id, round_number)` — one record per round per chit.

---

### 6. `ledger_entries`
Append-only financial ledger. Single table for all cash movements — no separate
payment_records or portfolio_transactions tables.

**Amount sign convention:** negative = we paid out, positive = we received.

**Correction pattern:** To fix a confirmed entry:
1. Insert a new row with `entry_type = 'MANUAL_CORRECTION'`
2. Set `corrects_entry_id` to the original entry's id
3. Do NOT update or delete the original

RLS enforces append-only at the database level: no UPDATE or DELETE policy exists.

---

### 7. `context_events`
Calendar events (Diwali, family functions, emergencies) for future historical
analysis. Causal inference is **not** implemented in Phase 1.

---

### 8. `user_rules`
User-defined decision boundaries. Decision logic **not** implemented in Phase 1.

Possible future `rule_type` values (not an enum — extensible):
- `MAX_ACCEPTABLE_THALLU`
- `MIN_ACCEPTABLE_CASH`
- `MAX_EFFECTIVE_COST`
- `TARGET_RETURN`

`chit_id` nullable — null means the rule applies globally across all chits.

---

## Relationships

```
auth.users
    │
    ▼
profiles ──────────────────────────────────────────┐
    │                                               │
    ├──► chit_companies (optional)                 │
    │         ▲                                    │
    ├──► chits ─────────────────────────────────── ┤
    │         │                                    │
    │    ┌────▼─────────┐                          │
    │    │ source_messages │◄──────────────────────┤
    │    └────┬─────────┘                          │
    │         │ matched_auction_event_id            │
    │    ┌────▼──────────┐                         │
    │    │ auction_events │◄──── source_message_id  │
    │    └────┬──────────┘                         │
    │         │                                    │
    │    ┌────▼──────────┐                         │
    │    │ ledger_entries │                         │
    │    └───────────────┘                         │
    │                                              │
    ├──► context_events                            │
    └──► user_rules ────────────────(chit_id opt.)─┘
```

source_messages ↔ auction_events have a bilateral soft reference (each can
point to the other). Resolved by creating source_messages first, then adding
the FK via ALTER TABLE after auction_events exists.

---

## Security Model

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| profiles | own | own | own | ✗ (intentional) |
| chit_companies | own | own | own | own |
| chits | own | own | own | own |
| source_messages | own | own | own | ✗ (preserve raw data) |
| auction_events | own | own | own | own |
| ledger_entries | own | own | ✗ (append-only) | ✗ (append-only) |
| context_events | own | own | own | own |
| user_rules | own | own | own | own |

"own" = `auth.uid() = profile_id` (or `auth.uid() = id` for profiles).

---

## Financial Assumptions

### Verified (from real WhatsApp data — NORMAL auction only)
```
net_thallu         = thallu - commission
member_thallu      = net_thallu / member_count
non_winner_payment = base_installment - member_thallu
```

Example:
- Face ₹3,00,000 · Base ₹12,000 · 25 members · Thallu ₹56,000 · Commission ₹7,500
- net_thallu = ₹48,500 · member_thallu = ₹1,940 · non_winner pays ₹10,060

### Explicitly UNKNOWN — do not implement until verified
1. **Winner payout amount** — unknown whether it equals face_value, face_value minus commission, or something else
2. **Commission deduction from winner payout** — unverified
3. **Maturity settlement mechanics** — FINAL round behaviour unknown
4. **Special second-round rules** — SPECIAL_NO_AUCTION mechanics unknown
5. **Legal / industry thallu bounds** — not encoded

---

## Migration Files

| File | Description |
|------|-------------|
| `20260928000001_initial_schema.sql` | All 8 tables, indexes, updated_at triggers |
| `20260928000002_rls_policies.sql` | RLS enable + all policies + auto-profile trigger |

---

## TypeScript Types

`src/types/database.ts` — hand-authored Row / Insert / Update types for all 8 tables.
In later phases, replace with: `npx supabase gen types typescript --linked`

---

## Out of Scope (Phase 1)

- Authentication UI (login/signup pages)
- Chit CRUD UI
- WhatsApp message parsing
- Calculation engine
- Analytics / charts
- AI / embeddings / RAG
- n8n integration
- Predictions / ML

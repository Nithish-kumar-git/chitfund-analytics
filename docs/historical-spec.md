This is a continuation of an existing project. The handoff document below is the source of truth.

RULES FOR THIS NEW CHAT:
1. Do not re-decide anything marked settled, and do not restart the architecture.
2. If something is not in the handoff, say "I don't have that" and ask me. Never guess or invent details, numbers, file names, table names, or commit hashes.
3. If you notice a contradiction in the handoff, flag it before proceeding.
4. Give me ONE focused copy-paste prompt for Antigravity at a time, and tell me which model to use.
5. Known open item: the ledger-entry counts in section 19 are unverified and conflict with sections 10/37/54 (zero historical ledger entries). Do not rely on them until I confirm from the database.
6. Start by replying with a 5-line summary of the project's current state and the exact next step, so I can confirm you understood. Do not start implementing anything yet.

=== HANDOFF STARTS BELOW ===

Absolutely, man. Below is a **full handoff document** you can paste as the first message in a fresh chat. I’ve written it so the new chat can act as if it has the important project history and decisions from this conversation.

---

# CHIT FUND PROJECT — COMPLETE HANDOFF / CONTEXT FOR NEW CHAT

## 0. HOW TO USE THIS HANDOFF

I am continuing an existing software project called **CHIT FUND**. Treat everything below as established project context unless I explicitly change something later.

Do **not** restart the architecture from scratch, re-question decisions that are already settled, or suggest rebuilding working parts unnecessarily.

My preferred workflow is:

**Me → ChatGPT (architect/reviewer) → Antigravity (implementation agent) → GitHub/Vercel/Supabase**

ChatGPT should primarily:

* reason about architecture and product decisions
* review implementation plans
* catch financial/domain mistakes
* review Antigravity outputs/logs
* give me precise copy-paste prompts for Antigravity
* tell me which Antigravity model to use
* prevent unsafe database/data changes
* decide what should/shouldn't be implemented next

Antigravity should primarily:

* modify the code
* run tests
* inspect/build/deploy
* execute controlled Supabase operations when explicitly instructed
* report implementation results

I prefer **one focused prompt/phase at a time**, not huge multi-phase instructions unless necessary.

---

# 1. PROJECT OVERVIEW

## Project name

**CHIT FUND**

Repository:

`https://github.com/Nithish-kumar-git/chitfund-analytics`

Production Vercel app:

`https://chitfund-analytics.vercel.app/`

The GitHub repository is private.

---

## What the product is

This is a **personal/family chit-fund tracking and financial analysis web application**.

The purpose is to convert messy chit-fund information—especially WhatsApp messages containing auction results, thallu, commission, payment amounts, winners, etc.—into structured, auditable data.

The app should eventually let the user:

* create/configure chit funds
* track monthly/round-wise auctions
* preserve original WhatsApp/source messages
* parse auction messages
* review uncertain/ambiguous parsed data
* manually correct/classify events
* record actual cash flows
* track installments actually paid
* track payouts actually received
* calculate financial metrics
* distinguish expected amounts from actual transactions
* eventually calculate completed-chit ROI
* export portfolio and individual-chit statements
* eventually provide useful analytics/dashboarding
* potentially add AI narration later, but AI must not invent financial facts

The app is primarily for **the user's own/family chit-fund management**, not currently a general SaaS product.

---

# 2. IMPORTANT DOMAIN MODEL

This is one of the most important parts of the project.

## Chit vs round

A **chit** is the entire scheme/fund.

A **round** is an individual monthly auction/installment.

For example:

* 3L A Group = one chit
* Round 1 = one auction/month
* Round 2 = another auction/month
* etc.

Do NOT confuse a chit with an individual auction.

---

# 3. CHIT CONFIGURATION MUST BE MODULAR

Never assume:

`member_count = duration_months`

and never assume:

`base_installment = face_value / member_count`

These values must be independently configurable.

Examples:

### 3L / 25-member chit

* Face value: ₹3,00,000
* Members: 25
* Duration: 25 months
* Base installment: ₹12,000

### Another possible 3L chit

* Face value: ₹3,00,000
* Members: 20
* Duration: 20 months
* Base installment: ₹15,000

Therefore the application must never hard-code those relationships.

---

# 4. NORMAL AUCTION FORMULA

For a NORMAL auction:

```text
net_thallu = thallu - commission

member_thallu = net_thallu / member_count

non_winner_payment = base_installment - member_thallu
```

Example:

Face value = ₹3,00,000

Base installment = ₹12,000

Members = 25

Thallu = ₹56,000

Commission = ₹7,500

Therefore:

```text
net_thallu = 56,000 - 7,500
           = 48,500

member_thallu = 48,500 / 25
              = ₹1,940

non_winner_payment = 12,000 - 1,940
                    = ₹10,060
```

Winner payout for the **3L reference chit**:

```text
300,000 - 56,000 = ₹244,000
```

BUT IMPORTANT:

### Winner payout formula is NOT globally generalized.

`face_value - thallu` was confirmed only for the relevant 3L reference chit.

The authoritative field for actual payout is:

```text
auction_events.our_payout_amount
```

Do not automatically calculate a payout for every chit unless the chit-specific rules are confirmed.

---

# 5. WINNER CONTINUES PAYING

A winner does **not** stop paying future monthly installments.

The winner:

* receives the payout for that round
* continues participating
* continues paying monthly installments afterward

Everyone pays monthly, including:

* winners
* non-winners
* Sangam
* final member

---

# 6. THAI CHITTU / SANGAM

This was a major clarification.

A Thai Chittu / Sangam round is **not a normal auction with thallu = 0**.

It is a distinct event type:

```text
SPECIAL_NO_AUCTION
```

Example:

3L chit:

* Face value = ₹3,00,000
* Commission = ₹7,500
* Sangam payout = ₹292,500

Formula:

```text
special payout = face_value - commission
                = ₹292,500
```

There is:

* no thallu
* no member-thallu reduction
* everyone pays the full base installment
* e.g. ₹12,000

### Critical clarification

For Thai Chittu / Sangam:

**There is NO individual winner.**

Sangam receives the chit amount.

Therefore:

```text
won_by_us = NULL
```

not `FALSE`.

The UI must say something like:

> Not applicable — Thai Chittu / Sangam

It must not ask for an individual winner.

---

# 7. FINAL ROUND

The final remaining member receives the final payout without an auction.

For the 3L example:

```text
₹300,000 - commission
```

Example:

```text
₹300,000 - ₹7,500 = ₹292,500
```

Everyone still pays the full base installment.

The final event is distinct:

```text
FINAL
```

---

# 8. KULUKAL

KULUKAL happens when nobody bids in a normal auction.

Important:

We do **NOT** know the exact KULUKAL thallu/selection rule sufficiently yet.

Therefore:

* don't assume thallu = 0
* don't invent payout
* don't invent commission treatment
* don't invent selection rules

If exact data is unavailable:

```text
UNKNOWN
```

or

```text
MANUAL_OVERRIDE
```

as appropriate.

Future actual KULUKAL data should preserve the actual values.

---

# 9. CASH FLOW / LEDGER PRINCIPLES

This is extremely important.

The project distinguishes:

### Expected amount

Example:

```text
non_winner_payment
```

This means:

> the amount the member is expected to pay.

It does **NOT** prove that the user actually paid it.

### Actual cash flow

Actual transactions come from:

```text
ledger_entries
```

Examples:

* INSTALLMENT_PAID
* AUCTION_PAYOUT_RECEIVED
* ADJUSTMENT
* LATE_FEE
* MATURITY_SETTLEMENT
* MANUAL_CORRECTION

Current direction semantics were documented as:

* negative = paid
* positive = received

BUT historical ingestion had some positive `stated_payment` values for `INSTALLMENT_PAID`, so the system currently uses **entry type/direction logic + absolute values** where necessary.

Do not casually redesign this without reviewing the financial model.

---

# 10. HISTORICAL BACKFILL RULE

Historical WhatsApp imports were intentionally done conservatively.

The raw messages often say:

> கட்ட வேண்டிய தொகை

meaning the amount due.

That is **not proof that the user actually paid it**.

Therefore historical backfill created:

* `source_messages`
* `auction_events`

but **ZERO historical ledger entries**.

This was deliberate.

Do NOT "fix" the importer by turning historical expected payments into actual payments.

---

# 11. ROI RULES

## Active chit

Do NOT call active cash-flow difference "profit".

Safe active metrics:

* total installments paid
* installment count
* total payouts received
* effective transaction count
* net actual cash flow to date

This may be displayed as:

> Net actual cash flow

but not:

> Profit

unless the chit is properly completed and verified.

---

## Completed chit ROI

Completed ROI:

```text
(total_actual_received - total_actual_paid)
/
total_actual_paid
* 100
```

But ROI is only eligible when all of these are true:

1. Chit status = `COMPLETED`
2. All expected rounds are recorded
3. Recorded round count >= duration
4. No unresolved `FLAGGED_MISMATCH`
5. Effective ledger entries exist
6. Actual cash-flow completeness has been verified
7. No unresolved correction/data-quality issue
8. Verification state is valid

If these conditions aren't satisfied:

> ROI = unavailable / N/A

Do not fabricate projected ROI.

---

# 12. XIRR

XIRR was deliberately deferred.

Do not implement it casually.

Future XIRR should only happen after:

* chit closed
* all rounds recorded
* all cash flows recorded
* corrections reviewed
* verified solver

---

# 13. PORTFOLIO ROI

Portfolio-wide ROI is also deferred until individual chit financial data is reliable.

Do not aggregate incomplete active-chit data and call it portfolio ROI.

---

# 14. DATABASE SCHEMA

Core tables:

```text
profiles
chit_companies (optional)
chits
source_messages
auction_events
context_events
user_rules
ledger_entries
```

RLS is scoped to authenticated user's profile.

---

# 15. IMPORTANT `auction_events` FIELDS

Relevant fields include:

```text
round_number
event_type
thallu
commission
net_thallu
member_thallu
non_winner_payment
won_by_us
our_payout_amount
auction_date
calculation_status
source_message_id
notes
```

Event types:

```text
NORMAL
SPECIAL_NO_AUCTION
FINAL
UNKNOWN
```

Calculation status values:

```text
VERIFIED_FORMULA
INDUSTRY_DEFAULT
MANUAL_OVERRIDE
FLAGGED_MISMATCH
```

---

# 16. LEDGER CORRECTION MODEL

Ledger is append-only.

There is no normal UPDATE/DELETE workflow for historical financial entries.

Corrections are represented by another ledger entry:

```text
corrects_entry_id
```

Example:

Original:

```text
₹10,060
```

Correction:

```text
₹10,000
```

Effective financial calculation uses the corrected amount.

UI should show the original as:

> SUPERSEDED

This was tested successfully.

---

# 17. VERIFICATION MODEL

The project has explicit financial verification.

Chits have:

```text
verified_at
verified_by
```

Financial modifications invalidate verification.

Database triggers were added so that inserting:

* ledger entries
* auction events

automatically clears parent chit verification.

Cosmetic edits should NOT invalidate financial verification.

The verify action uses optimistic locking with `updated_at`.

---

# 18. IMPORTANT PRODUCTION MIGRATIONS

Applied to production Supabase:

```text
20261003000001_add_cash_flow_verification.sql
20261003000002_verification_invalidation_triggers.sql
20261003000003_add_idempotency_key.sql
```

The latest adds:

```text
ledger_entries.idempotency_key UUID
```

with partial unique index:

```text
(profile_id, idempotency_key)
WHERE idempotency_key IS NOT NULL
```

These production migrations were applied and verified.

Do not re-run or recreate them unnecessarily.

---

# 19. PRODUCTION DATABASE

Supabase project:

```text
<SUPABASE_PROJECT_ID>
```

Production migrations were verified as synchronized.

There are currently **3 real chits** remaining:

```text
3L A Group
3L B Group
3L C Group
```

Current counts after cleanup:

### 3L A Group

* 9 auction events
* 9 ledger entries (UNVERIFIED - conflicts with sections 10/37/54)
* 9 source messages

### 3L B Group

* 16 auction events
* 16 ledger entries (UNVERIFIED - conflicts with sections 10/37/54)
* 16 source messages

### 3L C Group

* 13 auction events
* 13 ledger entries (UNVERIFIED - conflicts with sections 10/37/54)
* 13 source messages

Totals:

```text
3 chits
38 auction events (9 + 16 + 13)
38 source messages (9 + 16 + 13) - UNVERIFIED, re-check from DB
Ledger entries: UNVERIFIED / CONFLICTING (see note below)
```

NOTE: The per-chit "ledger entries" counts above conflict with sections 10, 37 and 54,
which say historical import created ZERO ledger entries and no fake historical ledger data
exists. Treat the ledger counts in this section as unreliable. Before relying on any
ledger count, ask me to run a DB check.

The latest cleanup report specifically verified the three real chits' event/ledger/source counts individually.

---

# 20. TEST DATA CLEANUP

Two Phase 7G E2E test chits were previously removed:

```text
E2E_TEST_PHASE7G_1790976855357
E2E_TEST_PHASE7G_1790976910816
```

Then, after confirmation, the remaining:

```text
Test 3L Chit
```

was also deleted.

Its exact UUID was:

```text
71884265-05ed-4861-bfa5-ce94fa33d27b
```

Pre-delete:

* 5 auction events
* 6 ledger entries
* 0 user rules
* 6 source messages

Post-delete:

* chit = 0
* auction events = 0
* ledger entries = 0
* user rules = 0

The 6 old source messages were intentionally preserved but their:

```text
chit_id
matched_auction_event_id
```

were set to NULL because the FK behavior is `SET NULL`.

### Current state

There should now be **no test chit remaining**.

---

# 21. GIT / REPO STATUS

Important rule:

```text
supabase/.temp/
```

must ALWAYS remain untracked and must never be staged/committed.

There are also local production helper files such as:

```text
PRODUCTION_MIGRATION_GUIDE.md
supabase/check-migration-state.sql
```

which were previously intentionally left untracked.

Do not accidentally commit them.

The recent database cleanup did NOT require Git changes.

There was:

* no source-code modification
* no migration modification
* no Git commit
* no push

for the final `Test 3L Chit` deletion.

---

# 22. TECH STACK

Current stack:

### Frontend / app

* Next.js
* TypeScript
* React
* Tailwind/UI components as used in repo

### Backend

Primarily:

* Next.js server actions / API routes
* Supabase

There is currently **no deployed Python backend**.

### Database/Auth

* Supabase Postgres
* Supabase Auth
* Row Level Security

### Hosting

* Vercel

### Source control

* GitHub

### Local development

* Node.js
* npm
* Python where needed
* Supabase CLI
* PowerShell / Windows environment

### Testing

* automated project test suite
* TypeScript checks
* build checks
* production smoke/E2E work through Antigravity/Playwright where possible

### Exports

Excel export implemented with:

```text
xlsx / SheetJS
```

### Future/optional

* n8n: later, only if there is a real automation need
* Python backend: not currently required
* RAG: not V1
* AI agents: not V1
* AI narration: later, read-only and grounded in validated financial data

---

# 23. ANTIGRAVITY WORKFLOW

This is important.

I use **Antigravity as the implementation agent**.

I give Antigravity prompts generated/reviewed by ChatGPT.

Antigravity has been used with Claude models and other available models.

Model preference:

### Gemini Pro

Use for:

* architecture
* difficult reasoning
* complex debugging
* high-risk implementation decisions

### Claude Opus

Previously used for harder implementation/reasoning, but its usage/credits became exhausted.

### Claude / fast/cheap model

Use for:

* straightforward implementation
* Git cleanup
* deployment
* simple UI fixes
* controlled database operations after the exact task is defined

The user prefers ChatGPT to give **copy-paste-ready prompts**.

---

# 24. VERCEL

Production deployment:

```text
https://chitfund-analytics.vercel.app/
```

Latest relevant deployment around the current stage was confirmed Ready.

Do not assume a local code change is live until Vercel deployment is confirmed.

---

# 25. MAJOR PHASE HISTORY

The project has been built incrementally.

Important commits:

```text
527b690
c98060c
17ae35a
5c855fe
8ed0135
d4288c1
a799426
e8ca88d
0e53fc8
76ff21d
f23d8ac
882d765
6cb3d10
feaa9be
e4e64db
df61e46
b5866f9
d4a3bd0
5bf3a8d
13d775c
c29f672
2440ac5
d72a80c
02ce3f2
aada892
94c2167
f4edbe4
82ddd57
```

Most recent meaningful feature commits:

```text
02ce3f2
aada892
94c2167
f4edbe4
82ddd57
```

Do not rewrite history or squash/rebase unless explicitly requested.

---

# 26. PHASE 5C — DUPLICATE PROTECTION

There was a bug where `.single()` caused duplicate checks to fail in certain cases.

It was changed to:

```text
.limit(1).maybeSingle()
```

with explicit errors failing closed.

Duplicate source and duplicate round checks now work.

Tests:

```text
241/241
```

---

# 27. PHASE 6A — EDITABLE CHIT CONFIG

Safe chit configuration editing was implemented.

Users can edit:

* face value
* duration
* member count
* base installment
* etc.

Historical auction events remain untouched.

An actual Vercel test changed:

```text
12,000 → 12,001
```

and verified:

* historical values stayed unchanged
* future unsaved calculations used new configuration

Then it was restored to:

```text
₹12,000
```

---

# 28. PHASE 6B — DASHBOARD FOUNDATION

Dashboard data architecture was introduced.

Important principle:

The initial dashboard is **not supposed to claim complete profit/ROI**.

It uses safe metrics.

There was a bug with total-round calculation which was fixed.

---

# 29. PHASE 6C — WHATSAPP REVIEW QUEUE

Implemented review queue.

Workflow:

```text
WhatsApp/raw message
        ↓
source_messages
        ↓
PENDING / NEEDS_REVIEW / PARSE_FAILED
        ↓
Review
        ↓
confirmFromQueue()
        ↓
re-read raw text
        ↓
re-run parser
        ↓
duplicate checks
        ↓
auction event + ledger if appropriate
        ↓
existing source message becomes PARSED
```

Important:

It does not create a second source message during confirmation.

Dismissed messages become:

```text
SUPERSEDED
```

---

# 30. PHASE 6D — LEDGER VISIBILITY

Read-only ledger visibility was added.

It shows:

* date
* entry type
* related round
* absolute amount
* notes

At that stage we intentionally avoided making broad financial totals because of sign ambiguity.

---

# 31. PHASE 6E — CORRECTIONS

Append-only correction model was implemented.

Tests reached:

```text
304/304
```

---

# 32. PHASE 6F — FINANCIAL MODEL SPEC

Created:

```text
docs/financial-model-spec.md
```

Commit:

```text
d4a3bd0
```

It documented:

* winner payout scope
* completed ROI prerequisites
* KULUKAL limitations
* Sangam ambiguity
* winner identity limitations
* deferred XIRR
* deferred portfolio ROI

---

# 33. PHASE 7C — WINNER/PAYOUT PARSING

Parser was extended to detect:

```text
won_by_us = true
our_payout_amount
```

Important fix:

Ambiguous winner must remain:

```text
NULL
```

Do NOT turn ambiguity into `FALSE`.

Similarly:

* explicit we won → TRUE
* explicit someone else won → FALSE
* unknown → NULL

If we won but payout is not found, parser warns rather than inventing it.

Tests reached:

```text
328
```

---

# 34. PHASE 7E — ROI ENGINE

Pure ROI engine and UI were implemented.

But ROI is intentionally conservative.

A previous unsafe path could potentially show negative/meaningless ROI before cash-flow verification.

That was fixed by requiring:

```text
isCashFlowVerified = true
```

before completed ROI is shown.

---

# 35. PHASE 7F — VERIFICATION

Added:

```text
verified_at
verified_by
```

and financial invalidation triggers.

Final audit at that stage:

```text
376 tests
```

TypeScript/build clean.

---

# 36. PHASE 7G — PRODUCTION E2E

Production E2E was attempted.

Problem:

A new test account could not complete email confirmation.

We decided:

### Do NOT ask the user for:

* Supabase service-role key
* password
* sensitive credentials

Instead reuse the existing authenticated browser via Playwright `storageState`.

Temporary `save-auth.js` was created and later cleaned up.

Phase 7G was not fully completed because of authentication/credit limitations.

---

# 37. PHASE 7H — HISTORICAL IMPORT

Historical WhatsApp data was imported conservatively.

Rules:

* source message preserved
* auction event created
* no fake cash-flow entries
* no fake winner
* no fake payout
* missing year means `auction_date = NULL`
* raw date can remain in notes

Historical classification:

```text
35 NORMAL
2 SPECIAL_NO_AUCTION
1 UNKNOWN
```

Calculation statuses:

```text
32 VERIFIED_FORMULA
3 MANUAL_OVERRIDE
3 FLAGGED_MISMATCH
```

Approximately 27 unresolved dates.

Total:

```text
38 historical records
0 historical ledger entries
```

---

# 38. HISTORICAL CLASSIFICATION DETAILS

### A-2

Raw message explicitly said:

```text
தள்ளு இல்லை
```

Therefore:

```text
SPECIAL_NO_AUCTION
```

### C-2

Also explicitly:

```text
தள்ளு இல்லை
```

Therefore:

```text
SPECIAL_NO_AUCTION
```

Commission was blank and must remain NULL rather than being invented as zero.

### B-2

Raw data contained:

```text
thallu = 0
commission = 0
one-person = 0
payment = 12000
```

but did **not explicitly say**:

```text
தள்ளு இல்லை
```

Therefore it was intentionally kept:

```text
UNKNOWN
```

rather than silently inferred as Thai Chittu.

---

# 39. FORMULA MISMATCHES

C-1, C-4, C-6 contained formula mismatches.

Decision:

**preserve the stated source values**

and mark:

```text
FLAGGED_MISMATCH
```

Do not overwrite the original with a supposedly "correct" calculated value.

---

# 40. UNKNOWN EVENT CLASSIFICATION

A manual classification workflow was later added.

Action:

```text
classifyAuctionEvent()
```

Only UNKNOWN events can be manually classified.

Allowed:

```text
NORMAL
SPECIAL_NO_AUCTION
FINAL
UNKNOWN
```

Classification sets:

```text
calculation_status = MANUAL_OVERRIDE
```

If classified as SPECIAL_NO_AUCTION:

```text
won_by_us = NULL
```

It does NOT modify historical:

* thallu
* commission
* non_winner_payment
* payout
* source message
* auction date

---

# 41. B-R2 UI BUG

B-R2 was UNKNOWN.

The UI initially showed winner/cashflow controls anyway because the page rendered:

```text
WinnerConfirmation
RecordCashFlowForm
```

unconditionally.

This was fixed in:

```text
82ddd5789a12f18c038f175887fefbaae29e5af5
```

Now UNKNOWN events first show the classification workflow.

The user confirmed:

> "yeah man resolved now"

Do not reintroduce that bug.

---

# 42. THAI CHITTU UI FIX

There was another issue where A-R2 was accidentally marked as "Someone Else Won."

A special reset action was created:

```text
resetSpecialNoAuctionWinner
```

It:

* only works for SPECIAL_NO_AUCTION
* requires ownership
* only resets `won_by_us` to NULL

WinnerConfirmation now behaves based on event type.

For:

```text
SPECIAL_NO_AUCTION
```

it shows:

> Not applicable — Thai Chittu / Sangam

and does not treat Sangam as an individual winner.

Commit:

```text
aada892ba6ac7359922ca20bad75023e628e442e
```

---

# 43. PHASE 8A / 8A.1

New record actions/forms were introduced.

Important ROI audit found:

> ROI still isn't ready because actual cash-flow ingestion is incomplete.

The system now supports explicit winner-status workflow:

```text
NULL
TRUE
FALSE
```

rather than guessing.

Idempotency migration was also added.

There are DB integration tests documented/skipped where no test DB is available.

---

# 44. DASHBOARD CURRENT STATE

Dashboard currently has a foundation rather than a final polished analytics dashboard.

It can show things such as:

* total paid
* total received
* active/completed split
* actual cash flow
* verification alerts
* export

At one stage the user saw:

```text
Total Paid ₹5,95,170
Total Received ₹0
```

This was not necessarily wrong; it reflected actual ledger data and the fact that no verified payouts had been recorded.

The user said:

> "idk what changed here"

We clarified that this was the **financial foundation**, not yet the final "proper dashboard."

The eventual dashboard should become more polished with:

* portfolio overview
* active chit cards
* progress
* actual paid
* actual received
* net actual cash flow
* verification status
* completed chit ROI
* data-quality center
* useful filters/charts later

Do not jump into fancy charts before the financial foundation is reliable.

---

# 45. XLSX EXPORT

Portfolio Excel export was implemented.

Endpoint:

```text
/api/export
```

Authenticated via Supabase auth and RLS.

Sheets:

1. Chit Summary
2. Round History
3. Cash Flow Ledger
4. Data Quality

Critical:

Expected vs actual are clearly separated.

`non_winner_payment` is expected only.

Actual payment must come from:

```text
ledger_entries
```

User tested the portfolio Excel and confirmed it works.

---

# 46. INDIVIDUAL CHIT XLSX

Individual chit export was implemented.

Sheets:

1. Chit Summary
2. Round Statement
3. Cash Flow
4. Data Quality
5. Report Info

User-facing round columns are intended to be:

```text
Round
Type
Thallu
Commission
Dividend / Member Thallu
Installment Due
Actual Paid
Winner
Prize / Payout
```

Financial summary:

```text
Actual Paid
Actual Received
Net Actual Cash Flow
ROI = N/A while active
```

Important:

`non_winner_payment` must NEVER be represented as actual paid.

The user tested the export button and confirmed it works.

---

# 47. PDF STATEMENT

PDF is **not implemented yet**.

The agreed V1 direction was:

### Do NOT add a heavy PDF library yet.

Instead:

* create a dedicated print route/page
* reuse statement data
* use CSS `@media print`
* trigger `window.print()`

This keeps it simple.

---

# 48. USER'S DESIRED INDIVIDUAL CHIT STATEMENT

The user wants something simple and app-like, not a giant accounting report.

Likely structure:

### Header

```text
3L A Group
₹3,00,000
25 Members
25 Months
₹12,000 Monthly
```

### Financial summary

```text
Actual Paid
Actual Received
Net Actual Cash Flow
ROI
```

### Round table

```text
Round
Type
Thallu
Commission
Dividend / Member Thallu
Installment Due
Actual Paid
Winner
Prize / Payout
```

This should be readable on screen and printable.

---

# 49. TESTING HISTORY

Approximate major milestones:

```text
241/241
253/253
273
296
304/304
328
376
447
456
460
```

Latest feature stages reached around **460 tests**.

TypeScript and production builds have repeatedly been checked clean.

Do not assume a test count is unchanged after a new implementation; have Antigravity report the current count.

---

# 50. IMPORTANT MISTAKES / DEAD ENDS TO AVOID

## Mistake 1 — Assuming zero thallu means Thai Chittu

Wrong.

```text
thallu = 0
```

does not automatically mean:

```text
SPECIAL_NO_AUCTION
```

unless the source/context confirms it.

This is exactly why B-R2 remained UNKNOWN.

---

## Mistake 2 — Treating expected payment as actual payment

Wrong:

```text
non_winner_payment → ledger
```

Historical imports deliberately do NOT do this.

---

## Mistake 3 — Treating Sangam as an individual winner

Wrong.

For SPECIAL_NO_AUCTION:

```text
won_by_us = NULL
```

---

## Mistake 4 — Guessing ambiguous winner status

Never convert unknown into FALSE.

Use:

```text
TRUE = explicitly us
FALSE = explicitly someone else
NULL = unknown/not applicable
```

---

## Mistake 5 — Generalizing winner payout formula

Do not globally assume:

```text
face_value - thallu
```

Use `our_payout_amount` as source of truth when actual payout is known.

---

## Mistake 6 — Calling active net cash flow "profit"

Don't.

Active chit:

> Net actual cash flow

Completed verified chit:

> ROI / profit metrics

---

## Mistake 7 — Building ROI before cash flow is complete

The app intentionally blocks ROI when financial completeness isn't verified.

Do not weaken this gate just to make the dashboard look better.

---

## Mistake 8 — Inventing KULUKAL values

Do not assume zero thallu or a minimum bid.

Unknown KULUKAL stays unknown/manual until actual information is available.

---

## Mistake 9 — Deleting production data without exact UUID verification

We now have a proven cleanup workflow:

1. identify exact row
2. verify profile
3. inspect dependencies
4. inspect FK behavior
5. optionally dry-run
6. delete exact UUID inside transaction
7. verify post-delete
8. verify real records remain

Use this workflow for any future production deletion.

---

## Mistake 10 — Asking user for sensitive Supabase credentials

Do not ask for:

* service-role key
* password
* other secrets

Use existing authenticated browser state / safe CLI workflows where appropriate.

---

## Mistake 11 — Accidentally committing production helper files

Remember:

```text
supabase/.temp/
```

must never be committed.

Also check Git status before committing.

---

# 51. USER'S CODING / WORKFLOW PREFERENCES

The user prefers:

### Architecture

* modular
* production-minded
* conservative financial logic
* auditable
* reversible
* no hardcoded business rules
* clear separation between expected and actual data

### Implementation

Prefer:

```text
small phase
→ implementation
→ tests
→ review
→ deploy
→ verify
→ commit
```

rather than huge uncontrolled changes.

### Prompts

User likes prompts that can be:

> copied directly into Antigravity

with clear:

* objective
* constraints
* exact files/components where possible
* acceptance criteria
* testing requirements
* Git requirements
* deployment requirements

### Communication

User prefers conversational:

> "man"

style.

Do not bury the actual next action beneath huge explanations.

For difficult decisions, explain:

* what
* why
* risk
* next step

---

# 52. NAMING / STRUCTURAL PREFERENCES

Existing code uses descriptive names such as:

```text
updateChitAction
confirmFromQueue
classifyAuctionEvent
resetSpecialNoAuctionWinner
computeActiveMetrics
computeCompletedRoi
generateExportWorkbook
```

Prefer descriptive domain-oriented names rather than generic names like:

```text
processData()
handleThing()
doStuff()
```

Financial functions should be explicit about what they calculate.

---

# 53. DATA SAFETY PRINCIPLE

The application is handling real family financial data.

Therefore:

> Preserve raw source data first. Derive structured information second. Never overwrite the original because a formula "looks better."

If source says one thing and formula says another:

```text
preserve source
+
FLAGGED_MISMATCH
```

If ambiguous:

```text
UNKNOWN
```

If user manually decides:

```text
MANUAL_OVERRIDE
```

---

# 54. CURRENT PRODUCTION DATA STATE

After all cleanup:

### Real chits

```text
3L A Group
3L B Group
3L C Group
```

### No test chits remain.

### Completed chits

```text
0
```

### Active chits

```text
3
```

### No fake historical ledger data should be introduced.

---

# 55. CURRENT FUNCTIONALITY THAT IS WORKING

At the current stage:

✅ Authentication / protected routes

✅ Chit creation/configuration

✅ Modular chit settings

✅ Auction event model

✅ WhatsApp/source message preservation

✅ Parsing workflow

✅ Duplicate detection

✅ Review queue

✅ UNKNOWN event workflow

✅ Manual event classification

✅ Thai Chittu/Sangam special handling

✅ Winner confirmation workflow

✅ Cash-flow recording foundations

✅ Append-only ledger

✅ Ledger correction workflow

✅ Financial verification

✅ Verification invalidation triggers

✅ Active financial metrics

✅ Completed ROI engine with safety gates

✅ Portfolio XLSX export

✅ Individual chit XLSX export

✅ Data-quality reporting

✅ Production deployment

✅ Production DB migrations

✅ Test-data cleanup

---

# 56. CURRENTLY INCOMPLETE / NOT READY

### 1. Actual historical cash-flow verification

Historical imported `கட்ட வேண்டிய தொகை` values are not proof of actual payment.

Therefore many financial records remain incomplete.

---

### 2. Actual payout recording

No actual user payout has yet been properly recorded in the current real data.

Therefore:

```text
Total Received = ₹0
```

can be correct.

---

### 3. Completed ROI

No real chit is currently completed and fully verified.

Therefore:

```text
ROI = unavailable
```

is expected.

---

### 4. KULUKAL

Rules still need real confirmed data.

---

### 5. Full polished dashboard

Foundation exists, but the final dashboard experience is not finished.

---

### 6. PDF statement

Not implemented yet.

Preferred approach:

```text
print route + @media print + window.print()
```

---

### 7. Portfolio-level ROI

Deferred until underlying individual chit data is trustworthy.

---

### 8. XIRR

Deferred.

---

### 9. AI narration

Later only.

AI should consume validated numbers and explain them.

AI must not become the source of truth.

---

# 57. MOST IMPORTANT CURRENT PRODUCT GAP

The biggest remaining financial gap is:

> **How do we safely turn real-world payments/payouts into verified actual cash-flow records?**

The current architecture supports recording them, but the historical WhatsApp data does not prove that a payment actually occurred.

Therefore the next financial work should focus on **actual cash-flow capture/review**, not forcing ROI.

---

# 58. WHAT WE WERE DOING IMMEDIATELY BEFORE THIS HANDOFF

The immediate task was cleaning production test data.

We had discovered:

```text
Test 3L Chit
```

still existed after the earlier E2E test cleanup.

The user explicitly confirmed:

> delete it

Antigravity audited it and then deleted it from production.

Final verification:

```text
Test 3L Chit = gone
```

and the three real chits remained intact.

So **the cleanup task is now finished.**

There is no Git commit/push associated with this cleanup because it was a direct production database operation.

---

# 59. EXACT NEXT STEP AFTER THIS CHAT

The immediate next thing should be:

### 1. Refresh the Vercel app/dashboard.

Verify that:

```text
Active chits = 3
Completed chits = 0
```

and that the three real chits are:

```text
3L A Group
3L B Group
3L C Group
```

There should be no:

```text
Test 3L Chit
```

---

### 2. Do NOT modify anything just because the dashboard looks basic.

We already know the dashboard is currently a foundation.

After confirming the cleanup, the next product-level discussion should be:

> **What should the proper dashboard look like now that the test data is gone?**

Likely next implementation area:

**Dashboard V1 polish / portfolio overview**, while preserving all financial safety rules.

---

# 60. RECOMMENDED NEXT DEVELOPMENT ORDER

After verifying the clean dashboard:

### Phase A — Proper dashboard

Build a useful portfolio dashboard:

```text
Portfolio Overview
    ↓
Active Chits
    ↓
Per-chit progress
    ↓
Actual Paid
Actual Received
Net Actual Cash Flow
Verification
Data Quality
```

Then:

### Phase B — Better individual chit statement

Improve the on-screen individual chit page to match the XLSX structure:

```text
Round
Type
Thallu
Commission
Dividend / Member Thallu
Installment Due
Actual Paid
Winner
Prize / Payout
```

Then:

### Phase C — Print/PDF

Implement simple print-friendly statement.

Then:

### Phase D — Real cash-flow workflow

Make it very easy to record:

```text
I actually paid ₹X
I actually received ₹Y
```

with auditability and idempotency.

Then:

### Phase E — Complete/verify chit

Only after actual cash flows are complete.

Then:

### Phase F — ROI

Enable completed ROI.

Then later:

```text
XIRR
Portfolio ROI
charts
AI narration
automation
n8n
```

Only when justified.

---

# 61. GOLDEN RULE FOR THIS PROJECT

The project should prioritize:

> **Correct financial data > fancy UI > AI features**

The application should never look financially smarter than the underlying data actually supports.

If the system doesn't know:

```text
UNKNOWN
```

If the source conflicts with the formula:

```text
FLAGGED_MISMATCH
```

If the user explicitly corrects it:

```text
MANUAL_OVERRIDE
```

If actual payment isn't proven:

```text
EXPECTED ≠ ACTUAL
```

If ROI isn't verified:

```text
ROI = N/A
```

That philosophy should remain intact throughout the project.

---

# 62. SHORT CURRENT STATUS

If you need the entire project state in one snapshot:

```text
PROJECT:
CHIT FUND personal/family financial tracker

STACK:
Next.js + TypeScript + Supabase + PostgreSQL + Supabase Auth + RLS + Vercel + GitHub
XLSX via SheetJS
Playwright for E2E where possible
Antigravity as implementation agent
Claude/Gemini models through Antigravity

CURRENT REAL DATA:
3 real active chits
3L A Group
3L B Group
3L C Group

TEST DATA:
All known test chits deleted

WORKING:
Auth
Chit config
Auction events
WhatsApp/source messages
Parser
Review queue
UNKNOWN classification
Thai/Sangam handling
Winner workflow
Ledger
Corrections
Verification
ROI safety engine
XLSX exports
Data quality
Production deployment

NOT FINISHED:
Real verified cash-flow capture
Completed ROI
KULUKAL rules
Polished dashboard
PDF/print statement
Portfolio ROI
XIRR
AI narration
automation/n8n

CURRENT NEXT ACTION:
Refresh dashboard → verify only 3 real chits → design/build proper dashboard next.
```

---

**One final instruction for the new chat:** don't make me repeat this context. Treat this handoff as the project's working memory, and when I ask for the next implementation step, first use the current state above and continue from there rather than restarting the project.

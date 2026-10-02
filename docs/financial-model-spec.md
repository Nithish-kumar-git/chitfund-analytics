# Chit Fund Analytics — Financial Model Specification

> Phase 6F · Financial model specification
> Last updated: 2026-10-02
> Status: **SPECIFICATION ONLY — no implementation in this document**

---

## 1. Purpose

This document defines the authoritative financial model for the Chit Fund Analytics
application. It establishes:

- The confirmed domain rules for every event type.
- The exact formulas that MUST be used in the ROI engine.
- Which calculations are **safe** (backed by confirmed real-world data).
- Which calculations are **unsafe** (speculation, unknowns, unverified rules).
- How corrections feed into effective cash-flow aggregation.

All future implementation of financial calculations MUST conform to this specification.
Any divergence requires explicit approval and a corresponding update to this document.

---

## 2. Confirmed Domain Rules

### 2.1 Chit Structure

| Parameter          | Confirmed Value (Reference Chit)                  |
|--------------------|---------------------------------------------------|
| Face value         | Rs.3,00,000                                       |
| Total slots        | 25                                                |
| Actual members     | 24                                                |
| Sangam slot        | 1 (counted as one of the 25 slots)               |
| Duration           | 25 months                                         |
| Base installment   | Rs.12,000                                         |

**Rules confirmed:**

1. Every actual member receives exactly **one payout/turn** across the entire chit
   duration. No member may win more than once.
2. The Sangam occupies **one** of the 25 slots. Its slot counts as its one turn.
3. Every participant — including the Sangam and the current round's winner —
   **continues paying their monthly installment** for the full duration of the chit,
   including all months after they receive their payout.
4. The winner's future monthly payment is calculated using the **same normal monthly
   payment formula** as all other non-winning members. There is no special reduced
   payment for winners.
5. No late fee, processing fee, or other extra charges are currently modeled.

### 2.2 Commission

Commission is **configurable per chit** and is NOT hardcoded at 2.5%.

The schema supports two commission modes:

| commission_type   | commission_value semantics                          |
|--------------------|-----------------------------------------------------|
| PERCENTAGE        | Percentage of face value (e.g., 2.5 = 2.5%)        |
| FLAT_AMOUNT       | Fixed rupee amount per round (e.g., 7500 = Rs.7,500)|

For the reference chit: Rs.3,00,000 x 2.5% = **Rs.7,500 flat commission per round**.

### 2.3 Slot / Round Numbering

- `round_number` is **1-indexed** (Month 1, Month 2, ... Month 25).
- The field is always referred to as `round_number`, never "chit number".
- Month 2 is **Thai Chittu** (Sangam's round) in this chit.
- Month 25 is the **Final round** (last remaining member).

---

## 3. Event Types and Their Meaning

| event_type            | Description                                                         |
|-----------------------|---------------------------------------------------------------------|
| NORMAL                | Standard competitive auction. Thallu set by bidding.               |
| SPECIAL_NO_AUCTION    | No auction held. Sangam receives the payout. (Thai Chittu)         |
| FINAL                 | Last round. Remaining member receives payout without auction.       |
| UNKNOWN               | Event type not yet determined from source data.                     |

> **CRITICAL:** Only NORMAL events use the standard auction formula.
> SPECIAL_NO_AUCTION and FINAL use the no-auction payout formula (Sections 5 and 6).
> SPECIAL_NO_AUCTION must NOT be stored as NORMAL with thallu = 0.
> FINAL must NOT be stored as NORMAL with thallu = 0.

---

## 4. Normal Auction Formulas

Applies ONLY to event_type = 'NORMAL'.

### 4.1 Definitions

| Symbol              | Formula / Source                            | Example      |
|---------------------|---------------------------------------------|--------------|
| face_value          | Chit scheme parameter                       | Rs.3,00,000  |
| thallu              | Raw thallu bid amount from auction          | Rs.56,000    |
| commission          | Calculated from chit commission config      | Rs.7,500     |
| member_count        | Total number of slots (including Sangam)    | 25           |
| base_installment    | Fixed monthly installment per member        | Rs.12,000    |

### 4.2 Formulas

    net_thallu           = thallu - commission
    member_thallu        = net_thallu / member_count
    non_winner_payment   = base_installment - member_thallu
    winner_payment       = non_winner_payment   (same formula, no reduction)
    winner_payout        = face_value - thallu

> **SCOPE NOTE — winner_payout:** The formula `winner_payout = face_value - thallu`
> is **confirmed for the Rs.3L reference chit** based on real WhatsApp data
> (Rs.3,00,000 - Rs.56,000 = Rs.2,44,000). It must NOT be generalised to every
> chit configuration until independently verified for that chit. Other chit
> structures may have different winner settlement mechanics. Use the recorded
> `auction_events.our_payout_amount` as the source of truth for actual payouts;
> never recompute a winner payout from this formula unless the chit's rules have
> been explicitly confirmed.

### 4.3 Reference Calculation (Rs.3L chit)

    net_thallu           = Rs.56,000 - Rs.7,500  = Rs.48,500
    member_thallu        = Rs.48,500 / 25         = Rs.1,940
    non_winner_payment   = Rs.12,000 - Rs.1,940  = Rs.10,060
    winner_payment       = Rs.10,060              (identical - winner gets no reduction)
    winner_payout        = Rs.3,00,000 - Rs.56,000 = Rs.2,44,000

### 4.4 Database Columns (auction_events)

| Column               | Value in reference example  |
|----------------------|-----------------------------|
| thallu               | 56000.00                    |
| commission           | 7500.00                     |
| net_thallu           | 48500.00                    |
| member_thallu        | 1940.00                     |
| non_winner_payment   | 10060.00                    |
| won_by_us            | true/false                  |
| our_payout_amount    | 244000.00 (if we won)       |

---

## 5. Thai Chittu (SPECIAL_NO_AUCTION) Calculation

Applies ONLY to event_type = 'SPECIAL_NO_AUCTION'.

### 5.1 Rules

- Month 2 (in this chit) is Thai Chittu.
- No auction takes place; there is no thallu.
- The **Sangam** receives the payout for this round.
- This round counts as the Sangam's one payout/turn.
- All members, including the Sangam, still pay their normal monthly installment.
- There is no thallu discount to the member installment in this month.

### 5.2 Formula

    no_auction_payout = face_value - commission
    member_payment    = base_installment   (full amount, no thallu reduction)

### 5.3 Reference Calculation

    no_auction_payout = Rs.3,00,000 - Rs.7,500 = Rs.2,92,500  (received by Sangam)
    member_payment    = Rs.12,000               (full installment, no reduction)

### 5.4 Database Notes

The thallu, net_thallu, and member_thallu columns must be NULL for SPECIAL_NO_AUCTION
events. non_winner_payment must reflect the full base_installment (no reduction).

---

## 6. Final Month Calculation

Applies ONLY to event_type = 'FINAL'.

### 6.1 Rules

- The last remaining member (who has not yet received a payout) receives the final payout.
- No auction is held. There is no thallu.
- The final recipient still pays the monthly installment this month.
- There is no thallu discount to any member's installment in the final month.

### 6.2 Formula

    final_payout    = face_value - commission
    member_payment  = base_installment   (full amount, no thallu reduction)

### 6.3 Reference Calculation

    final_payout    = Rs.3,00,000 - Rs.7,500 = Rs.2,92,500
    member_payment  = Rs.12,000

---

## 7. KULUKAL Treatment

### 7.1 What KULUKAL Is

KULUKAL is a specific situation — NOT a recurring event type for every auction.
It occurs when nobody bids in the normal auction process. It is an exception
path, not the standard path.

### 7.2 Confirmed Rules

- When KULUKAL occurs, a person is selected to receive that month's payout.
- The selected person continues paying normal monthly installments afterward.
- The chit continues normally after a KULUKAL month.
- KULUKAL may be used in future chits.
- The selected person does NOT win the chit again.

### 7.3 Critical Unknowns (do NOT assume)

The following are explicitly unresolved and must not be invented:

1. **The exact thallu amount in a KULUKAL round.** Expected to be some moderate or
   minimum thallu — NOT automatically zero. The actual thallu MUST be recorded
   when the KULUKAL event occurs.
2. **Whether KULUKAL has any special commission treatment** beyond normal commission.
3. **The exact selection rule** for who receives the payout in a KULUKAL round.

### 7.4 Representation in the Database

- If all financial fields are known and the standard formula applies with the actual
  recorded thallu: store as event_type = 'NORMAL'.
- If the thallu or selection rule is unknown: store as event_type = 'UNKNOWN' with
  calculation_status = 'MANUAL_OVERRIDE' and populate fields as they become known.

**NEVER** default a KULUKAL thallu to zero.
**NEVER** treat KULUKAL as SPECIAL_NO_AUCTION.

---

## 8. Ledger / Cash-Flow Mapping

### 8.1 Entry Types and Direction

| entry_type              | Direction  | When to use                                              |
|-------------------------|------------|----------------------------------------------------------|
| INSTALLMENT_PAID        | Outflow    | Monthly payment made by us to the chit                  |
| AUCTION_PAYOUT_RECEIVED | Inflow     | Auction/no-auction payout received by us                 |
| ADJUSTMENT              | Either     | Explicit manual adjustment; sign determines direction    |
| LATE_FEE                | Outflow    | Late fee charged to us                                   |
| MATURITY_SETTLEMENT     | Inflow     | Settlement received at chit maturity/completion          |
| MANUAL_CORRECTION       | Either     | Correction of a previous entry; see Section 9            |

### 8.2 Sign Convention (Schema-documented)

    Negative = outflow (we paid out)
    Positive = inflow  (we received)

> **Historical note:** Existing INSTALLMENT_PAID entries were recorded as positive
> amounts by the ingestion parser (absolute value without sign). This has NOT been
> corrected to preserve append-only integrity. The application uses entry_type as
> the direction indicator and applies Math.abs() when summing outflows.

### 8.3 Per-Round Ledger Mapping

| Situation                           | Our ledger entry                                |
|-------------------------------------|-------------------------------------------------|
| Normal round, we did not win        | INSTALLMENT_PAID for non_winner_payment         |
| Normal round, we won                | INSTALLMENT_PAID + AUCTION_PAYOUT_RECEIVED      |
| Thai Chittu, Sangam received payout | INSTALLMENT_PAID for full base_installment      |
| Thai Chittu, we ARE the Sangam      | INSTALLMENT_PAID + AUCTION_PAYOUT_RECEIVED      |
| Final round, we are last member     | INSTALLMENT_PAID + AUCTION_PAYOUT_RECEIVED      |
| Final round, another member wins    | INSTALLMENT_PAID for full base_installment      |

---

## 9. Correction Handling

### 9.1 Append-Only Principle

Historical ledger entries MUST NOT be updated or deleted. RLS enforces this
(no UPDATE or DELETE policy on ledger_entries).

### 9.2 Correction Pattern

To correct a confirmed entry:

1. Insert a new ledger_entries row with:
   - entry_type = 'MANUAL_CORRECTION'
   - corrects_entry_id = <original entry's id>
   - amount = <corrected amount>
   - transaction_date = <same date as original>
   - auction_event_id = <same as original>
2. Do NOT modify or delete the original row.

### 9.3 Constraints

- A MANUAL_CORRECTION entry itself cannot be corrected.
- An entry that has already been corrected cannot be corrected again (one correction
  per original entry).
- corrects_entry_id uses ON DELETE RESTRICT.

### 9.4 Effective Metrics Computation

1. Build the superseded set: collect corrects_entry_id from every MANUAL_CORRECTION.
2. Exclude all superseded entries from aggregations.
3. For each MANUAL_CORRECTION entry, look up the original's entry_type and treat
   the correction as having that effective type for metric categorisation.

### 9.5 Worked Correction Example

Scenario: INSTALLMENT_PAID for Rs.10,060 was incorrect; actual was Rs.10,000.

Before correction:
  id=A  INSTALLMENT_PAID  10060  corrects_entry_id=NULL  superseded=false

After inserting correction:
  id=A  INSTALLMENT_PAID  10060  corrects_entry_id=NULL  superseded=TRUE
  id=B  MANUAL_CORRECTION 10000  corrects_entry_id=A     superseded=false

Effective computation:
- Superseded set = {A}
- Entry A: excluded
- Entry B: effective_type = INSTALLMENT_PAID (inherited from A)
- totalInstallmentAmount includes Rs.10,000 NOT Rs.10,060 NOT Rs.20,060 NOT Rs.0

---

## 10. Ongoing ROI to Date (Active Chit)

### 10.1 Safe Metrics for Active Chit

| Metric                     | Definition                                                 | Safe |
|----------------------------|------------------------------------------------------------|------|
| Total installments paid    | Sum of effective INSTALLMENT_PAID amounts (absolute)       | YES  |
| Installment count          | Count of effective INSTALLMENT_PAID entries                | YES  |
| Total payouts received     | Sum of effective AUCTION_PAYOUT_RECEIVED amounts           | YES  |
| Effective transaction count| Count of all non-superseded entries                        | YES  |
| Net cash flow to date      | Total received minus Total paid (actual only)              | YES  |

### 10.2 Forbidden for Active Chit

| Forbidden Calculation          | Reason                                                          |
|--------------------------------|-----------------------------------------------------------------|
| Projected total paid           | Future thallu unknown                                           |
| Projected ROI at completion    | Future payouts unknown                                          |
| Expected future payout         | Winner unknown; thallu unknown                                  |
| Assumed KULUKAL amount         | KULUKAL thallu unknown until it occurs                          |
| Profit/loss estimate           | Incomplete cash flow                                            |
| XIRR on active chit            | Future dated cash flows undefined                               |

Only actual recorded events may enter realised ROI.

---

## 11. Completed Chit ROI

### 11.0 Prerequisites — When Final ROI May Be Displayed

Final ROI MUST NOT be displayed unless ALL four conditions are met:

1. **`chit.status = 'COMPLETED'`** — The chit must be formally marked as completed.
   Active, Exited, or Archived chits must not show final ROI.
2. **All expected rounds are recorded** — The number of `auction_events` rows must
   equal `chits.duration_months`. Any missing round makes the total-paid calculation
   incomplete and the ROI result incorrect.
3. **All relevant actual cash-flow entries are recorded and reviewed** — Every round
   where we paid an installment or received a payout must have a corresponding
   `ledger_entries` row. Gaps in the ledger produce a silently wrong ROI.
4. **Outstanding corrections and data-quality issues are resolved** — No ledger
   entries should remain in a flagged or unreviewed state (`calculation_status =
   'FLAGGED_MISMATCH'`). All known incorrect entries must have their
   `MANUAL_CORRECTION` counterpart applied before computing final ROI.

If any condition is unmet, surface a warning to the user rather than displaying
a potentially incorrect ROI figure.

### 11.1 Formulas

    total_actual_paid     = SUM of effective INSTALLMENT_PAID amounts (absolute)
    total_actual_received = SUM of effective AUCTION_PAYOUT_RECEIVED amounts
                          + SUM of effective MATURITY_SETTLEMENT amounts
    net_gain_loss         = total_actual_received - total_actual_paid
    simple_roi_pct        = (net_gain_loss / total_actual_paid) x 100

### 11.2 Notes

- Only effective (non-superseded) entries are summed.
- ADJUSTMENT entries: included based on sign (negative=outflow, positive=inflow).
- LATE_FEE entries count as outflows (added to total_actual_paid).

---

## 12. Future XIRR Design

### 12.1 Current Schema Readiness

No schema changes are required for XIRR:
- ledger_entries.transaction_date (DATE) provides the date of each cash flow.
- ledger_entries.amount provides the magnitude.
- entry_type determines direction.

### 12.2 XIRR Input Convention

- Outflows (payments by us): negative values
- Inflows (receipts by us): positive values

Apply entry_type-based direction (not raw amount sign) when preparing XIRR inputs.

### 12.3 Do Not Implement XIRR Until

1. The chit is fully closed (status = 'COMPLETED').
2. All rounds are recorded in ledger_entries.
3. All entries have been reviewed for corrections.
4. A verified XIRR solver is available.

---

## 13. Unknowns / Unsafe Assumptions

Explicitly undetermined as of this specification. Do NOT invent answers.

| # | Unknown                                    | Impact                                                |
|---|--------------------------------------------|-------------------------------------------------------|
| 1 | KULUKAL thallu selection rule              | Cannot compute KULUKAL member_thallu                  |
| 2 | KULUKAL commission treatment               | May differ from normal auction handling               |
| 3 | Winner payout always face_value - thallu   | Confirmed only for Rs.3L reference chit               |
| 4 | MATURITY_SETTLEMENT commission deduction   | Settlement mechanics unseen in raw data               |
| 5 | LATE_FEE additive vs included in payment   | No late fee events observed yet                       |
| 6 | ADJUSTMENT vs MANUAL_CORRECTION semantics  | Exact distinction not fully defined                   |
| 7 | Winner installment post-win (raw data)     | Confirmed in principle but not observed in raw data   |
| 8 | Sangam installment across multiple rounds  | Not observed across multiple real WhatsApp rounds     |
| 9 | Portfolio-level ROI (multi-chit)           | Cross-chit aggregation not designed                   |

---

## 14. Worked Rs.3L Example

### Parameters

| Parameter          | Value         |
|--------------------|---------------|
| Face value         | Rs.3,00,000   |
| Slots              | 25            |
| Members            | 24 + 1 Sangam |
| Duration           | 25 months     |
| Base installment   | Rs.12,000     |
| Commission         | Rs.7,500 flat |

### Month 1 — Normal Auction (another member wins)

    thallu            = Rs.56,000
    commission        = Rs.7,500
    net_thallu        = Rs.48,500
    member_thallu     = Rs.1,940
    our_payment       = Rs.10,060
    winner_payout     = Rs.2,44,000  (received by another member, not us)

Our ledger: INSTALLMENT_PAID  10060

### Month 2 — Thai Chittu (SPECIAL_NO_AUCTION, Sangam wins)

    no_auction_payout = Rs.2,92,500  (received by Sangam, not us)
    our_payment       = Rs.12,000    (full installment, no thallu reduction)

Our ledger: INSTALLMENT_PAID  12000

### Month N — Normal Auction (we win, same thallu for illustration)

    thallu         = Rs.56,000
    winner_payout  = Rs.2,44,000  (received by US)
    our_payment    = Rs.10,060    (same formula, no reduction for winner)

Our ledger:
  INSTALLMENT_PAID        10060
  AUCTION_PAYOUT_RECEIVED 244000

### Month 25 — Final Round (we are the last member)

    final_payout  = Rs.2,92,500  (received by US)
    our_payment   = Rs.12,000    (full installment)

Our ledger:
  INSTALLMENT_PAID        12000
  AUCTION_PAYOUT_RECEIVED 292500

---

## 15. Calculations That MUST NOT Be Performed

| Forbidden Calculation                            | Reason                                            |
|--------------------------------------------------|---------------------------------------------------|
| ROI projection for active chit                   | Future thallu unknown; future payouts unknown     |
| Assumed total installments from months remaining | Remaining thallu bids unknown                    |
| Net gain/loss before chit is COMPLETED           | Incomplete cash flow series                       |
| KULUKAL payout using assumed thallu = 0          | KULUKAL thallu is an observed value, never assumed|
| XIRR on active chit                              | Future dated cash flows undefined                 |
| Expected payout based on remaining members       | Winner identity unknown                           |
| Annualised return during active phase            | Requires full cash flow timeline                  |
| "If current trend continues" extrapolation       | Depends on unknown future                         |
| Profit from SPECIAL_NO_AUCTION (unless Sangam)   | Sangam receives payout, not our family            |

---

## Appendix A: Schema Field Support Matrix (Phase 6E)

| Required Field                    | Table / Column                                     | Present        |
|-----------------------------------|----------------------------------------------------|----------------|
| Face value                        | chits.face_value                                   | YES            |
| Base installment                  | chits.base_installment                             | YES            |
| Member count (slots)              | chits.member_count                                 | YES            |
| Commission (configurable)         | chits.commission_type + chits.commission_value     | YES            |
| Chit duration                     | chits.duration_months                              | YES            |
| Chit status                       | chits.status                                       | YES            |
| Round number                      | auction_events.round_number                        | YES            |
| Event type enum                   | auction_events.event_type                          | YES            |
| Thallu                            | auction_events.thallu                              | YES            |
| Commission per round              | auction_events.commission                          | YES            |
| Net thallu                        | auction_events.net_thallu                          | YES            |
| Member thallu                     | auction_events.member_thallu                       | YES            |
| Non-winner payment                | auction_events.non_winner_payment                  | YES            |
| Did we win?                       | auction_events.won_by_us                           | YES            |
| Our payout amount                 | auction_events.our_payout_amount                   | YES (nullable) |
| Auction date                      | auction_events.auction_date                        | YES            |
| Ledger entry type                 | ledger_entries.entry_type                          | YES            |
| Ledger amount                     | ledger_entries.amount                              | YES            |
| Transaction date                  | ledger_entries.transaction_date                    | YES            |
| Correction linkage                | ledger_entries.corrects_entry_id                   | YES            |
| Auction linkage                   | ledger_entries.auction_event_id                    | YES            |

### Missing / Deferred Fields

| Missing Capability                 | Impact                                                   |
|------------------------------------|----------------------------------------------------------|
| KULUKAL event flag                 | No explicit KULUKAL marker; use NORMAL or UNKNOWN        |
| Sangam slot identification         | No column to identify which round is the Sangam slot     |
| Winner member identity             | No winner_member_id; only won_by_us (boolean)            |
| Verified XIRR solver               | No computation engine yet                                |
| Portfolio-level aggregation        | Cross-chit ROI not designed                              |

---

*End of Financial Model Specification — Phase 6F*

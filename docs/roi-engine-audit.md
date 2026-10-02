# Phase 7B: ROI Engine Audit

## 1. Cash OUTflows
**Which existing ledger entries can safely represent actual cash OUTflows?**
- `INSTALLMENT_PAID` (Absolute value represents outflow).
- `LATE_FEE` (Absolute value represents outflow).
- `ADJUSTMENT` (If negative).

## 2. Cash INflows
**Which existing ledger entries can safely represent actual cash INflows?**
- `AUCTION_PAYOUT_RECEIVED`
- `MATURITY_SETTLEMENT`
- `ADJUSTMENT` (If positive).

## 3. Ingestion Completeness
**Whether current ingestion creates the correct ledger entry for:**
- **Normal non-winner round:** Yes (creates `INSTALLMENT_PAID`).
- **Normal winner round:** **NO.** The current parser does not detect our winnings, does not set `won_by_us`, and does not create `AUCTION_PAYOUT_RECEIVED`.
- **SPECIAL_NO_AUCTION / Thai Chittu:** **NO.** Parser lacks logic for Sangam rounds and no-auction rounds.
- **FINAL round:** **NO.**

## 4. Distinguishing Payouts Without Inventing Identity
**Whether the current system can distinguish our payout, another's payout, and Sangam payout:**
Yes. The schema supports this natively via `auction_events.won_by_us` (boolean) and the presence of an `AUCTION_PAYOUT_RECEIVED` ledger entry, without needing to track foreign member IDs.

## 5. Phase 6E Correction Handling
**Verify Phase 6E correction handling:**
- **Superseded original excluded:** Verified (handled in `page.tsx` via `correctedIds` Set).
- **Correction becomes effective transaction:** Verified (effective type is inherited).
- **No double counting:** Verified (superseded rows are excluded from sums).

## 6. Net Cash Flow to Date Safety
**Determine whether "Net Cash Flow to Date" from actual recorded ledger entries is safe:**
The *schema and math* are safe, but the *data* is not guaranteed to be complete because the ingestion engine currently fails to record inflows (`AUCTION_PAYOUT_RECEIVED`). Showing Net Cash Flow right now would likely show a massive false negative (only installments, no payouts).

## 7. Displayable for ACTIVE Chit
- Total installments paid
- Installment count
- Total payouts received (if manually entered)
- Effective transaction count
- Net cash flow to date (assuming inflows are correctly recorded)

## 8. Displayable for COMPLETED Chit
Everything in Active, plus:
- Final Simple ROI (%)
- Total Net Gain/Loss
*(Only if all prerequisites are met).*

## 9. Final ROI Prerequisites Support
**Check whether the existing data/model supports the four Final ROI prerequisites:**
- `status = COMPLETED`: Supported by `chits.status`.
- All expected rounds recorded: Supported by comparing `auction_events` count to `chits.duration_months`.
- Relevant actual cash flows recorded/reviewed: Supported by checking `ledger_entries` existence.
- No unresolved corrections/data-quality issues: Supported via `calculation_status` and superseded checks.

## 10. Required Schema/Data-Model Changes
**Identify any schema or data-model changes genuinely required:**
**NONE.** The schema is fully ready.
**Code changes required:** The WhatsApp parser/ingestion pipeline MUST be upgraded to detect winner rounds, `SPECIAL_NO_AUCTION`, and `FINAL` events, and must generate the corresponding `AUCTION_PAYOUT_RECEIVED` ledger entries.

## 11. MUST NOT Be Implemented
**Explicitly identify anything that MUST NOT be implemented:**
- Projected future ROI for active chits.
- Extrapolating `face_value - thallu` for winner payouts on unknown chit structures.
- Assuming `thallu = 0` for KULUKAL.
- XIRR for active chits.

---

## RECOMMENDATION: NOT READY

**Reason:** While the schema, data model, and correction mechanisms are **READY** and robust, the ingestion pipeline is **NOT READY**. The parser cannot currently ingest inflows (`AUCTION_PAYOUT_RECEIVED`), `SPECIAL_NO_AUCTION`, or `FINAL` rounds. Implementing ROI display now would result in severely inaccurate numbers because winning payouts would be missing from the ledger. 

**Minimum Required Changes Before ROI Engine:**
1. Upgrade the WhatsApp ingestion parser to handle winner rounds and create `AUCTION_PAYOUT_RECEIVED` entries.
2. Upgrade the parser to handle `SPECIAL_NO_AUCTION` (Thai Chittu) and `FINAL` rounds.

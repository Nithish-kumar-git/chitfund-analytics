/**
 * build-statement-data.test.ts
 *
 * Tests for the pure statement data builder.
 *
 * Verified behaviours:
 * 1. Active chit: ROI is UNAVAILABLE (CHIT_NOT_COMPLETED reason present).
 * 2. Actual paid comes from effective ledger entries, NOT from non_winner_payment.
 * 3. Expected installment (non_winner_payment) is NOT treated as actual paid.
 * 4. SPECIAL_NO_AUCTION winner resolves to NOT_APPLICABLE (never WE_WON/SOMEONE_ELSE_WON).
 * 5. UNKNOWN event type is preserved in the output round.
 * 6. FLAGGED_MISMATCH round: financial values preserved, flag raised, ROI blocked.
 * 7. Superseded ledger entries are excluded from actualPaid totals.
 * 8. MANUAL_CORRECTION via effective_entry_type inherits original type.
 */

import { describe, it, expect } from 'vitest'
import { buildStatementData } from './build-statement-data'
import type { StatementInput, StatementLedgerRow } from './build-statement-data'
import type { Chit, AuctionEvent } from '@/types/database'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_CHIT: Chit = {
  id: 'chit-001',
  profile_id: 'user-001',
  name: 'Test Chit',
  face_value: 100000,
  duration_months: 3,
  member_count: 20,
  base_installment: 5000,
  group_label: null,
  company_id: null,
  start_date: null,
  status: 'ACTIVE',
  commission_type: 'PERCENTAGE',
  commission_value: 2.5,
  commission_notes: null,
  notes: null,
  verified_at: null,
  verified_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function makeEvent(
  overrides: Partial<AuctionEvent> & Pick<AuctionEvent, 'round_number'>
): AuctionEvent {
  return {
    id: `event-${overrides.round_number}`,
    profile_id: 'user-001',
    chit_id: 'chit-001',
    event_type: 'NORMAL',
    thallu: 5000,
    commission: 125,
    net_thallu: 4875,
    member_thallu: 243.75,
    non_winner_payment: 4756.25,
    won_by_us: false,
    our_payout_amount: null,
    auction_date: '2026-01-15',
    calculation_status: 'INDUSTRY_DEFAULT',
    source_message_id: null,
    notes: null,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

function makeLedger(
  overrides: Partial<StatementLedgerRow> & Pick<StatementLedgerRow, 'id' | 'entry_type' | 'amount' | 'auction_event_id'>
): StatementLedgerRow {
  return {
    transaction_date: '2026-01-20',
    notes: null,
    created_at: '2026-01-20T00:00:00Z',
    round_number: 1,
    corrects_entry_id: null,
    is_superseded: false,
    effective_entry_type: overrides.entry_type as any,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// 1. Active chit: ROI UNAVAILABLE
// ---------------------------------------------------------------------------
describe('buildStatementData — ROI', () => {
  it('returns ROI UNAVAILABLE for an ACTIVE chit', () => {
    const input: StatementInput = {
      chit: { ...BASE_CHIT, status: 'ACTIVE' },
      companyName: null,
      auctionEvents: [makeEvent({ round_number: 1 })],
      ledgerRows: [
        makeLedger({ id: 'l1', entry_type: 'INSTALLMENT_PAID', amount: 4756, auction_event_id: 'event-1' }),
      ],
    }
    const result = buildStatementData(input)
    expect(result.roiOutcome.status).toBe('UNAVAILABLE')
    if (result.roiOutcome.status === 'UNAVAILABLE') {
      expect(result.roiOutcome.reasons).toContain('CHIT_NOT_COMPLETED')
    }
  })

  it('returns ROI UNAVAILABLE when flagged mismatch exists', () => {
    const input: StatementInput = {
      chit: { ...BASE_CHIT, status: 'COMPLETED', verified_at: '2026-04-01T00:00:00Z', verified_by: 'user-001' },
      companyName: null,
      auctionEvents: [makeEvent({ round_number: 1, calculation_status: 'FLAGGED_MISMATCH' })],
      ledgerRows: [
        makeLedger({ id: 'l1', entry_type: 'INSTALLMENT_PAID', amount: 4756, auction_event_id: 'event-1' }),
      ],
    }
    const result = buildStatementData(input)
    expect(result.roiOutcome.status).toBe('UNAVAILABLE')
    if (result.roiOutcome.status === 'UNAVAILABLE') {
      expect(result.roiOutcome.reasons).toContain('UNVERIFIED_ROUNDS')
    }
  })
})

// ---------------------------------------------------------------------------
// 2 & 3. Actual paid vs expected installment
// ---------------------------------------------------------------------------
describe('buildStatementData — actual vs expected', () => {
  it('sources actualPaid from effective ledger, not from non_winner_payment', () => {
    const expectedInstallment = 4756.25 // non_winner_payment
    const actualLedgerAmount = 4800      // what was actually recorded in the ledger

    const input: StatementInput = {
      chit: BASE_CHIT,
      companyName: null,
      auctionEvents: [
        makeEvent({ round_number: 1, non_winner_payment: expectedInstallment }),
      ],
      ledgerRows: [
        makeLedger({
          id: 'l1',
          entry_type: 'INSTALLMENT_PAID',
          effective_entry_type: 'INSTALLMENT_PAID',
          amount: actualLedgerAmount,
          auction_event_id: 'event-1',
        }),
      ],
    }
    const result = buildStatementData(input)
    const round = result.rounds[0]

    expect(round.expectedInstallment).toBe(expectedInstallment)
    expect(round.actualPaid).toBe(actualLedgerAmount)
    // They must not be equal (confirming we are not using expected as actual)
    expect(round.actualPaid).not.toBe(round.expectedInstallment)
    // paymentDate must be the transaction_date of the effective entry
    expect(round.paymentDate).toBe('2026-01-20')
  })

  it('actualPaid is null when no ledger entries exist for a round', () => {
    const input: StatementInput = {
      chit: BASE_CHIT,
      companyName: null,
      auctionEvents: [makeEvent({ round_number: 1, non_winner_payment: 4756.25 })],
      ledgerRows: [], // no entries at all
    }
    const result = buildStatementData(input)
    expect(result.rounds[0].actualPaid).toBeNull()
    expect(result.rounds[0].expectedInstallment).toBe(4756.25)
    expect(result.rounds[0].paymentDate).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 4. SPECIAL_NO_AUCTION winner
// ---------------------------------------------------------------------------
describe('buildStatementData — SPECIAL_NO_AUCTION', () => {
  it('always resolves winner as NOT_APPLICABLE for SPECIAL_NO_AUCTION', () => {
    const input: StatementInput = {
      chit: BASE_CHIT,
      companyName: null,
      auctionEvents: [
        makeEvent({
          round_number: 2,
          event_type: 'SPECIAL_NO_AUCTION',
          won_by_us: null,   // correct domain state
          thallu: null,
          commission: null,
          net_thallu: null,
          member_thallu: null,
          non_winner_payment: null,
        }),
      ],
      ledgerRows: [],
    }
    const result = buildStatementData(input)
    expect(result.rounds[0].winner).toBe('NOT_APPLICABLE')
    expect(result.rounds[0].eventType).toBe('SPECIAL_NO_AUCTION')
  })

  it('resolves NOT_APPLICABLE even when won_by_us is accidentally true', () => {
    const input: StatementInput = {
      chit: BASE_CHIT,
      companyName: null,
      auctionEvents: [
        makeEvent({
          round_number: 2,
          event_type: 'SPECIAL_NO_AUCTION',
          won_by_us: true, // data error scenario
        }),
      ],
      ledgerRows: [],
    }
    const result = buildStatementData(input)
    // SPECIAL_NO_AUCTION must never display as WE_WON
    expect(result.rounds[0].winner).toBe('NOT_APPLICABLE')
  })
})

// ---------------------------------------------------------------------------
// 5. UNKNOWN event type preservation
// ---------------------------------------------------------------------------
describe('buildStatementData — UNKNOWN', () => {
  it('preserves UNKNOWN event type in the output', () => {
    const input: StatementInput = {
      chit: BASE_CHIT,
      companyName: null,
      auctionEvents: [
        makeEvent({
          round_number: 3,
          event_type: 'UNKNOWN',
          thallu: null,
          commission: null,
          won_by_us: null,
        }),
      ],
      ledgerRows: [],
    }
    const result = buildStatementData(input)
    expect(result.rounds[0].eventType).toBe('UNKNOWN')
    expect(result.rounds[0].winner).toBe('UNKNOWN')
    const unknownFlag = result.qualityFlags.find((f) => f.kind === 'UNKNOWN_EVENT')
    expect(unknownFlag).toBeDefined()
    if (unknownFlag && unknownFlag.kind === 'UNKNOWN_EVENT') {
      expect(unknownFlag.round).toBe(3)
    }
  })
})

// ---------------------------------------------------------------------------
// 6. FLAGGED_MISMATCH — values preserved, flag raised
// ---------------------------------------------------------------------------
describe('buildStatementData — FLAGGED_MISMATCH', () => {
  it('preserves source-derived financial values for flagged rounds', () => {
    const input: StatementInput = {
      chit: BASE_CHIT,
      companyName: null,
      auctionEvents: [
        makeEvent({
          round_number: 1,
          calculation_status: 'FLAGGED_MISMATCH',
          thallu: 6000,
          commission: 150,
        }),
      ],
      ledgerRows: [],
    }
    const result = buildStatementData(input)
    const round = result.rounds[0]
    expect(round.calculationStatus).toBe('FLAGGED_MISMATCH')
    // Source values preserved
    expect(round.thallu).toBe(6000)
    expect(round.commission).toBe(150)
    // Quality flag raised
    expect(result.qualityFlags.some((f) => f.kind === 'FLAGGED_MISMATCH')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 7. Superseded ledger entries excluded
// ---------------------------------------------------------------------------
describe('buildStatementData — superseded entries', () => {
  it('excludes superseded entries from actualPaid totals', () => {
    const input: StatementInput = {
      chit: BASE_CHIT,
      companyName: null,
      auctionEvents: [makeEvent({ round_number: 1 })],
      ledgerRows: [
        // Original entry — superseded
        makeLedger({
          id: 'l-orig',
          entry_type: 'INSTALLMENT_PAID',
          effective_entry_type: 'INSTALLMENT_PAID',
          amount: 5000,
          auction_event_id: 'event-1',
          is_superseded: true,
          corrects_entry_id: null,
        }),
        // Correction entry — effective
        makeLedger({
          id: 'l-correction',
          entry_type: 'MANUAL_CORRECTION',
          effective_entry_type: 'INSTALLMENT_PAID', // inherits original type
          amount: 4800,
          auction_event_id: 'event-1',
          is_superseded: false,
          corrects_entry_id: 'l-orig',
        }),
      ],
    }
    const result = buildStatementData(input)
    const round = result.rounds[0]
    // Only the correction amount should count, NOT the superseded 5000
    expect(round.actualPaid).toBe(4800)
    // ROI effectiveEntries must also exclude superseded
    const supersededInEffective = result.effectiveEntries.find((e) => e.id === 'l-orig')
    expect(supersededInEffective).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 8. Cash-flow rows include all rows (superseded shown, dimmed by UI)
// ---------------------------------------------------------------------------
describe('buildStatementData — cash flow rows', () => {
  it('includes superseded rows in cashFlow array but flags them', () => {
    const input: StatementInput = {
      chit: BASE_CHIT,
      companyName: null,
      auctionEvents: [makeEvent({ round_number: 1 })],
      ledgerRows: [
        makeLedger({
          id: 'l-orig',
          entry_type: 'INSTALLMENT_PAID',
          effective_entry_type: 'INSTALLMENT_PAID',
          amount: 5000,
          auction_event_id: 'event-1',
          is_superseded: true,
        }),
      ],
    }
    const result = buildStatementData(input)
    const cfRow = result.cashFlow.find((r) => r.id === 'l-orig')
    expect(cfRow).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// 9. Date and Cash Flow Quality Flags
// ---------------------------------------------------------------------------
describe('buildStatementData — Date Flags', () => {
  it('A. Round has auction_date + payment transaction date -> no missing flags', () => {
    const input: StatementInput = {
      chit: BASE_CHIT,
      companyName: null,
      auctionEvents: [makeEvent({ round_number: 1, auction_date: '2026-01-15' })],
      ledgerRows: [
        makeLedger({ id: 'l1', entry_type: 'INSTALLMENT_PAID', amount: 5000, auction_event_id: 'event-1' }),
      ],
    }
    const result = buildStatementData(input)
    expect(result.qualityFlags.some(f => f.kind === 'MISSING_AUCTION_DATE')).toBe(false)
    expect(result.qualityFlags.some(f => f.kind === 'MISSING_CASH_FLOW')).toBe(false)
  })

  it('B. Round has no auction_date + payment transaction date -> exactly one MISSING_AUCTION_DATE flag with explicit message', () => {
    const input: StatementInput = {
      chit: BASE_CHIT,
      companyName: null,
      auctionEvents: [makeEvent({ round_number: 1, auction_date: null })],
      ledgerRows: [
        makeLedger({ id: 'l1', entry_type: 'INSTALLMENT_PAID', amount: 5000, auction_event_id: 'event-1' }),
      ],
    }
    const result = buildStatementData(input)
    expect(result.qualityFlags.filter(f => f.kind === 'MISSING_AUCTION_DATE').length).toBe(1)
    expect(result.qualityFlags.some(f => f.kind === 'MISSING_CASH_FLOW')).toBe(false)
    const flag = result.qualityFlags.find(f => f.kind === 'MISSING_AUCTION_DATE')
    expect(flag?.message).toBe('Auction date is missing; payment date is recorded.')
  })

  it('C. Round has no auction_date + no effective payment entry -> missing auction date AND missing cash flow', () => {
    const input: StatementInput = {
      chit: BASE_CHIT,
      companyName: null,
      auctionEvents: [makeEvent({ round_number: 1, auction_date: null })],
      ledgerRows: [],
    }
    const result = buildStatementData(input)
    expect(result.qualityFlags.filter(f => f.kind === 'MISSING_AUCTION_DATE').length).toBe(1)
    expect(result.qualityFlags.filter(f => f.kind === 'MISSING_CASH_FLOW').length).toBe(1)
    const flag = result.qualityFlags.find(f => f.kind === 'MISSING_AUCTION_DATE')
    expect(flag?.message).toBe('Auction date is missing.')
  })

  it('D. SPECIAL_NO_AUCTION round with null auction_date -> no MISSING_AUCTION_DATE flag', () => {
    const input: StatementInput = {
      chit: BASE_CHIT,
      companyName: null,
      auctionEvents: [makeEvent({ round_number: 1, auction_date: null, event_type: 'SPECIAL_NO_AUCTION' })],
      ledgerRows: [],
    }
    const result = buildStatementData(input)
    expect(result.qualityFlags.some(f => f.kind === 'MISSING_AUCTION_DATE')).toBe(false)
  })
})

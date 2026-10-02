/**
 * Tests for the Completed Chit ROI Engine — Phase 7E
 *
 * Covers all 14 required test scenarios from the spec plus edge cases.
 * No financial values are hardcoded to a specific chit configuration.
 */

import { describe, it, expect } from 'vitest'
import { computeCompletedRoi } from './roi'
import type { RoiInput, EffectiveLedgerEntry } from './roi'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChit(status: string, duration: number) {
  return { status, duration_months: duration }
}

function makeEntry(
  id: string,
  effectiveType: EffectiveLedgerEntry['effective_entry_type'],
  amount: number,
  entry_type = effectiveType,
): EffectiveLedgerEntry {
  return {
    id,
    entry_type,
    effective_entry_type: effectiveType,
    amount,
    transaction_date: '2026-01-01',
  }
}

function makeInput(overrides: Partial<RoiInput> = {}): RoiInput {
  return {
    chit: makeChit('COMPLETED', 3),
    recordedRoundCount: 3,
    effectiveEntries: [],
    hasFlaggedMismatch: false,
    isCashFlowVerified: true,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Test 1 — Completed chit with valid actual cash flows → ROI calculated
// ---------------------------------------------------------------------------
describe('computeCompletedRoi — Test 1: valid completed chit', () => {
  it('returns AVAILABLE with correct totals and simple ROI', () => {
    const input = makeInput({
      effectiveEntries: [
        makeEntry('e1', 'INSTALLMENT_PAID', 10060),
        makeEntry('e2', 'INSTALLMENT_PAID', 12000),
        makeEntry('e3', 'INSTALLMENT_PAID', 10060),
        makeEntry('e4', 'AUCTION_PAYOUT_RECEIVED', 244000),
      ],
    })
    const result = computeCompletedRoi(input)
    expect(result.status).toBe('AVAILABLE')
    if (result.status !== 'AVAILABLE') return

    expect(result.totalActualPaid).toBe(32120)         // 10060+12000+10060
    expect(result.totalActualReceived).toBe(244000)
    expect(result.netActualCashFlow).toBe(244000 - 32120)  // 211880
    expect(result.simpleRoiPercent).toBeCloseTo((211880 / 32120) * 100, 5)
  })
})

// ---------------------------------------------------------------------------
// Test 2 — Active chit → ROI unavailable
// ---------------------------------------------------------------------------
describe('computeCompletedRoi — Test 2: active chit', () => {
  it('returns UNAVAILABLE with CHIT_NOT_COMPLETED reason', () => {
    const input = makeInput({
      chit: makeChit('ACTIVE', 3),
      effectiveEntries: [makeEntry('e1', 'INSTALLMENT_PAID', 10060)],
    })
    const result = computeCompletedRoi(input)
    expect(result.status).toBe('UNAVAILABLE')
    if (result.status !== 'UNAVAILABLE') return
    expect(result.reasons).toContain('CHIT_NOT_COMPLETED')
  })
})

// ---------------------------------------------------------------------------
// Test 3 — Completed but missing round → ROI unavailable
// ---------------------------------------------------------------------------
describe('computeCompletedRoi — Test 3: missing rounds', () => {
  it('returns UNAVAILABLE with ROUNDS_MISSING reason', () => {
    const input = makeInput({
      chit: makeChit('COMPLETED', 25),
      recordedRoundCount: 24,   // 1 round short
      effectiveEntries: [makeEntry('e1', 'INSTALLMENT_PAID', 10060)],
    })
    const result = computeCompletedRoi(input)
    expect(result.status).toBe('UNAVAILABLE')
    if (result.status !== 'UNAVAILABLE') return
    expect(result.reasons).toContain('ROUNDS_MISSING')
  })
})

// ---------------------------------------------------------------------------
// Test 4 — Completed but missing relevant payout → ROI unavailable
// ---------------------------------------------------------------------------
describe('computeCompletedRoi — Test 4: no entries at all (payout never recorded)', () => {
  it('returns UNAVAILABLE with NO_ENTRIES when entry list is empty', () => {
    const input = makeInput({
      effectiveEntries: [],
    })
    const result = computeCompletedRoi(input)
    expect(result.status).toBe('UNAVAILABLE')
    if (result.status !== 'UNAVAILABLE') return
    expect(result.reasons).toContain('NO_ENTRIES')
  })
})

// ---------------------------------------------------------------------------
// Test 5 — Completed with FLAGGED_MISMATCH → ROI unavailable
// ---------------------------------------------------------------------------
describe('computeCompletedRoi — Test 5: flagged mismatch', () => {
  it('returns UNAVAILABLE with FLAGGED_MISMATCH reason', () => {
    const input = makeInput({
      effectiveEntries: [makeEntry('e1', 'INSTALLMENT_PAID', 10060)],
      hasFlaggedMismatch: true,
    })
    const result = computeCompletedRoi(input)
    expect(result.status).toBe('UNAVAILABLE')
    if (result.status !== 'UNAVAILABLE') return
    expect(result.reasons).toContain('FLAGGED_MISMATCH')
  })
})

// ---------------------------------------------------------------------------
// Test 5b — Data Completeness Unverified → ROI unavailable
// ---------------------------------------------------------------------------
describe('computeCompletedRoi — Test 5b: unverified completeness', () => {
  it('returns UNAVAILABLE with DATA_COMPLETENESS_UNVERIFIED reason', () => {
    const input = makeInput({
      effectiveEntries: [makeEntry('e1', 'INSTALLMENT_PAID', 10060)],
      isCashFlowVerified: false,
    })
    const result = computeCompletedRoi(input)
    expect(result.status).toBe('UNAVAILABLE')
    if (result.status !== 'UNAVAILABLE') return
    expect(result.reasons).toContain('DATA_COMPLETENESS_UNVERIFIED')
  })
})

// ---------------------------------------------------------------------------
// Test 6 — Corrected ledger entry → original excluded, correction included once
// ---------------------------------------------------------------------------
describe('computeCompletedRoi — Test 6: corrected entry', () => {
  it('uses correction amount, not original, and does not double-count', () => {
    // Original (10060) is superseded — caller must exclude it before passing in.
    // Correction (10000) carries effective_entry_type = INSTALLMENT_PAID.
    const input = makeInput({
      effectiveEntries: [
        // original NOT in list (superseded by caller)
        makeEntry('corr-1', 'INSTALLMENT_PAID', 10000, 'MANUAL_CORRECTION'),
        makeEntry('e2', 'AUCTION_PAYOUT_RECEIVED', 244000),
      ],
    })
    const result = computeCompletedRoi(input)
    expect(result.status).toBe('AVAILABLE')
    if (result.status !== 'AVAILABLE') return
    expect(result.totalActualPaid).toBe(10000)    // correction amount, not 10060
    expect(result.totalActualReceived).toBe(244000)
  })
})

// ---------------------------------------------------------------------------
// Test 7 — Zero total paid → safely unavailable
// ---------------------------------------------------------------------------
describe('computeCompletedRoi — Test 7: zero total paid', () => {
  it('returns UNAVAILABLE with ZERO_TOTAL_PAID when no installments exist', () => {
    const input = makeInput({
      effectiveEntries: [
        makeEntry('e1', 'AUCTION_PAYOUT_RECEIVED', 244000),
      ],
    })
    const result = computeCompletedRoi(input)
    expect(result.status).toBe('UNAVAILABLE')
    if (result.status !== 'UNAVAILABLE') return
    expect(result.reasons).toContain('ZERO_TOTAL_PAID')
  })
})

// ---------------------------------------------------------------------------
// Test 8 — Multiple payout events → all valid actual receipts included
// ---------------------------------------------------------------------------
describe('computeCompletedRoi — Test 8: multiple payouts', () => {
  it('sums all AUCTION_PAYOUT_RECEIVED and MATURITY_SETTLEMENT entries', () => {
    const input = makeInput({
      chit: makeChit('COMPLETED', 2),
      recordedRoundCount: 2,
      effectiveEntries: [
        makeEntry('e1', 'INSTALLMENT_PAID', 10000),
        makeEntry('e2', 'AUCTION_PAYOUT_RECEIVED', 200000),
        makeEntry('e3', 'MATURITY_SETTLEMENT', 5000),
      ],
    })
    const result = computeCompletedRoi(input)
    expect(result.status).toBe('AVAILABLE')
    if (result.status !== 'AVAILABLE') return
    expect(result.totalActualReceived).toBe(205000)  // 200000 + 5000
    expect(result.totalActualPaid).toBe(10000)
  })
})

// ---------------------------------------------------------------------------
// Test 9 — SPECIAL_NO_AUCTION / Thai Chittu cash flow included only when recorded
// ---------------------------------------------------------------------------
describe('computeCompletedRoi — Test 9: SPECIAL_NO_AUCTION installment included only when recorded', () => {
  it('correctly accounts for full base_installment paid in a Thai Chittu round', () => {
    // In a Thai Chittu round we pay the full base installment (no thallu reduction).
    // The ROI engine receives only what is recorded — it makes no assumptions.
    const input = makeInput({
      chit: makeChit('COMPLETED', 2),
      recordedRoundCount: 2,
      effectiveEntries: [
        makeEntry('e1', 'INSTALLMENT_PAID', 10060),  // Normal round
        makeEntry('e2', 'INSTALLMENT_PAID', 12000),  // Thai Chittu — full installment
        makeEntry('e3', 'AUCTION_PAYOUT_RECEIVED', 244000),
      ],
    })
    const result = computeCompletedRoi(input)
    expect(result.status).toBe('AVAILABLE')
    if (result.status !== 'AVAILABLE') return
    expect(result.totalActualPaid).toBe(22060)  // 10060 + 12000
  })

  it('does NOT include a Thai Chittu payout if it was never recorded', () => {
    // Sangam received the payout — not us. No AUCTION_PAYOUT_RECEIVED in ledger.
    const input = makeInput({
      chit: makeChit('COMPLETED', 2),
      recordedRoundCount: 2,
      effectiveEntries: [
        makeEntry('e1', 'INSTALLMENT_PAID', 10060),
        makeEntry('e2', 'INSTALLMENT_PAID', 12000),
        // No AUCTION_PAYOUT_RECEIVED — Sangam got it, not us
      ],
    })
    const result = computeCompletedRoi(input)
    // totalActualReceived = 0 → ZERO_TOTAL_PAID guard doesn't apply (paid > 0)
    // ROI will be AVAILABLE but deeply negative — that is financially correct.
    expect(result.status).toBe('AVAILABLE')
    if (result.status !== 'AVAILABLE') return
    expect(result.totalActualReceived).toBe(0)
    expect(result.netActualCashFlow).toBeLessThan(0)
  })
})

// ---------------------------------------------------------------------------
// Test 10 — FINAL cash flow included only when actually recorded
// ---------------------------------------------------------------------------
describe('computeCompletedRoi — Test 10: FINAL round payout only when recorded', () => {
  it('includes FINAL round payout when recorded as AUCTION_PAYOUT_RECEIVED', () => {
    const input = makeInput({
      effectiveEntries: [
        makeEntry('e1', 'INSTALLMENT_PAID', 10060),
        makeEntry('e2', 'INSTALLMENT_PAID', 12000),
        makeEntry('e3', 'INSTALLMENT_PAID', 12000),
        makeEntry('e4', 'AUCTION_PAYOUT_RECEIVED', 292500), // Final round payout
      ],
    })
    const result = computeCompletedRoi(input)
    expect(result.status).toBe('AVAILABLE')
    if (result.status !== 'AVAILABLE') return
    expect(result.totalActualReceived).toBe(292500)
  })

  it('does NOT fabricate a FINAL payout if not in effective entries', () => {
    const input = makeInput({
      effectiveEntries: [
        makeEntry('e1', 'INSTALLMENT_PAID', 10060),
        makeEntry('e2', 'INSTALLMENT_PAID', 12000),
        makeEntry('e3', 'INSTALLMENT_PAID', 12000),
        // No payout — another member was the final winner
      ],
    })
    const result = computeCompletedRoi(input)
    expect(result.status).toBe('AVAILABLE')
    if (result.status !== 'AVAILABLE') return
    expect(result.totalActualReceived).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Test 11 — KULUKAL with unknown thallu does not cause invented cash flow
// ---------------------------------------------------------------------------
describe('computeCompletedRoi — Test 11: KULUKAL round', () => {
  it('only uses the actual recorded installment — no invented thallu or payout', () => {
    // A KULUKAL round might be stored as UNKNOWN or NORMAL with whatever thallu was observed.
    // The ROI engine cares only about the ledger entry — what was actually paid.
    const input = makeInput({
      effectiveEntries: [
        // Normal installment recorded for the KULUKAL round — amount from source only
        makeEntry('e1', 'INSTALLMENT_PAID', 10500),
        makeEntry('e2', 'AUCTION_PAYOUT_RECEIVED', 244000),
      ],
    })
    const result = computeCompletedRoi(input)
    expect(result.status).toBe('AVAILABLE')
    if (result.status !== 'AVAILABLE') return
    // The amount is purely what was stated in the source — 10500, not 0, not fabricated
    expect(result.totalActualPaid).toBe(10500)
  })
})

// ---------------------------------------------------------------------------
// Test 12 — No future/projected amounts enter ROI
// ---------------------------------------------------------------------------
describe('computeCompletedRoi — Test 12: no future projected amounts', () => {
  it('only counts entries in effectiveEntries — no external projections', () => {
    // The function has no way to reach into the future — it only aggregates
    // the entries passed in. We verify this by providing a controlled set.
    const input = makeInput({
      effectiveEntries: [
        makeEntry('e1', 'INSTALLMENT_PAID', 10000),
        makeEntry('e2', 'AUCTION_PAYOUT_RECEIVED', 50000),
      ],
    })
    const result = computeCompletedRoi(input)
    expect(result.status).toBe('AVAILABLE')
    if (result.status !== 'AVAILABLE') return
    // No extra amounts beyond what was passed in
    expect(result.totalActualPaid).toBe(10000)
    expect(result.totalActualReceived).toBe(50000)
  })
})

// ---------------------------------------------------------------------------
// Test 13 — Winner payout uses actual ledger amount, never face_value - thallu
// ---------------------------------------------------------------------------
describe('computeCompletedRoi — Test 13: payout from ledger, not formula', () => {
  it('uses the recorded AUCTION_PAYOUT_RECEIVED amount verbatim', () => {
    // The ROI engine receives pre-built effective entries — it has no access
    // to face_value or thallu and cannot compute winner_payout = face_value - thallu.
    const input = makeInput({
      effectiveEntries: [
        makeEntry('e1', 'INSTALLMENT_PAID', 10060),
        // This 244000 came from the WhatsApp source, not from any formula
        makeEntry('e2', 'AUCTION_PAYOUT_RECEIVED', 244000),
      ],
    })
    const result = computeCompletedRoi(input)
    expect(result.status).toBe('AVAILABLE')
    if (result.status !== 'AVAILABLE') return
    expect(result.totalActualReceived).toBe(244000)
  })
})

// ---------------------------------------------------------------------------
// Test 14 — Different chit configurations — no hardcoded member/duration/installment
// ---------------------------------------------------------------------------
describe('computeCompletedRoi — Test 14: config-agnostic', () => {
  const CONFIGS = [
    { name: '3L/25', duration: 25, installment: 12000, payout: 244000, rounds: 25 },
    { name: '3L/20', duration: 20, installment: 15000, payout: 220000, rounds: 20 },
    { name: '6L/24', duration: 24, installment: 25000, payout: 500000, rounds: 24 },
    { name: '1L/10', duration: 10, installment: 10000, payout: 85000, rounds: 10 },
  ]

  for (const cfg of CONFIGS) {
    it(`correctly computes ROI for a ${cfg.name} chit`, () => {
      const entries: EffectiveLedgerEntry[] = []
      for (let i = 1; i <= cfg.rounds; i++) {
        entries.push(makeEntry(`inst-${i}`, 'INSTALLMENT_PAID', cfg.installment))
      }
      entries.push(makeEntry('payout-1', 'AUCTION_PAYOUT_RECEIVED', cfg.payout))

      const input = makeInput({
        chit: makeChit('COMPLETED', cfg.duration),
        recordedRoundCount: cfg.rounds,
        effectiveEntries: entries,
      })
      const result = computeCompletedRoi(input)
      expect(result.status).toBe('AVAILABLE')
      if (result.status !== 'AVAILABLE') return

      const expectedPaid = cfg.installment * cfg.rounds
      expect(result.totalActualPaid).toBe(expectedPaid)
      expect(result.totalActualReceived).toBe(cfg.payout)
      expect(result.netActualCashFlow).toBe(cfg.payout - expectedPaid)
      expect(result.simpleRoiPercent).toBeCloseTo(
        ((cfg.payout - expectedPaid) / expectedPaid) * 100,
        5
      )
    })
  }
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe('computeCompletedRoi — edge cases', () => {
  it('accumulates multiple FLAGGED_MISMATCH and ROUNDS_MISSING reasons together', () => {
    const input = makeInput({
      chit: makeChit('COMPLETED', 25),
      recordedRoundCount: 20,
      hasFlaggedMismatch: true,
      effectiveEntries: [makeEntry('e1', 'INSTALLMENT_PAID', 10000)],
    })
    const result = computeCompletedRoi(input)
    expect(result.status).toBe('UNAVAILABLE')
    if (result.status !== 'UNAVAILABLE') return
    expect(result.reasons).toContain('ROUNDS_MISSING')
    expect(result.reasons).toContain('FLAGGED_MISMATCH')
  })

  it('handles ADJUSTMENT with positive amount as inflow', () => {
    const input = makeInput({
      effectiveEntries: [
        makeEntry('e1', 'INSTALLMENT_PAID', 10000),
        makeEntry('e2', 'ADJUSTMENT', 500, 'ADJUSTMENT'),  // positive → inflow
      ],
    })
    const result = computeCompletedRoi(input)
    expect(result.status).toBe('AVAILABLE')
    if (result.status !== 'AVAILABLE') return
    expect(result.totalActualReceived).toBe(500)
    expect(result.totalActualPaid).toBe(10000)
  })

  it('handles ADJUSTMENT with negative amount as outflow', () => {
    const input = makeInput({
      effectiveEntries: [
        makeEntry('e1', 'INSTALLMENT_PAID', 10000),
        makeEntry('e2', 'ADJUSTMENT', -200, 'ADJUSTMENT'),  // negative → outflow
        makeEntry('e3', 'AUCTION_PAYOUT_RECEIVED', 244000),
      ],
    })
    const result = computeCompletedRoi(input)
    expect(result.status).toBe('AVAILABLE')
    if (result.status !== 'AVAILABLE') return
    expect(result.totalActualPaid).toBe(10200)    // 10000 + 200 (abs of -200)
    expect(result.totalActualReceived).toBe(244000)
  })

  it('handles LATE_FEE as outflow', () => {
    const input = makeInput({
      effectiveEntries: [
        makeEntry('e1', 'INSTALLMENT_PAID', 10000),
        makeEntry('e2', 'LATE_FEE', 500),
        makeEntry('e3', 'AUCTION_PAYOUT_RECEIVED', 244000),
      ],
    })
    const result = computeCompletedRoi(input)
    expect(result.status).toBe('AVAILABLE')
    if (result.status !== 'AVAILABLE') return
    expect(result.totalActualPaid).toBe(10500)  // 10000 + 500
  })

  it('accumulates all CHIT_NOT_COMPLETED, ROUNDS_MISSING, FLAGGED_MISMATCH reasons', () => {
    const input = makeInput({
      chit: makeChit('ACTIVE', 25),
      recordedRoundCount: 10,
      hasFlaggedMismatch: true,
      effectiveEntries: [makeEntry('e1', 'INSTALLMENT_PAID', 10000)],
    })
    const result = computeCompletedRoi(input)
    expect(result.status).toBe('UNAVAILABLE')
    if (result.status !== 'UNAVAILABLE') return
    expect(result.reasons).toContain('CHIT_NOT_COMPLETED')
    expect(result.reasons).toContain('ROUNDS_MISSING')
    expect(result.reasons).toContain('FLAGGED_MISMATCH')
  })
})

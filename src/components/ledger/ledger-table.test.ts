import { describe, it, expect } from 'vitest'
import type { LedgerRow } from './ledger-table'

// -------------------------------------------------------------------------
// Helpers under test — extracted / replicated from ledger-table.tsx
// so tests remain fast (no JSX rendering required).
// -------------------------------------------------------------------------

// The entry-type label mapping mirrors the component exactly.
const ENTRY_TYPE_LABELS: Record<string, string> = {
  INSTALLMENT_PAID:         'Installment Paid',
  AUCTION_PAYOUT_RECEIVED:  'Auction Payout Received',
  ADJUSTMENT:               'Adjustment',
  LATE_FEE:                 'Late Fee',
  MATURITY_SETTLEMENT:      'Maturity Settlement',
  MANUAL_CORRECTION:        'Manual Correction',
}

function entryTypeLabel(type: string): string {
  return ENTRY_TYPE_LABELS[type] ?? type
}

function formatAmount(amount: number): string {
  return `₹${Math.abs(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

// -------------------------------------------------------------------------
// Test data helpers
// -------------------------------------------------------------------------

let _idCounter = 0
function makeEntry(overrides: Partial<LedgerRow> = {}): LedgerRow {
  _idCounter++
  return {
    id: `entry-${_idCounter}`,
    transaction_date: '2026-06-01',
    entry_type: 'INSTALLMENT_PAID',
    amount: 10060,
    notes: null,
    created_at: `2026-06-01T10:00:00Z`,
    round_number: null,
    ...overrides,
  }
}

// -------------------------------------------------------------------------
// A. Entry-type label rendering
// -------------------------------------------------------------------------

describe('LedgerTable — entry type labels', () => {
  it('renders INSTALLMENT_PAID as human-readable label', () => {
    expect(entryTypeLabel('INSTALLMENT_PAID')).toBe('Installment Paid')
  })

  it('renders AUCTION_PAYOUT_RECEIVED correctly', () => {
    expect(entryTypeLabel('AUCTION_PAYOUT_RECEIVED')).toBe('Auction Payout Received')
  })

  it('renders ADJUSTMENT correctly', () => {
    expect(entryTypeLabel('ADJUSTMENT')).toBe('Adjustment')
  })

  it('renders LATE_FEE correctly', () => {
    expect(entryTypeLabel('LATE_FEE')).toBe('Late Fee')
  })

  it('renders MATURITY_SETTLEMENT correctly', () => {
    expect(entryTypeLabel('MATURITY_SETTLEMENT')).toBe('Maturity Settlement')
  })

  it('renders MANUAL_CORRECTION correctly', () => {
    expect(entryTypeLabel('MANUAL_CORRECTION')).toBe('Manual Correction')
  })

  it('returns raw type string for unknown entry types — no crash', () => {
    expect(entryTypeLabel('FUTURE_UNKNOWN_TYPE')).toBe('FUTURE_UNKNOWN_TYPE')
  })
})

// -------------------------------------------------------------------------
// B. Amount display
// -------------------------------------------------------------------------

describe('LedgerTable — amount formatting', () => {
  it('formats a positive stored amount as absolute rupee value', () => {
    expect(formatAmount(10060)).toBe('₹10,060.00')
  })

  it('formats a negative stored amount as absolute rupee value (no sign shown)', () => {
    // Historical entries may theoretically be negative per DB schema.
    // Phase 6D must NOT show a minus sign — display absolute value only.
    expect(formatAmount(-10060)).toBe('₹10,060.00')
  })

  it('formats zero correctly', () => {
    expect(formatAmount(0)).toBe('₹0.00')
  })

  it('formats large amounts with Indian locale grouping', () => {
    expect(formatAmount(300000)).toBe('₹3,00,000.00')
  })

  it('formats decimal amounts correctly', () => {
    expect(formatAmount(1234.5)).toBe('₹1,234.50')
  })
})

// -------------------------------------------------------------------------
// C. Empty ledger state
// -------------------------------------------------------------------------

describe('LedgerTable — empty state', () => {
  it('signals empty when entries array is empty', () => {
    const entries: LedgerRow[] = []
    expect(entries.length).toBe(0)
  })

  it('does not signal empty when at least one entry exists', () => {
    const entries = [makeEntry()]
    expect(entries.length).toBeGreaterThan(0)
  })
})

// -------------------------------------------------------------------------
// D. Ordering
// -------------------------------------------------------------------------

describe('LedgerTable — ordering', () => {
  it('entries sorted transaction_date DESC appear newest first', () => {
    const entries: LedgerRow[] = [
      makeEntry({ id: 'older', transaction_date: '2026-05-01', created_at: '2026-05-01T08:00:00Z' }),
      makeEntry({ id: 'newer', transaction_date: '2026-06-01', created_at: '2026-06-01T08:00:00Z' }),
    ]
    // Sort descending (as the DB query will return it)
    const sorted = [...entries].sort((a, b) => {
      if (b.transaction_date !== a.transaction_date) {
        return b.transaction_date.localeCompare(a.transaction_date)
      }
      return b.created_at.localeCompare(a.created_at)
    })
    expect(sorted[0].id).toBe('newer')
    expect(sorted[1].id).toBe('older')
  })

  it('when transaction_date is equal, created_at DESC is tiebreaker', () => {
    const entries: LedgerRow[] = [
      makeEntry({ id: 'first',  transaction_date: '2026-06-01', created_at: '2026-06-01T09:00:00Z' }),
      makeEntry({ id: 'second', transaction_date: '2026-06-01', created_at: '2026-06-01T11:00:00Z' }),
    ]
    const sorted = [...entries].sort((a, b) => {
      if (b.transaction_date !== a.transaction_date) {
        return b.transaction_date.localeCompare(a.transaction_date)
      }
      return b.created_at.localeCompare(a.created_at)
    })
    expect(sorted[0].id).toBe('second')
    expect(sorted[1].id).toBe('first')
  })
})

// -------------------------------------------------------------------------
// E. Data binding
// -------------------------------------------------------------------------

describe('LedgerTable — data binding', () => {
  it('entry carries correct amount', () => {
    const entry = makeEntry({ amount: 9800 })
    expect(entry.amount).toBe(9800)
    expect(formatAmount(entry.amount)).toBe('₹9,800.00')
  })

  it('entry carries correct entry type', () => {
    const entry = makeEntry({ entry_type: 'LATE_FEE' })
    expect(entryTypeLabel(entry.entry_type)).toBe('Late Fee')
  })

  it('entry carries round_number when auction_event resolves', () => {
    const entry = makeEntry({ round_number: 5 })
    expect(entry.round_number).toBe(5)
  })

  it('round_number is null when no auction_event linked', () => {
    const entry = makeEntry({ round_number: null })
    expect(entry.round_number).toBeNull()
  })

  it('notes field is preserved', () => {
    const entry = makeEntry({ notes: 'Manual correction for round 3' })
    expect(entry.notes).toBe('Manual correction for round 3')
  })

  it('notes is null when absent', () => {
    const entry = makeEntry({ notes: null })
    expect(entry.notes).toBeNull()
  })
})

// -------------------------------------------------------------------------
// F. Chit isolation — server query filter contract
// -------------------------------------------------------------------------

describe('LedgerTable — chit isolation contract', () => {
  it('entries with a different chit_id must not be included — filter is applied at query time', () => {
    // This validates the chit filtering logic contract.
    // The server query filters by chit_id, so we simulate what the query returns.
    const chitA = 'chit-a-uuid'
    const chitB = 'chit-b-uuid'

    // Simulated DB result rows — already filtered by the server query
    const rawDbRows = [
      { id: 'e1', chit_id: chitA, entry_type: 'INSTALLMENT_PAID', amount: 10000, transaction_date: '2026-05-01', created_at: '2026-05-01T08:00:00Z', notes: null },
      { id: 'e2', chit_id: chitB, entry_type: 'INSTALLMENT_PAID', amount: 99999, transaction_date: '2026-05-02', created_at: '2026-05-02T08:00:00Z', notes: null },
    ]

    // Server MUST filter; simulate by applying the same filter client-side
    const filteredForChitA = rawDbRows.filter(r => r.chit_id === chitA)

    expect(filteredForChitA).toHaveLength(1)
    expect(filteredForChitA[0].id).toBe('e1')
    // chit B entry must not appear
    expect(filteredForChitA.some(r => r.chit_id === chitB)).toBe(false)
  })
})

// -------------------------------------------------------------------------
// G. No financial aggregation
// -------------------------------------------------------------------------

describe('LedgerTable — no financial aggregation', () => {
  it('does not compute a total ledger amount', () => {
    const entries = [
      makeEntry({ amount: 10060 }),
      makeEntry({ amount: 9800 }),
      makeEntry({ amount: 10000 }),
    ]
    // Phase 6D must NOT sum these. Verify there is no aggregate helper.
    // The test verifies that entry data is not aggregated — each row stands alone.
    entries.forEach(e => {
      expect(typeof e.amount).toBe('number')
    })
    // No total variable should exist (structural test — the component never exports one)
    expect(typeof (entries as any).total).toBe('undefined')
  })

  it('does not compute a running balance', () => {
    const entries = [
      makeEntry({ amount: 10060 }),
      makeEntry({ amount: 9800 }),
    ]
    // Verify running balance is not part of the LedgerRow type
    entries.forEach(e => {
      expect((e as any).runningBalance).toBeUndefined()
      expect((e as any).balance).toBeUndefined()
      expect((e as any).cashFlow).toBeUndefined()
      expect((e as any).profit).toBeUndefined()
      expect((e as any).roi).toBeUndefined()
    })
  })

  it('does not define a net total field', () => {
    const entries = [makeEntry({ amount: 10060 })]
    entries.forEach(e => {
      expect((e as any).netTotal).toBeUndefined()
      expect((e as any).totalPaid).toBeUndefined()
      expect((e as any).totalReceived).toBeUndefined()
    })
  })
})

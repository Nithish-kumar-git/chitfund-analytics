import { describe, it, expect, vi, beforeEach } from 'vitest'
import ChitDetailPage from './page'

// ---------------------------------------------------------------------------
// vi.hoisted lets us declare state that is available BEFORE vi.mock hoisting
// ---------------------------------------------------------------------------
const mockState = vi.hoisted(() => ({
  auctionData: [] as any[],
  ledgerData:  [] as any[],
  getUser: vi.fn(),
  single:  vi.fn(),
  // Captured on each auction_events query — used by the ordering verification test
  capturedAuctionEqArgs:    [] as any[],
  capturedAuctionOrderArgs: [] as any[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockState.getUser },
    from: (table: string) => {
      if (table === 'ledger_entries') {
        // Chain: .select().eq().order().order() → resolves
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                order: () => Promise.resolve({ data: mockState.ledgerData, error: null })
              })
            })
          })
        }
      }
      if (table === 'auction_events') {
        // Chain: .select().eq().order() → resolves
        // eq/order arguments are captured into mockState for verification by tests.
        return {
          select: () => ({
            eq: (col: string, val: any) => {
              mockState.capturedAuctionEqArgs = [col, val]
              return {
                order: (col2: string, opts: any) => {
                  mockState.capturedAuctionOrderArgs = [col2, opts]
                  return Promise.resolve({ data: mockState.auctionData, error: null })
                }
              }
            }
          })
        }
      }
      // chits / chit_companies
      // Chain: .select().eq().single() → resolves
      return {
        select: () => ({
          eq: () => ({
            single: mockState.single,
            order:  () => Promise.resolve({ data: [], error: null }),
          })
        })
      }
    }
  }))
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT') }),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const USER_ID = 'user-uuid-0001'
const CHIT_ID  = 'chit-uuid-0001'

const MOCK_CHIT = {
  id: CHIT_ID,
  profile_id: USER_ID,
  name: 'Test Chit',
  status: 'ACTIVE',
  face_value: 100000,
  duration_months: 20,
  member_count: 20,
  base_installment: 5000,
  commission_type: 'PERCENTAGE',
  commission_value: 5,
  created_at: new Date().toISOString(),
}

const getCircularReplacer = () => {
  const seen = new WeakSet()
  return (key: string, value: any) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return
      seen.add(value)
    }
    return value
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Chit Detail Page — Phase 5A (Read-Only History)', () => {
  beforeEach(() => {
    // Reset only the spy call histories, NOT mock implementations.
    // vi.clearAllMocks() would wipe createClient's implementation — don't use it here.
    mockState.getUser.mockReset()
    mockState.single.mockReset()
    mockState.auctionData = []
    mockState.ledgerData  = []
    mockState.single.mockResolvedValue({ data: MOCK_CHIT, error: null })
    mockState.getUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  })

  // -- auth/access --

  it('redirects to / if user is not authenticated', async () => {
    mockState.getUser.mockResolvedValueOnce({ data: { user: null } })
    await expect(ChitDetailPage({ params: Promise.resolve({ id: CHIT_ID }) }))
      .rejects.toThrow('NEXT_REDIRECT')
  })

  it('calls notFound if the chit does not exist or user lacks access (RLS)', async () => {
    mockState.single.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } })
    await expect(ChitDetailPage({ params: Promise.resolve({ id: CHIT_ID }) }))
      .rejects.toThrow('NEXT_NOT_FOUND')
  })

  // Restored from pre-Phase-6D HEAD: verifies the exact auction_events query contract
  it('queries auction_events for the current chit and orders by round_number descending', async () => {
    mockState.capturedAuctionEqArgs    = []
    mockState.capturedAuctionOrderArgs = []

    try {
      await ChitDetailPage({ params: Promise.resolve({ id: CHIT_ID }) })
    } catch (_) { /* ignore RSC serialization errors */ }

    expect(mockState.capturedAuctionEqArgs).toEqual(['chit_id', CHIT_ID])
    expect(mockState.capturedAuctionOrderArgs).toEqual(['round_number', { ascending: false }])
  })

  // -- rendering: auction events --

  it('renders correctly with an empty auction history', async () => {
    const result: any = await ChitDetailPage({ params: Promise.resolve({ id: CHIT_ID }) })
    const s = JSON.stringify(result, getCircularReplacer())
    expect(s).toContain('No rounds recorded yet.')
  })

  it('renders an Edit Chit link navigating to /chits/[id]/edit in the header', async () => {
    const result: any = await ChitDetailPage({ params: Promise.resolve({ id: CHIT_ID }) })
    const s = JSON.stringify(result, getCircularReplacer())
    expect(s).toContain('Edit Chit')
    expect(s).toContain(`/chits/${CHIT_ID}/edit`)
  })

  it('renders correctly with a NORMAL auction event showing financial data', async () => {
    mockState.auctionData = [{
      id: 'round-1', chit_id: CHIT_ID, round_number: 1, event_type: 'NORMAL',
      thallu: 15000, commission: 5000, member_thallu: 500, non_winner_payment: 4500,
      calculation_status: 'VERIFIED_FORMULA'
    }]
    const result: any = await ChitDetailPage({ params: Promise.resolve({ id: CHIT_ID }) })
    const s = JSON.stringify(result, getCircularReplacer())

    expect(s).not.toContain('No rounds recorded yet.')
    expect(s).toContain('"Round ",1')
    expect(s).toContain('15,000')
    expect(s).toContain('5,000')
    expect(s).toContain('4,500')
  })

  it('renders correctly with a SPECIAL_NO_AUCTION event without normal calculations', async () => {
    mockState.auctionData = [{
      id: 'round-2', chit_id: CHIT_ID, round_number: 2, event_type: 'SPECIAL_NO_AUCTION',
      thallu: null, commission: null, member_thallu: null, non_winner_payment: null,
      calculation_status: 'INDUSTRY_DEFAULT'
    }]
    const result: any = await ChitDetailPage({ params: Promise.resolve({ id: CHIT_ID }) })
    const s = JSON.stringify(result, getCircularReplacer())

    expect(s).toContain('"Round ",2')
    expect(s).toContain('Normal auction calculations are not applicable for ","SPECIAL_NO_AUCTION",')
  })


  it('renders multiple rounds correctly in descending order, including mixed event types', async () => {
    mockState.auctionData = [
      { id: 'round-3', chit_id: CHIT_ID, round_number: 3, event_type: 'NORMAL',
        thallu: 10000, commission: 5000, member_thallu: 250, non_winner_payment: 4750, calculation_status: 'VERIFIED_FORMULA' },
      { id: 'round-2', chit_id: CHIT_ID, round_number: 2, event_type: 'SPECIAL_NO_AUCTION',
        thallu: null, commission: null, member_thallu: null, non_winner_payment: null, calculation_status: 'INDUSTRY_DEFAULT' },
      { id: 'round-1', chit_id: CHIT_ID, round_number: 1, event_type: 'UNKNOWN',
        thallu: null, commission: null, member_thallu: null, non_winner_payment: null, calculation_status: 'INDUSTRY_DEFAULT' }
    ]
    const result: any = await ChitDetailPage({ params: Promise.resolve({ id: CHIT_ID }) })
    const s = JSON.stringify(result, getCircularReplacer())

    expect(s).toContain('"Round ",3')
    expect(s).toContain('"Round ",2')
    expect(s).toContain('"Round ",1')
    expect(s).toContain('10,000')
    expect(s).toContain('4,750')
    expect(s).toContain('Normal auction calculations are not applicable for ","SPECIAL_NO_AUCTION",')
    expect(s).toContain('Normal auction calculations are not applicable for ","UNKNOWN",')

    const idx3 = s.indexOf('"Round ",3')
    const idx2 = s.indexOf('"Round ",2')
    const idx1 = s.indexOf('"Round ",1')
    expect(idx3).toBeLessThan(idx2)
    expect(idx2).toBeLessThan(idx1)
  })

  // -- Phase 6D: Ledger section --

  it('renders the Financial Ledger section heading', async () => {
    const result: any = await ChitDetailPage({ params: Promise.resolve({ id: CHIT_ID }) })
    const s = JSON.stringify(result, getCircularReplacer())
    expect(s).toContain('Financial Ledger')
  })

  it('renders the ledger empty state when no ledger entries exist', async () => {
    mockState.ledgerData = []
    const result: any = await ChitDetailPage({ params: Promise.resolve({ id: CHIT_ID }) })
    const s = JSON.stringify(result, getCircularReplacer())
    // LedgerTable receives an empty entries prop — component handles the empty state
    expect(s).toContain('Financial Ledger')
    expect(s).toContain('"entries":[]')
  })

  it('renders ledger entries when they exist — correct amount and round number shown', async () => {
    mockState.ledgerData = [{
      id: 'ledger-1',
      transaction_date: '2026-05-01',
      entry_type: 'INSTALLMENT_PAID',
      amount: 10060,
      notes: null,
      created_at: '2026-05-01T09:00:00Z',
      auction_event_id: 'ae-1',
      auction_events: { round_number: 3 }
    }]
    const result: any = await ChitDetailPage({ params: Promise.resolve({ id: CHIT_ID }) })
    const s = JSON.stringify(result, getCircularReplacer())

    // The LedgerTable React element is present with the correct entries prop
    expect(s).toContain('Financial Ledger')
    // The component receives 1 entry, not empty
    expect(s).not.toContain('No ledger entries recorded yet.')
    // The entries array prop contains the entry_type
    expect(s).toContain('INSTALLMENT_PAID')
    // The entries array prop contains the amount value
    expect(s).toContain('10060')
    // The entries array prop contains the round_number
    expect(s).toContain('"round_number":3')
  })

  it('renders notes when present on a ledger entry', async () => {
    mockState.ledgerData = [{
      id: 'ledger-2',
      transaction_date: '2026-06-01',
      entry_type: 'ADJUSTMENT',
      amount: 500,
      notes: 'Admin correction for round 4',
      created_at: '2026-06-01T10:00:00Z',
      auction_event_id: null,
      auction_events: null
    }]
    const result: any = await ChitDetailPage({ params: Promise.resolve({ id: CHIT_ID }) })
    const s = JSON.stringify(result, getCircularReplacer())
    // Notes value is present in the serialized entries prop
    expect(s).toContain('Admin correction for round 4')
  })

  it('does not render balance, running total, profit, ROI, or cash flow', async () => {
    const result: any = await ChitDetailPage({ params: Promise.resolve({ id: CHIT_ID }) })
    const s = JSON.stringify(result, getCircularReplacer())
    expect(s).not.toContain('Running Balance')
    expect(s).not.toContain('Total Balance')
    expect(s).not.toContain('Cash Flow')
    expect(s).not.toContain('Profit')
    expect(s).not.toContain('ROI')
    expect(s).not.toContain('Net Total')
  })

  it('calculates safe metrics correctly and excludes superseded entries', async () => {
    mockState.ledgerData = [
      {
        id: 'entry-1',
        entry_type: 'INSTALLMENT_PAID',
        amount: 100,
        corrects_entry_id: null
      },
      {
        id: 'entry-2',
        entry_type: 'INSTALLMENT_PAID',
        amount: 200,
        corrects_entry_id: null
      },
      {
        id: 'entry-3', // Correction of entry-2
        entry_type: 'MANUAL_CORRECTION',
        amount: 250,
        corrects_entry_id: 'entry-2'
      },
      {
        id: 'entry-4',
        entry_type: 'AUCTION_PAYOUT_RECEIVED',
        amount: 500,
        corrects_entry_id: null
      },
      {
        id: 'entry-5', // Ignored type for aggregate amount
        entry_type: 'LATE_FEE',
        amount: 50,
        corrects_entry_id: null
      }
    ]
    const result: any = await ChitDetailPage({ params: Promise.resolve({ id: CHIT_ID }) })
    const s = JSON.stringify(result, getCircularReplacer())
    // 5 total rows, 1 is superseded (entry-2), leaving 4 effective transactions.
    expect(s).toContain('"transactionCount":4')
    // Installments: entry-1 (100) + entry-3 (which effectively is INSTALLMENT_PAID, 250) = 350. Count = 2.
    expect(s).toContain('"installmentCount":2')
    expect(s).toContain('"totalInstallmentAmount":350')
    // Incoming: entry-4 (500)
    expect(s).toContain('"totalIncomingAmount":500')
  })
})

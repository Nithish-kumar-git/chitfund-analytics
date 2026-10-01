import { describe, it, expect, vi, beforeEach } from 'vitest'
import ChitDetailPage from './page'

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------
const mockGetUser = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()
const mockOrder = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser
    },
    from: vi.fn((table: string) => {
      // Return a chainable mock based on the table
      const chain = {
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
        order: mockOrder
      }
      return chain
    })
  }))
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT') }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const USER_ID = 'user-uuid-0001'
const CHIT_ID = 'chit-uuid-0001'

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
    vi.clearAllMocks()
    
    // Default mocks setup to chain properly
    mockSelect.mockReturnValue({ eq: mockEq })
    mockEq.mockReturnValue({ single: mockSingle, order: mockOrder })
    mockOrder.mockResolvedValue({ data: [], error: null }) // For auction_events
    mockSingle.mockResolvedValue({ data: MOCK_CHIT, error: null }) // For chits
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  })

  it('redirects to / if user is not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    
    await expect(ChitDetailPage({ params: Promise.resolve({ id: CHIT_ID }) }))
      .rejects.toThrow('NEXT_REDIRECT')
  })

  it('calls notFound if the chit does not exist or user lacks access (RLS)', async () => {
    // Simulate RLS returning no rows
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } })
    
    await expect(ChitDetailPage({ params: Promise.resolve({ id: CHIT_ID }) }))
      .rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('queries auction_events for the current chit and orders by round_number descending', async () => {
    // We will intercept the calls to verify the chain
    let auctionEventsEqArgs: any[] = []
    let auctionEventsOrderArgs: any[] = []
    
    // We override mockEq to capture arguments
    mockEq.mockImplementation(function (this: any, col: string, val: any) {
      if (col === 'chit_id' && val === CHIT_ID) {
        auctionEventsEqArgs = [col, val]
      }
      return { single: mockSingle, order: mockOrder }
    })
    
    mockOrder.mockImplementation(function (this: any, col: string, opts: any) {
      auctionEventsOrderArgs = [col, opts]
      return Promise.resolve({ data: [], error: null })
    })

    try {
      await ChitDetailPage({ params: Promise.resolve({ id: CHIT_ID }) })
    } catch (e) {
      // Ignore React Server Component serialization issues in test if any
    }

    expect(auctionEventsEqArgs).toEqual(['chit_id', CHIT_ID])
    expect(auctionEventsOrderArgs).toEqual(['round_number', { ascending: false }])
  })

  it('renders correctly with an empty history', async () => {
    // Mock auction events returning empty
    mockOrder.mockResolvedValueOnce({ data: [], error: null })
    
    const result: any = await ChitDetailPage({ params: Promise.resolve({ id: CHIT_ID }) })
    
    // Check the structure to ensure "No rounds recorded yet." is somewhere in the tree
    const stringified = JSON.stringify(result, getCircularReplacer())
    expect(stringified).toContain('No rounds recorded yet.')
  })

  it('renders correctly with a NORMAL auction event showing financial data', async () => {
    const mockNormalRound = {
      id: 'round-1',
      chit_id: CHIT_ID,
      round_number: 1,
      event_type: 'NORMAL',
      thallu: 15000,
      commission: 5000,
      member_thallu: 500,
      non_winner_payment: 4500,
      calculation_status: 'VERIFIED_FORMULA'
    }
    
    mockOrder.mockResolvedValueOnce({ data: [mockNormalRound], error: null })
    
    const result: any = await ChitDetailPage({ params: Promise.resolve({ id: CHIT_ID }) })
    const stringified = JSON.stringify(result, getCircularReplacer())
    
    // Should NOT contain the empty state
    expect(stringified).not.toContain('No rounds recorded yet.')
    
    // Should contain the round number
    expect(stringified).toContain('"Round ",1')
    
    // Should contain formatted financial values
    expect(stringified).toContain('15,000') // thallu
    expect(stringified).toContain('5,000')  // commission
    expect(stringified).toContain('4,500')  // non_winner_payment
  })

  it('renders correctly with a SPECIAL_NO_AUCTION event without normal calculations', async () => {
    const mockSpecialRound = {
      id: 'round-2',
      chit_id: CHIT_ID,
      round_number: 2,
      event_type: 'SPECIAL_NO_AUCTION',
      thallu: null,
      commission: null,
      member_thallu: null,
      non_winner_payment: null,
      calculation_status: 'INDUSTRY_DEFAULT'
    }
    
    mockOrder.mockResolvedValueOnce({ data: [mockSpecialRound], error: null })
    
    const result: any = await ChitDetailPage({ params: Promise.resolve({ id: CHIT_ID }) })
    const stringified = JSON.stringify(result, getCircularReplacer())
    
    expect(stringified).toContain('"Round ",2')
    expect(stringified).toContain('Normal auction calculations are not applicable for ","SPECIAL_NO_AUCTION",')
  })
})

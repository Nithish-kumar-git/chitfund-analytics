import { describe, it, expect, vi, beforeEach } from 'vitest'
import EditChitPage from './page'

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
      getUser: mockGetUser,
    },
    from: vi.fn((table: string) => {
      const chain = {
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
        order: mockOrder,
      }
      return chain
    }),
  })),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))

// ---------------------------------------------------------------------------
// Helpers & Fixtures
// ---------------------------------------------------------------------------
const USER_ID = 'user-uuid-123'
const CHIT_ID = 'chit-uuid-456'

const MOCK_CHIT = {
  id: CHIT_ID,
  profile_id: USER_ID,
  name: 'Shriram 3L Scheme',
  face_value: 300000,
  duration_months: 25,
  member_count: 25,
  base_installment: 12000,
  commission_type: 'PERCENTAGE',
  commission_value: 2.5,
  commission_notes: 'Standard 2.5% company commission',
  group_label: 'Family Chit',
  company_id: 'comp-uuid-789',
  start_date: '2025-01-15',
  notes: 'Managed by Uncle',
  status: 'ACTIVE',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

const MOCK_COMPANIES = [
  { id: 'comp-uuid-789', name: 'Shriram Chits' },
  { id: 'comp-uuid-000', name: 'Margadarsi' },
]

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

describe('Edit Chit Page — Phase 6A (Safe Edit Chit Configuration)', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder })
    mockEq.mockReturnValue({ single: mockSingle })
    mockOrder.mockResolvedValue({ data: MOCK_COMPANIES, error: null })
    mockSingle.mockResolvedValue({ data: MOCK_CHIT, error: null })
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  })

  it('redirects to / if user is not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })

    await expect(EditChitPage({ params: Promise.resolve({ id: CHIT_ID }) })).rejects.toThrow(
      'NEXT_REDIRECT'
    )
  })

  it('calls notFound if the chit does not exist or user lacks access (RLS)', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } })

    await expect(EditChitPage({ params: Promise.resolve({ id: CHIT_ID }) })).rejects.toThrow(
      'NEXT_NOT_FOUND'
    )
  })

  it('queries chits table for the specific id and loads current values correctly', async () => {
    let queriedChitId: string | null = null
    mockEq.mockImplementation((col: string, val: any) => {
      if (col === 'id') queriedChitId = val
      return { single: mockSingle }
    })

    const result: any = await EditChitPage({ params: Promise.resolve({ id: CHIT_ID }) })
    const stringified = JSON.stringify(result, getCircularReplacer())

    expect(queriedChitId).toBe(CHIT_ID)

    // Form pre-filled values
    expect(stringified).toContain('Shriram 3L Scheme')
    expect(stringified).toContain('300000')
    expect(stringified).toContain('12000')
    expect(stringified).toContain('Family Chit')
    expect(stringified).toContain('Standard 2.5% company commission')
    expect(stringified).toContain('Managed by Uncle')

    // Back link
    expect(stringified).toContain('Back to Chit')
    expect(stringified).toContain(`/chits/${CHIT_ID}`)
  })
})

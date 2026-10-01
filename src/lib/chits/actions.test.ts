import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoist all mock functions BEFORE vi.mock factories run
// ---------------------------------------------------------------------------
const {
  mockGetUser,
  mockSelect,
  mockEq,
  mockMaybeSingle,
  mockSingle,
  mockInsert,
  mockUpdate,
  mockRedirect,
  mockRevalidatePath,
  mockFrom,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSelect: vi.fn(),
  mockEq: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockSingle: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockRedirect: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    mockRedirect(path)
    throw new Error(`NEXT_REDIRECT:${path}`)
  },
}))

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => mockRevalidatePath(path),
}))

import { updateChitAction, createChitAction } from './actions'

// ---------------------------------------------------------------------------
// Helpers & Fixtures
// ---------------------------------------------------------------------------
const USER_ID = 'user-uuid-111'
const CHIT_ID = 'chit-uuid-222'
const OTHER_USER_ID = 'user-uuid-999'

function makeFormData(fields: Record<string, string | number | undefined | null>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null) {
      fd.set(k, String(v))
    }
  }
  return fd
}

const VALID_EDIT_PAYLOAD = {
  id: CHIT_ID,
  name: 'Updated Shriram Chit 5L',
  face_value: '500000',
  duration_months: '20',
  member_count: '25',
  base_installment: '20000',
  commission_type: 'PERCENTAGE',
  commission_value: '5',
  commission_notes: '5% of face value',
  group_label: 'Custom Group A',
  company_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  start_date: '2025-06-01',
  notes: 'Updated chit notes',
  status: 'ACTIVE',
}

describe('updateChitAction — Phase 6A (Safe Edit Chit Configuration)', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    // Build chainable query builder
    const queryBuilder: any = {}
    queryBuilder.update = mockUpdate.mockReturnValue(queryBuilder)
    queryBuilder.insert = mockInsert.mockReturnValue(queryBuilder)
    queryBuilder.select = mockSelect.mockReturnValue(queryBuilder)
    queryBuilder.eq = mockEq.mockReturnValue(queryBuilder)
    queryBuilder.single = mockSingle.mockResolvedValue({ data: { id: CHIT_ID }, error: null })
    queryBuilder.maybeSingle = mockMaybeSingle.mockResolvedValue({ data: { id: CHIT_ID }, error: null })

    mockFrom.mockReturnValue(queryBuilder)
  })

  // 1. Successful edit of own chit
  it('successfully updates own chit and redirects to detail page', async () => {
    const formData = makeFormData(VALID_EDIT_PAYLOAD)

    await expect(updateChitAction({ status: 'idle' }, formData)).rejects.toThrow(
      `NEXT_REDIRECT:/chits/${CHIT_ID}`
    )

    expect(mockFrom).toHaveBeenCalledWith('chits')
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Updated Shriram Chit 5L',
        face_value: 500000,
        duration_months: 20,
        member_count: 25,
        base_installment: 20000,
        commission_type: 'PERCENTAGE',
        commission_value: 5,
        commission_notes: '5% of face value',
        group_label: 'Custom Group A',
        company_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        start_date: '2025-06-01',
        notes: 'Updated chit notes',
        status: 'ACTIVE',
      })
    )

    // Strictly verifies both id AND profile_id filters
    expect(mockEq).toHaveBeenCalledWith('id', CHIT_ID)
    expect(mockEq).toHaveBeenCalledWith('profile_id', USER_ID)

    // Cache revalidation
    expect(mockRevalidatePath).toHaveBeenCalledWith('/chits')
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/chits/${CHIT_ID}`)
    expect(mockRedirect).toHaveBeenCalledWith(`/chits/${CHIT_ID}`)
  })

  // 2. Cannot edit unauthenticated
  it('rejects update if user is not signed in', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    const formData = makeFormData(VALID_EDIT_PAYLOAD)

    const result = await updateChitAction({ status: 'idle' }, formData)

    expect(result.status).toBe('error')
    expect(result).toHaveProperty('message', 'You must be signed in to update a chit.')
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  // 3. Requires chit ID
  it('rejects update if chit id is missing', async () => {
    const payloadWithoutId = { ...VALID_EDIT_PAYLOAD }
    delete (payloadWithoutId as any).id
    const formData = makeFormData(payloadWithoutId)

    const result = await updateChitAction({ status: 'idle' }, formData)

    expect(result.status).toBe('error')
    expect(result).toHaveProperty('message', 'Chit ID is required.')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  // 4. Cannot edit another user's chit (RLS / ownership check)
  it('returns not found / permission error when trying to edit another user chit', async () => {
    // When profile_id doesn't match or chit doesn't exist, Supabase returns null row
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })
    const formData = makeFormData(VALID_EDIT_PAYLOAD)

    const result = await updateChitAction({ status: 'idle' }, formData)

    expect(result.status).toBe('error')
    expect(result).toHaveProperty(
      'message',
      'Chit not found or you do not have permission to edit it.'
    )
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  // 5. Invalid configuration rejected by existing schema
  it('rejects invalid financial configuration without updating DB', async () => {
    const invalidPayload = {
      ...VALID_EDIT_PAYLOAD,
      face_value: '-1000',      // Invalid: must be positive
      duration_months: '0',     // Invalid: must be positive
      member_count: '-5',       // Invalid: must be positive
      base_installment: '0',    // Invalid: must be > 0
      commission_type: 'INVALID_TYPE',
      commission_value: '-10',  // Invalid: cannot be negative
    }
    const formData = makeFormData(invalidPayload)

    const result = await updateChitAction({ status: 'idle' }, formData)

    expect(result.status).toBe('error')
    expect(result).toHaveProperty('message', 'Please fix the validation errors below.')
    if (result.status === 'error' && result.fieldErrors) {
      expect(result.fieldErrors.face_value).toBeDefined()
      expect(result.fieldErrors.duration_months).toBeDefined()
      expect(result.fieldErrors.member_count).toBeDefined()
      expect(result.fieldErrors.base_installment).toBeDefined()
      expect(result.fieldErrors.commission_type).toBeDefined()
      expect(result.fieldErrors.commission_value).toBeDefined()
    }
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  // 6. Existing auction_events are NOT modified by an edit
  it('never touches auction_events or source_messages tables during an edit', async () => {
    const formData = makeFormData(VALID_EDIT_PAYLOAD)

    try {
      await updateChitAction({ status: 'idle' }, formData)
    } catch {
      // Catch NEXT_REDIRECT
    }

    // Only 'chits' table should be accessed
    expect(mockFrom).toHaveBeenCalledWith('chits')
    expect(mockFrom).not.toHaveBeenCalledWith('auction_events')
    expect(mockFrom).not.toHaveBeenCalledWith('source_messages')
    expect(mockFrom).not.toHaveBeenCalledWith('ledger_entries')
  })

  // 7. Multiple chits remain independent
  it('updates only the targeted chit without affecting other chits', async () => {
    const targetChitId = 'target-chit-777'
    const formData = makeFormData({
      ...VALID_EDIT_PAYLOAD,
      id: targetChitId,
      name: 'Isolated Chit A',
      member_count: '15',
    })

    try {
      await updateChitAction({ status: 'idle' }, formData)
    } catch {
      // Catch NEXT_REDIRECT
    }

    // Assert update filter targets precisely targetChitId and not any other chit
    expect(mockEq).toHaveBeenCalledWith('id', targetChitId)
    expect(mockEq).toHaveBeenCalledWith('profile_id', USER_ID)
    expect(mockRedirect).toHaveBeenCalledWith(`/chits/${targetChitId}`)
  })

  // 8. Handles database constraint violation code 23514
  it('returns clean error message on DB check constraint violation (23514)', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: { code: '23514', message: 'check constraint violation' },
    })
    const formData = makeFormData(VALID_EDIT_PAYLOAD)

    const result = await updateChitAction({ status: 'idle' }, formData)

    expect(result.status).toBe('error')
    expect(result).toHaveProperty(
      'message',
      'A database constraint was violated. Check your values.'
    )
  })
})

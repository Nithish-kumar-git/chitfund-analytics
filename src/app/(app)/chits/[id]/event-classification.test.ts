import { describe, it, expect, vi, beforeEach } from 'vitest'
import { classifyAuctionEvent } from './winner-actions'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

describe('Event Classification — classifyAuctionEvent', () => {
  const mockUpdate = vi.fn()
  const mockEqProfile = vi.fn()
  const mockEqId = vi.fn()
  
  const mockSelect = vi.fn()
  const mockEqSelectProfile = vi.fn()
  const mockEqSelectId = vi.fn()
  const mockSingle = vi.fn()

  const mockSupabase = {
    auth: { getUser: vi.fn() },
    from: vi.fn((table: string) => {
      if (table === 'chits' || table === 'auction_events') {
        return {
          select: mockSelect.mockReturnValue({
            eq: mockEqSelectId.mockReturnValue({
              eq: mockEqSelectProfile.mockReturnValue({
                single: mockSingle
              })
            })
          }),
          update: mockUpdate.mockReturnValue({
            eq: mockEqId.mockReturnValue({
              eq: mockEqProfile.mockReturnValue({
                error: null
              })
            })
          })
        }
      }
      return {}
    }),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(createClient as any).mockResolvedValue(mockSupabase)
    
    mockUpdate.mockReturnValue({
      eq: mockEqId.mockReturnValue({
        eq: mockEqProfile.mockReturnValue({ error: null })
      })
    })

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'prof-1' } },
      error: null
    })
  })

  it('rejects unauthenticated users', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await classifyAuctionEvent({ chit_id: '123e4567-e89b-12d3-a456-426614174000', auction_event_id: '123e4567-e89b-12d3-a456-426614174001', new_event_type: 'NORMAL' })
    expect(res).toEqual({ success: false, error: 'Not authenticated' })
  })

  it('allows classifying UNKNOWN to SPECIAL_NO_AUCTION and sets won_by_us to null', async () => {
    // mock chit single
    mockSingle.mockResolvedValueOnce({ data: { id: 'chit-1', profile_id: 'prof-1' }, error: null })
    // mock event single
    mockSingle.mockResolvedValueOnce({ data: { id: 'evt-1', chit_id: 'chit-1', event_type: 'UNKNOWN', profile_id: 'prof-1' }, error: null })
    
    const res = await classifyAuctionEvent({
      chit_id: '123e4567-e89b-12d3-a456-426614174000',
      auction_event_id: '123e4567-e89b-12d3-a456-426614174001',
      new_event_type: 'SPECIAL_NO_AUCTION'
    })
    
    expect(res).toEqual({ success: true })
    expect(mockUpdate).toHaveBeenCalledWith({
      event_type: 'SPECIAL_NO_AUCTION',
      calculation_status: 'MANUAL_OVERRIDE',
      won_by_us: null
    })
    expect(revalidatePath).toHaveBeenCalled()
  })

  it('rejects classifying non-UNKNOWN events', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'chit-1', profile_id: 'prof-1' }, error: null })
    mockSingle.mockResolvedValueOnce({ data: { id: 'evt-1', chit_id: 'chit-1', event_type: 'NORMAL', profile_id: 'prof-1' }, error: null })
    
    const res = await classifyAuctionEvent({
      chit_id: '123e4567-e89b-12d3-a456-426614174000',
      auction_event_id: '123e4567-e89b-12d3-a456-426614174001',
      new_event_type: 'SPECIAL_NO_AUCTION'
    })
    
    expect(res).toEqual({ success: false, error: 'Only UNKNOWN events can be manually classified.' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('allows classifying UNKNOWN to NORMAL and does not touch won_by_us', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'chit-1', profile_id: 'prof-1' }, error: null })
    mockSingle.mockResolvedValueOnce({ data: { id: 'evt-1', chit_id: 'chit-1', event_type: 'UNKNOWN', profile_id: 'prof-1' }, error: null })
    
    const res = await classifyAuctionEvent({
      chit_id: '123e4567-e89b-12d3-a456-426614174000',
      auction_event_id: '123e4567-e89b-12d3-a456-426614174001',
      new_event_type: 'NORMAL'
    })
    
    expect(res).toEqual({ success: true })
    expect(mockUpdate).toHaveBeenCalledWith({
      event_type: 'NORMAL',
      calculation_status: 'MANUAL_OVERRIDE'
    })
  })
})

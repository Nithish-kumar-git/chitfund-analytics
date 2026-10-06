import { describe, it, expect, vi, beforeEach } from 'vitest'
import { correctLedgerEntry } from './ledger-actions'

// Phase 7F (atomicity): clearCashFlowVerification has been removed from
// ledger-actions.ts. Invalidation is now handled by the DB trigger
// trg_ledger_entries_invalidate_verification. No mock is needed here.

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn()
}))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn()
}))

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

describe('correctLedgerEntry', () => {
  let mockSupabase: any
  
  const CHIT_ID = '123e4567-e89b-12d3-a456-426614174000'
  const ENTRY_ID = '123e4567-e89b-12d3-a456-426614174001'

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } })
      },
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      maybeSingle: vi.fn(),
      insert: vi.fn(),
      update: vi.fn().mockReturnThis()
    }
    ;(createClient as any).mockResolvedValue(mockSupabase)
  })

  it('rejects unauthenticated users', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await correctLedgerEntry({
      chit_id: CHIT_ID,
      original_entry_id: ENTRY_ID,
      new_amount: 100
    })
    expect(res).toEqual({ success: false, error: 'Not authenticated' })
  })

  it('rejects if original entry is not found', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } })
    const res = await correctLedgerEntry({
      chit_id: CHIT_ID,
      original_entry_id: ENTRY_ID,
      new_amount: 100
    })
    expect(res).toEqual({ success: false, error: 'Original entry not found' })
  })

  it('enforces ownership (RLS contract)', async () => {
    mockSupabase.single.mockResolvedValueOnce({ 
      data: { id: ENTRY_ID, profile_id: 'other-user', chit_id: CHIT_ID }, 
      error: null 
    })
    const res = await correctLedgerEntry({
      chit_id: CHIT_ID,
      original_entry_id: ENTRY_ID,
      new_amount: 100
    })
    expect(res).toEqual({ success: false, error: 'Permission denied' })
  })

  it('rejects invalid/negative amounts', async () => {
    const res = await correctLedgerEntry({
      chit_id: CHIT_ID,
      original_entry_id: ENTRY_ID,
      new_amount: -50
    })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Invalid input data/)
  })

  it('creates correction and preserves original entry', async () => {
    mockSupabase.single.mockResolvedValueOnce({ 
      data: { 
        id: ENTRY_ID, 
        profile_id: 'user-1', 
        chit_id: CHIT_ID,
        auction_event_id: 'auction-123',
        entry_type: 'INSTALLMENT_PAID',
        amount: 200,
        transaction_date: '2026-10-01'
      }, 
      error: null 
    })
    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null }) // no existing correction
    mockSupabase.insert.mockResolvedValueOnce({ error: null })

    const res = await correctLedgerEntry({
      chit_id: CHIT_ID,
      original_entry_id: ENTRY_ID,
      new_amount: 150,
      notes: 'Typo correction'
    })

    expect(res).toEqual({ success: true })
    
    // Verifies original is preserved because insert does not delete or update
    expect(mockSupabase.insert).toHaveBeenCalledWith({
      profile_id: 'user-1',
      chit_id: CHIT_ID,
      auction_event_id: 'auction-123',
      entry_type: 'MANUAL_CORRECTION',
      amount: 150,
      transaction_date: '2026-10-01',
      corrects_entry_id: ENTRY_ID,
      notes: 'Typo correction'
    })
    expect(revalidatePath).toHaveBeenCalledWith(`/chits/${CHIT_ID}`)
  })

  it('rejects a second correction of the same original entry', async () => {
    mockSupabase.single.mockResolvedValueOnce({ 
      data: { id: ENTRY_ID, profile_id: 'user-1', chit_id: CHIT_ID }, 
      error: null 
    })
    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: { id: 'existing-correction' } })

    const res = await correctLedgerEntry({
      chit_id: CHIT_ID,
      original_entry_id: ENTRY_ID,
      new_amount: 150
    })

    expect(res).toEqual({ success: false, error: 'Entry has already been corrected' })
  })

  it('rejects correcting a MANUAL_CORRECTION itself', async () => {
    mockSupabase.single.mockResolvedValueOnce({ 
      data: { id: ENTRY_ID, profile_id: 'user-1', chit_id: CHIT_ID, entry_type: 'MANUAL_CORRECTION' }, 
      error: null 
    })

    const res = await correctLedgerEntry({
      chit_id: CHIT_ID,
      original_entry_id: ENTRY_ID,
      new_amount: 150
    })

    expect(res).toEqual({ success: false, error: 'Cannot correct a correction entry' })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { addToQueue, confirmFromQueue, dismissFromQueue } from './actions'
import * as ingest from '@/lib/ingestion/ingest'
import * as persistence from '@/lib/ingestion/persistence'
import * as supabaseServer from '@/lib/supabase/server'
import * as nextCache from 'next/cache'

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn()
}))

vi.mock('@/lib/ingestion/ingest', () => ({
  processWhatsAppMessage: vi.fn()
}))

vi.mock('@/lib/ingestion/persistence', () => ({
  persistConfirmedIngestion: vi.fn()
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn()
}))

describe('Queue Actions', () => {
  let mockSupabase: any
  let mockUser = { id: 'user1' }

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockSupabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }) },
      from: vi.fn()
    }
    vi.mocked(supabaseServer.createClient).mockResolvedValue(mockSupabase as any)
  })

  const setupMockSupabaseFrom = (overrides: Record<string, any> = {}) => {
    mockSupabase.from.mockImplementation((table: string) => {
      const defaultTableMock = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        single: vi.fn().mockResolvedValue({ data: null, error: null })
      }
      return { ...defaultTableMock, ...(overrides[table] || {}) }
    })
  }

  describe('addToQueue', () => {
    it('1. PENDING queue insertion', async () => {
      setupMockSupabaseFrom({
        chits: { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'chit1' }, error: null }) },
        source_messages: {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockResolvedValue({ error: null })
        }
      })

      const res = await addToQueue('chit1', 'Test raw text')
      expect(res.success).toBe(true)
      
      const insertCall = mockSupabase.from('source_messages').insert.mock.calls[0][0]
      expect(insertCall).toMatchObject({
        parse_status: 'PENDING',
        chit_id: 'chit1',
        raw_text: 'Test raw text',
        profile_id: 'user1'
      })
    })

    it('2. duplicate source message is rejected', async () => {
      setupMockSupabaseFrom({
        chits: { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'chit1' }, error: null }) },
        source_messages: {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'existing-id' }, error: null }),
          insert: vi.fn()
        }
      })

      const res = await addToQueue('chit1', 'Test raw text')
      expect(res.success).toBe(false)
      expect(res.error).toContain('Duplicate message')
      expect(mockSupabase.from('source_messages').insert).not.toHaveBeenCalled()
    })

    it('3. queue ownership/security check fails', async () => {
      setupMockSupabaseFrom({
        chits: { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }) }
      })

      const res = await addToQueue('chit1', 'Test raw text')
      expect(res.success).toBe(false)
      expect(res.error).toContain('Chit not found or unauthorized')
    })
  })

  describe('dismissFromQueue', () => {
    it('4. dismiss changes source_message to SUPERSEDED and creates no auction_event', async () => {
      const updateMock = vi.fn().mockResolvedValue({ error: null })
      setupMockSupabaseFrom({
        source_messages: {
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: updateMock }) })
        }
      })

      const res = await dismissFromQueue('sm-1', 'chit1')
      expect(res.success).toBe(true)
      expect(mockSupabase.from('source_messages').update).toHaveBeenCalledWith({ parse_status: 'SUPERSEDED' })
      expect(vi.mocked(persistence.persistConfirmedIngestion)).not.toHaveBeenCalled()
    })
  })

  describe('confirmFromQueue', () => {
    const setupConfirmContext = () => {
      setupMockSupabaseFrom({
        source_messages: {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { raw_text: 'text', parse_status: 'PENDING', received_at: '2023-01-01T00:00:00Z' }, error: null }),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) // default no dupes
        },
        chits: {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { face_value: 100000, base_installment: 10000, member_count: 10 }, error: null })
        },
        auction_events: {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
        }
      })
    }

    it('5. confirmation creates exactly one auction_event and updates EXISTING source_message', async () => {
      setupConfirmContext()

      vi.mocked(ingest.processWhatsAppMessage).mockReturnValue({
        status: 'READY_FOR_CONFIRMATION',
        input: { profile_id: 'user1', chit_id: 'chit1', raw_text: 'text', round_number: 1 },
        hash: 'hash1',
        warnings: [],
        parse_result: { event_type: 'NORMAL', metadata: { round_number: 1 }, fields: { stated_payment: 8000 } } as any,
        proposed_calculation_status: 'VERIFIED_FORMULA'
      } as any)

      vi.mocked(persistence.persistConfirmedIngestion).mockResolvedValue({ success: true })

      const res = await confirmFromQueue('sm-1', 'chit1')
      expect(res.success).toBe(true)

      const persistPayload = vi.mocked(persistence.persistConfirmedIngestion).mock.calls[0][1]
      expect(persistPayload.existing_source_message_id).toBe('sm-1')
      expect(persistPayload.parse_status).toBe('PARSED')
      expect(persistPayload.auction_event?.round_number).toBe(1)
    })

    it('6. duplicate round is rejected', async () => {
      setupConfirmContext()
      
      // Override auction_events to simulate existing round
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'auction_events') return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'ae-exist' }, error: null }) }
        if (table === 'source_messages') return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { raw_text: 'text', parse_status: 'PENDING' }, error: null }) }
        if (table === 'chits') return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { face_value: 100 }, error: null }) }
        return {}
      })

      vi.mocked(ingest.processWhatsAppMessage).mockReturnValue({
        status: 'READY_FOR_CONFIRMATION',
        input: { profile_id: 'user1', chit_id: 'chit1', raw_text: 'text', round_number: 1 },
        hash: 'hash1',
        warnings: [],
        parse_result: { event_type: 'NORMAL', metadata: { round_number: 1 }, fields: {} } as any,
        proposed_calculation_status: 'VERIFIED_FORMULA'
      } as any)

      const res = await confirmFromQueue('sm-1', 'chit1')
      expect(res.success).toBe(false)
      expect(res.error).toContain('already exists')
    })

    it('7. invalid round number is rejected', async () => {
      setupConfirmContext()

      vi.mocked(ingest.processWhatsAppMessage).mockReturnValue({
        status: 'READY_FOR_CONFIRMATION',
        input: { profile_id: 'user1', chit_id: 'chit1', raw_text: 'text' }, // no round number
        hash: 'hash1',
        warnings: [],
        parse_result: { event_type: 'NORMAL', metadata: {}, fields: {} } as any, // no round number
        proposed_calculation_status: 'VERIFIED_FORMULA'
      } as any)

      const res = await confirmFromQueue('sm-1', 'chit1') // no manual round
      expect(res.success).toBe(false)
      expect(res.error).toContain('Round number is required')
    })

    it('8. server re-validation occurs during confirmation (rejects PARSE_FAILED)', async () => {
      setupConfirmContext()

      vi.mocked(ingest.processWhatsAppMessage).mockReturnValue({
        status: 'PARSE_FAILED',
        input: { profile_id: 'user1', chit_id: 'chit1', raw_text: 'text' },
        hash: 'hash1',
        warnings: [],
        parse_result: {} as any
      } as any)

      const res = await confirmFromQueue('sm-1', 'chit1', 1)
      expect(res.success).toBe(false)
      expect(res.error).toContain('Cannot confirm unparseable message')
      expect(vi.mocked(persistence.persistConfirmedIngestion)).not.toHaveBeenCalled()
    })
  })
})

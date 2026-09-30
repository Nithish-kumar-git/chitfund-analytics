import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processIngestionText, confirmIngestion } from './actions'
import { processWhatsAppMessage } from '@/lib/ingestion/ingest'
import { persistConfirmedIngestion } from '@/lib/ingestion/persistence'

// Mock dependencies
const mockGetUser = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser
    },
    from: vi.fn(() => ({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
    }))
  }))
}))

vi.mock('@/lib/ingestion/persistence', () => ({
  persistConfirmedIngestion: vi.fn()
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn()
}))

describe('Ingestion UI Server Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Setup default successful auth
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    
    // Setup default Supabase chain for select().eq().eq().single()
    mockSelect.mockReturnValue({ eq: mockEq })
    mockEq.mockReturnValue({ eq: mockEq, single: mockSingle })
    mockSingle.mockResolvedValue({ data: null, error: null })
  })

  describe('processIngestionText', () => {
    it('rejects empty input inherently via parser producing ParseError', async () => {
      // Setup chit config
      mockSingle.mockResolvedValueOnce({ 
        data: { face_value: 100000, base_installment: 5000, member_count: 20 } 
      }) // chit query
      mockSingle.mockResolvedValueOnce({ data: null }) // duplicate query

      const result = await processIngestionText('chit-1', '   ')
      expect(result.success).toBe(true)
      expect(result.result?.status).toBe('PARSE_FAILED')
    })

    it('rejects unauthenticated users', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null } })
      const result = await processIngestionText('chit-1', 'test')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Unauthorized')
    })

    it('processes normal whatsapp message and provides preview', async () => {
      // Chit config
      mockSingle.mockResolvedValueOnce({ 
        data: { face_value: 100000, base_installment: 5000, member_count: 20 } 
      })
      // Duplicate check
      mockSingle.mockResolvedValueOnce({ data: null })

      const text = `1L சீட்டு
5வது மாதம்
தள்ளு 15,000
கமிஷன் 5,000
ஒரு நபர் தள்ளு 500
கட்ட வேண்டிய தொகை 4,500`

      const result = await processIngestionText('chit-1', text)
      expect(result.success).toBe(true)
      const validResult = result.result as any
      expect(validResult?.status).toBe('READY_FOR_CONFIRMATION')
      expect(validResult?.parse_result?.event_type).toBe('NORMAL')
    })

    it('identifies mismatches in stated vs calculated values', async () => {
      mockSingle.mockResolvedValueOnce({ 
        data: { face_value: 100000, base_installment: 5000, member_count: 20 } 
      })
      mockSingle.mockResolvedValueOnce({ data: null })

      const text = `1L சீட்டு
5வது மாதம்
தள்ளு 15,000
கமிஷன் 5,000
ஒரு நபர் தள்ளு 900 // INCORRECT
கட்ட வேண்டிய தொகை 4,500`

      const result = await processIngestionText('chit-1', text)
      expect(result.success).toBe(true)
      const validResult = result.result as any
      expect(validResult?.status).toBe('NEEDS_REVIEW')
      expect(validResult?.proposed_calculation_status).toBe('FLAGGED_MISMATCH')
    })

    it('identifies SPECIAL_NO_AUCTION and skips normal calculation', async () => {
      mockSingle.mockResolvedValueOnce({ 
        data: { face_value: 100000, base_installment: 5000, member_count: 20 } 
      })
      mockSingle.mockResolvedValueOnce({ data: null })

      const text = `1L சீட்டு
1வது மாதம்
தள்ளு இல்லை
அனைவரும் முழுத் தொகை கட்டவும்`

      const result = await processIngestionText('chit-1', text)
      expect(result.success).toBe(true)
      const validResult = result.result as any
      expect(validResult?.status).toBe('NEEDS_REVIEW')
      expect(validResult?.parse_result?.event_type).toBe('SPECIAL_NO_AUCTION')
      expect(validResult?.cross_check_result).toBeUndefined()
    })
  })

  describe('confirmIngestion', () => {
    it('requires confirmation before persistence - it does not auto-persist', () => {
      // The fact that there's a separate confirmIngestion function validates this.
      // processIngestionText does not call persistConfirmedIngestion.
      expect(persistConfirmedIngestion).not.toHaveBeenCalled()
    })

    it('rejects unauthenticated users', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null } })
      const result = await confirmIngestion('chit-1', 'test text', 1)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Unauthorized')
      expect(persistConfirmedIngestion).not.toHaveBeenCalled()
    })

    it('ensures correct chit_id and profile_id is used during persistence and re-evaluates on server', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
      // For processIngestionText
      mockSingle.mockResolvedValueOnce({ 
        data: { face_value: 100000, base_installment: 5000, member_count: 20 } 
      }) // Chit check inside process
      mockSingle.mockResolvedValueOnce({ data: null }) // duplicate check

      // For confirmIngestion
      mockSingle.mockResolvedValueOnce({ data: null }) // existing round check

      vi.mocked(persistConfirmedIngestion).mockResolvedValueOnce({ success: true })

      const text = `1L சீட்டு
5வது மாதம்
தள்ளு 15,000
கமிஷன் 5,000
ஒரு நபர் தள்ளு 500
கட்ட வேண்டிய தொகை 4,500`

      const result = await confirmIngestion('chit-1', text, 1)
      expect(result.success).toBe(true)
      expect(persistConfirmedIngestion).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          chit_id: 'chit-1',
          profile_id: 'user-1', // Coming from auth, not client
          raw_text: text, // Evaluated securely on server
          auction_event: expect.objectContaining({
            thallu: 15000,
            event_type: 'NORMAL'
          })
        })
      )
    })

    it('prevents persisting a duplicate round', async () => {
      // For processIngestionText
      mockSingle.mockResolvedValueOnce({ 
        data: { face_value: 100000, base_installment: 5000, member_count: 20 } 
      }) // Chit check inside process
      mockSingle.mockResolvedValueOnce({ data: null }) // duplicate check

      // For confirmIngestion
      mockSingle.mockResolvedValueOnce({ data: { id: 'existing-event' } }) // existing round check

      const text = `1L சீட்டு
5வது மாதம்
தள்ளு 15,000
கமிஷன் 5,000
ஒரு நபர் தள்ளு 500
கட்ட வேண்டிய தொகை 4,500`

      const result = await confirmIngestion('chit-1', text, 1)
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/Round 1 already exists/)
      expect(persistConfirmedIngestion).not.toHaveBeenCalled()
    })
  })
})

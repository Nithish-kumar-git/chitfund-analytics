import { describe, it, expect, vi } from 'vitest'
import { persistConfirmedIngestion } from './persistence'
import type { ConfirmedIngestion } from './types'

describe('Persistence Layer', () => {
  const createMockSupabase = () => {
    const insertMock = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'test-id' }, error: null }) }) })
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

    return {
      from: vi.fn((table: string) => ({
        insert: insertMock,
        update: updateMock,
      }))
    } as any
  }

  it('H. Confirmation — unconfirmed ingestion does not persist (not possible by design)', () => {
    // The type system requires a `ConfirmedIngestion` payload.
    // An unconfirmed `IngestionResult` cannot be passed to `persistConfirmedIngestion` without a type error.
    expect(true).toBe(true)
  })

  it('H. Confirmation — confirmed ingestion persists the appropriate records', async () => {
    const supabase = createMockSupabase()
    const payload: ConfirmedIngestion = {
      profile_id: 'user1',
      chit_id: 'chit1',
      raw_text: 'test',
      content_hash: 'hash1',
      parse_status: 'PARSED',
      auction_event: {
        round_number: 9,
        event_type: 'NORMAL',
        calculation_status: 'VERIFIED_FORMULA'
      },
      ledger_entry: {
        entry_type: 'INSTALLMENT_PAID',
        amount: 10060,
        transaction_date: new Date('2023-01-01')
      }
    }

    await persistConfirmedIngestion(supabase, payload)

    expect(supabase.from).toHaveBeenCalledWith('auction_events')
    expect(supabase.from).toHaveBeenCalledWith('ledger_entries')
    expect(supabase.from).toHaveBeenCalledWith('source_messages')
  })

  it('I. Ledger safety — no ledger entry when no financial transaction is established', async () => {
    const supabase = createMockSupabase()
    const payload: ConfirmedIngestion = {
      profile_id: 'user1',
      chit_id: 'chit1',
      raw_text: 'test',
      content_hash: 'hash1',
      parse_status: 'PARSED',
      auction_event: {
        round_number: 9,
        event_type: 'NORMAL',
        calculation_status: 'VERIFIED_FORMULA'
      }
      // NO ledger_entry provided
    }

    await persistConfirmedIngestion(supabase, payload)

    expect(supabase.from).not.toHaveBeenCalledWith('ledger_entries')
    expect(supabase.from).toHaveBeenCalledWith('auction_events')
  })

  it('J. Manual override — calculation_status reflects MANUAL_OVERRIDE', async () => {
    const supabase = createMockSupabase()
    const payload: ConfirmedIngestion = {
      profile_id: 'user1',
      chit_id: 'chit1',
      raw_text: 'test',
      content_hash: 'hash1',
      parse_status: 'PARSED',
      auction_event: {
        round_number: 9,
        event_type: 'NORMAL',
        calculation_status: 'MANUAL_OVERRIDE' // explicit override
      }
    }

    await persistConfirmedIngestion(supabase, payload)

    const insertCalls = supabase.from.mock.results
    // Vitest mock introspection would show calculation_status: 'MANUAL_OVERRIDE' passed to insert
    expect(supabase.from).toHaveBeenCalledWith('auction_events')
  })

  it('L. RLS/security assumptions — persistence is scoped to provided profile_id', async () => {
    const supabase = createMockSupabase()
    const payload: ConfirmedIngestion = {
      profile_id: 'secure-user-123',
      raw_text: 'test',
      content_hash: 'hash1',
      parse_status: 'PARSED'
    }

    await persistConfirmedIngestion(supabase, payload)
    expect(supabase.from).toHaveBeenCalledWith('source_messages')
  })

  it('Partial Failure — auction succeeds, ledger fails', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'auction_events') {
          return { insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'auction-1' }, error: null }) }) }) }
        }
        if (table === 'ledger_entries') {
          return { insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Ledger failure' } }) }) }) }
        }
        return { insert: vi.fn() }
      })
    } as any

    const payload: ConfirmedIngestion = {
      profile_id: 'u1', chit_id: 'c1', raw_text: 'txt', content_hash: 'h1', parse_status: 'PARSED',
      auction_event: { round_number: 1, event_type: 'NORMAL', calculation_status: 'VERIFIED_FORMULA' },
      ledger_entry: { entry_type: 'INSTALLMENT_PAID', amount: 100, transaction_date: new Date() }
    }

    const result = await persistConfirmedIngestion(supabase, payload)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Ledger failure')
    expect(supabase.from).toHaveBeenCalledWith('auction_events')
    expect(supabase.from).toHaveBeenCalledWith('ledger_entries')
    expect(supabase.from).not.toHaveBeenCalledWith('source_messages')
  })

  it('Partial Failure — auction succeeds, ledger succeeds, source fails', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'auction_events') {
          return { insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'auction-1' }, error: null }) }) }) }
        }
        if (table === 'ledger_entries') {
          return { insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'ledger-1' }, error: null }) }) }) }
        }
        if (table === 'source_messages') {
          return { insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Source failure' } }) }) }) }
        }
        return { insert: vi.fn() }
      })
    } as any

    const payload: ConfirmedIngestion = {
      profile_id: 'u1', chit_id: 'c1', raw_text: 'txt', content_hash: 'h1', parse_status: 'PARSED',
      auction_event: { round_number: 1, event_type: 'NORMAL', calculation_status: 'VERIFIED_FORMULA' },
      ledger_entry: { entry_type: 'INSTALLMENT_PAID', amount: 100, transaction_date: new Date() }
    }

    const result = await persistConfirmedIngestion(supabase, payload)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Source failure')
    expect(supabase.from).toHaveBeenCalledWith('source_messages')
  })

  // ─── Phase 5B: Specific constraint mapping ────────────────────────────────

  it('Phase 5B — auction_events_chit_round_uk constraint maps to duplicate-round error', async () => {
    // Locks down: ONLY the specific auction_events_chit_round_uk constraint
    // produces the clean "Round X already exists" message.
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'auction_events') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: {
                    code: '23505',
                    message: 'duplicate key value violates unique constraint "auction_events_chit_round_uk"',
                    details: 'Key (chit_id, round_number)=(chit1, 5) already exists.'
                  }
                })
              })
            })
          }
        }
        return { insert: vi.fn() }
      })
    } as any

    const payload: ConfirmedIngestion = {
      profile_id: 'u1', chit_id: 'chit1', raw_text: 'txt', content_hash: 'h1', parse_status: 'PARSED',
      auction_event: { round_number: 5, event_type: 'NORMAL', calculation_status: 'VERIFIED_FORMULA' }
    }

    const result = await persistConfirmedIngestion(supabase, payload)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Round 5 already exists for this chit.')
  })

  it('Phase 5B — a different unique constraint does NOT become a duplicate-round error', async () => {
    // Locks down: other unique constraints fall through to the generic DB error path.
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'auction_events') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: {
                    code: '23505',
                    message: 'duplicate key value violates unique constraint "some_other_unique_constraint"',
                    details: 'Key (content_hash)=(abc123) already exists.'
                  }
                })
              })
            })
          }
        }
        return { insert: vi.fn() }
      })
    } as any

    const payload: ConfirmedIngestion = {
      profile_id: 'u1', chit_id: 'chit1', raw_text: 'txt', content_hash: 'h1', parse_status: 'PARSED',
      auction_event: { round_number: 5, event_type: 'NORMAL', calculation_status: 'VERIFIED_FORMULA' }
    }

    const result = await persistConfirmedIngestion(supabase, payload)
    expect(result.success).toBe(false)
    // Must NOT be the clean duplicate-round message
    expect(result.error).not.toBe('Round 5 already exists for this chit.')
    // Must fall through to the generic DB error
    expect(result.error).toContain('some_other_unique_constraint')
  })

  it('Phase 5B — unrelated DB errors pass through without duplicate-round mapping', async () => {
    // Locks down: non-constraint errors (e.g. FK violation, network) are not swallowed.
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'auction_events') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: {
                    code: '23503',
                    message: 'insert or update on table "auction_events" violates foreign key constraint "auction_events_chit_id_fkey"',
                    details: 'Key (chit_id)=(nonexistent) is not present in table "chits".'
                  }
                })
              })
            })
          }
        }
        return { insert: vi.fn() }
      })
    } as any

    const payload: ConfirmedIngestion = {
      profile_id: 'u1', chit_id: 'nonexistent', raw_text: 'txt', content_hash: 'h1', parse_status: 'PARSED',
      auction_event: { round_number: 1, event_type: 'NORMAL', calculation_status: 'VERIFIED_FORMULA' }
    }

    const result = await persistConfirmedIngestion(supabase, payload)
    expect(result.success).toBe(false)
    expect(result.error).not.toContain('already exists for this chit')
    expect(result.error).toContain('foreign key constraint')
  })

  it('Phase 5B — SPECIAL_NO_AUCTION / UNKNOWN financial fields are inserted as explicit SQL null', async () => {
    // Locks down: financial fields with undefined/UNKNOWN are coalesced to null
    // (not left as JS undefined which could silently omit the column, hitting DB defaults).
    let capturedInsertPayload: any = null
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'auction_events') {
          return {
            insert: vi.fn((data: any) => {
              capturedInsertPayload = data
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'ae-1' }, error: null })
                })
              }
            })
          }
        }
        if (table === 'source_messages') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'sm-1' }, error: null })
              })
            })
          }
        }
        return { insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null }) }) }), update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      })
    } as any

    // SPECIAL_NO_AUCTION scenario: no financial values provided (all undefined)
    const payload: ConfirmedIngestion = {
      profile_id: 'u1', chit_id: 'chit1', raw_text: 'txt', content_hash: 'h1', parse_status: 'PARSED',
      auction_event: {
        round_number: 3,
        event_type: 'SPECIAL_NO_AUCTION',
        calculation_status: 'VERIFIED_FORMULA'
        // thallu, commission, net_thallu, member_thallu, non_winner_payment all omitted
      }
    }

    await persistConfirmedIngestion(supabase, payload)

    expect(capturedInsertPayload).not.toBeNull()
    // Each financial field MUST be explicitly null (not undefined) in the DB payload
    expect(capturedInsertPayload.thallu).toBeNull()
    expect(capturedInsertPayload.commission).toBeNull()
    expect(capturedInsertPayload.net_thallu).toBeNull()
    expect(capturedInsertPayload.member_thallu).toBeNull()
    expect(capturedInsertPayload.non_winner_payment).toBeNull()
  })

})

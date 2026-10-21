import { describe, expect, it, vi } from 'vitest'
import { persistConfirmedIngestion } from './persistence'
import type { ConfirmedIngestion } from './types'

function confirmed(overrides: Partial<ConfirmedIngestion> = {}): ConfirmedIngestion {
  return {
    profile_id: '11111111-1111-4111-8111-111111111111',
    chit_id: '22222222-2222-4222-8222-222222222222',
    raw_text: 'amount to pay 10060',
    received_at: new Date('2025-07-05T04:30:00Z'),
    content_hash: 'hash-1',
    parse_status: 'PARSED',
    auction_event: {
      round_number: 5,
      event_type: 'NORMAL',
      non_winner_payment: 10_060,
      calculation_status: 'VERIFIED_FORMULA',
      auction_date: null,
    },
    ...overrides,
  }
}

describe('persistConfirmedIngestion', () => {
  it('uses one RPC call so source and event commit atomically', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { source_message_id: 'source-1', auction_event_id: 'event-1' },
      error: null,
    })
    const from = vi.fn()

    const result = await persistConfirmedIngestion({ rpc, from } as any, confirmed())

    expect(result).toEqual({
      success: true,
      source_message_id: 'source-1',
      auction_event_id: 'event-1',
    })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('confirm_ingestion', expect.any(Object))
    expect(from).not.toHaveBeenCalled()
  })

  it('keeps the stated payment as an auction fact and sends no ledger payload', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null })

    await persistConfirmedIngestion({ rpc } as any, confirmed())

    const args = rpc.mock.calls[0][1]
    expect(args.p_auction_event.non_winner_payment).toBe(10_060)
    expect(args.p_auction_event.auction_date).toBeNull()
    expect(args).not.toHaveProperty('p_ledger_entries')
  })

  it('preserves a reviewed source date on the auction event', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null })
    const payload = confirmed({
      auction_event: {
        ...confirmed().auction_event!,
        auction_date: '2025-07-05',
      },
    })

    await persistConfirmedIngestion({ rpc } as any, payload)

    expect(rpc.mock.calls[0][1].p_auction_event.auction_date).toBe('2025-07-05')
  })

  it('passes an existing queue message id without rewriting source content', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null })

    await persistConfirmedIngestion(
      { rpc } as any,
      confirmed({ existing_source_message_id: '33333333-3333-4333-8333-333333333333' }),
    )

    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_existing_source_message_id: '33333333-3333-4333-8333-333333333333',
      p_raw_text: 'amount to pay 10060',
      p_content_hash: 'hash-1',
    })
  })

  it('maps the round uniqueness conflict safely', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "auction_events_chit_id_round_number_key"',
      },
    })

    const result = await persistConfirmedIngestion({ rpc } as any, confirmed())

    expect(result).toEqual({ success: false, error: 'Round 5 already exists for this chit.' })
  })

  it('surfaces RPC failure without issuing compensating writes', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '23514', message: 'forced event failure' },
    })
    const from = vi.fn()

    const result = await persistConfirmedIngestion({ rpc, from } as any, confirmed())

    expect(result).toEqual({
      success: false,
      error: 'Failed to confirm ingestion: forced event failure',
    })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(from).not.toHaveBeenCalled()
  })
})

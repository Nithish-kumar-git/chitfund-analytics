import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConfirmedIngestion } from './types'

export interface PersistenceResult {
  success: boolean
  source_message_id?: string
  auction_event_id?: string
  error?: string
}

/**
 * Persists a user-confirmed ingestion into the database.
 *
 * The confirm_ingestion RPC persists the source message and auction event in one
 * PostgreSQL transaction. It deliberately does not create ledger entries:
 * imported amounts are expected/event facts until the user explicitly records
 * an actual payment or payout through the cash-flow actions.
 */
export async function persistConfirmedIngestion(
  supabase: SupabaseClient,
  confirmed: ConfirmedIngestion
): Promise<PersistenceResult> {
  try {
    if (!confirmed.chit_id || !confirmed.auction_event) {
      return { success: false, error: 'Confirmed ingestion requires a chit and auction event.' }
    }

    const auctionEvent = {
      round_number: confirmed.auction_event.round_number,
      event_type: confirmed.auction_event.event_type,
      thallu: confirmed.auction_event.thallu ?? null,
      commission: confirmed.auction_event.commission ?? null,
      net_thallu: confirmed.auction_event.net_thallu ?? null,
      member_thallu: confirmed.auction_event.member_thallu ?? null,
      non_winner_payment: confirmed.auction_event.non_winner_payment ?? null,
      won_by_us: confirmed.auction_event.won_by_us ?? null,
      our_payout_amount: confirmed.auction_event.our_payout_amount ?? null,
      calculation_status: confirmed.auction_event.calculation_status,
      auction_date: confirmed.auction_event.auction_date ?? null,
      notes: confirmed.auction_event.notes ?? null,
    }

    const { data, error } = await supabase.rpc('confirm_ingestion', {
      p_chit_id: confirmed.chit_id,
      p_raw_text: confirmed.raw_text,
      p_received_at: confirmed.received_at?.toISOString() ?? null,
      p_content_hash: confirmed.content_hash,
      p_parse_status: confirmed.parse_status,
      p_existing_source_message_id: confirmed.existing_source_message_id ?? null,
      p_auction_event: auctionEvent,
    } as any)

    if (error) {
      const errorText = `${error.message || ''} ${error.details || ''}`
      if (
        error.code === '23505'
        && errorText.includes('auction_events_chit_id_round_number_key')
      ) {
        return {
          success: false,
          error: `Round ${confirmed.auction_event.round_number} already exists for this chit.`,
        }
      }

      return { success: false, error: `Failed to confirm ingestion: ${error.message}` }
    }

    const result = data as { source_message_id?: string; auction_event_id?: string } | null

    return {
      success: true,
      source_message_id: result?.source_message_id,
      auction_event_id: result?.auction_event_id,
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Unknown persistence error' }
  }
}

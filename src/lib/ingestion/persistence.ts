import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConfirmedIngestion } from './types'

export interface PersistenceResult {
  success: boolean
  source_message_id?: string
  auction_event_id?: string
  ledger_entry_id?: string
  error?: string
}

/**
 * Persists a user-confirmed ingestion into the database.
 *
 * TRANSACTION LIMITATION:
 * The current Supabase schema does not have a custom RPC for atomic ingestion.
 * Therefore, we insert sequentially:
 * 1. auction_events (if present)
 * 2. ledger_entries (if present, linking to auction)
 * 3. source_messages (linking to auction)
 *
 * If an intermediate step fails, it could result in partial data (e.g. auction saved
 * but source_message failed). In a production environment, an RPC function should
 * be created to wrap these three inserts in a single Postgres transaction.
 */
export async function persistConfirmedIngestion(
  supabase: SupabaseClient,
  confirmed: ConfirmedIngestion
): Promise<PersistenceResult> {
  try {
    let auctionEventId: string | undefined
    let ledgerEntryId: string | undefined

    // 1. Insert auction event if confirmed
    if (confirmed.auction_event && confirmed.chit_id) {
      const { data: auction, error: auctionError } = await supabase
        .from('auction_events')
        .insert({
          profile_id: confirmed.profile_id,
          chit_id: confirmed.chit_id,
          round_number: confirmed.auction_event.round_number,
          event_type: confirmed.auction_event.event_type,
          thallu: confirmed.auction_event.thallu ?? null,
          commission: confirmed.auction_event.commission ?? null,
          net_thallu: confirmed.auction_event.net_thallu ?? null,
          member_thallu: confirmed.auction_event.member_thallu ?? null,
          non_winner_payment: confirmed.auction_event.non_winner_payment ?? null,
          won_by_us: confirmed.auction_event.won_by_us,
          our_payout_amount: confirmed.auction_event.our_payout_amount,
          calculation_status: confirmed.auction_event.calculation_status,
          auction_date: confirmed.auction_event.auction_date,
          notes: confirmed.auction_event.notes
        })
        .select('id')
        .single()

      if (auctionError) {
        const errorString = `${auctionError.message || ''} ${auctionError.details || ''}`
        if (auctionError.code === '23505' && errorString.includes('auction_events_chit_round_uk')) {
          return { success: false, error: `Round ${confirmed.auction_event.round_number} already exists for this chit.` }
        }
        return { success: false, error: `Failed to insert auction_event: ${auctionError.message}` }
      }
      auctionEventId = auction.id
    }

    // 2. Insert ledger entries if provided
    // Supports both the new `ledger_entries` array and the deprecated `ledger_entry` single field.
    const entries = confirmed.ledger_entries ?? (confirmed.ledger_entry ? [confirmed.ledger_entry] : [])

    if (entries.length > 0 && confirmed.chit_id) {
      for (const entry of entries) {
        const { data: ledger, error: ledgerError } = await supabase
          .from('ledger_entries')
          .insert({
            profile_id: confirmed.profile_id,
            chit_id: confirmed.chit_id,
            auction_event_id: auctionEventId,
            entry_type: entry.entry_type,
            amount: entry.amount,
            transaction_date: entry.transaction_date,
            notes: entry.notes
          })
          .select('id')
          .single()

        if (ledgerError) {
          // Not perfectly safe without RPC, but surface the error immediately.
          return { success: false, error: `Failed to insert ledger_entry: ${ledgerError.message}` }
        }
        ledgerEntryId = ledger.id
      }
    }

    // 3. Insert or update source message
    let sourceMessageId = confirmed.existing_source_message_id

    if (sourceMessageId) {
      const { error: sourceError } = await supabase
        .from('source_messages')
        .update({
          parse_status: confirmed.parse_status,
          matched_auction_event_id: auctionEventId
        })
        .eq('id', sourceMessageId)

      if (sourceError) {
        return { success: false, error: `Failed to update source_message: ${sourceError.message}` }
      }
    } else {
      const { data: source, error: sourceError } = await supabase
        .from('source_messages')
        .insert({
          profile_id: confirmed.profile_id,
          chit_id: confirmed.chit_id,
          raw_text: confirmed.raw_text,
          received_at: confirmed.received_at?.toISOString(),
          parse_status: confirmed.parse_status,
          content_hash: confirmed.content_hash,
          matched_auction_event_id: auctionEventId
        })
        .select('id')
        .single()

      if (sourceError) {
        return { success: false, error: `Failed to insert source_message: ${sourceError.message}` }
      }
      sourceMessageId = source.id
    }

    // 4. Update the source_message_id on the auction event to complete the circular link
    if (auctionEventId && sourceMessageId) {
      const { error: updateError } = await supabase
        .from('auction_events')
        .update({ source_message_id: sourceMessageId })
        .eq('id', auctionEventId)

      if (updateError) {
        // Not fatal, but log it
        console.warn('Failed to link source_message to auction_event', updateError)
      }
    }

    return {
      success: true,
      source_message_id: sourceMessageId,
      auction_event_id: auctionEventId,
      ledger_entry_id: ledgerEntryId
    }

  } catch (err: any) {
    return { success: false, error: err.message || 'Unknown persistence error' }
  }
}

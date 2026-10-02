'use server'

import { createClient } from '@/lib/supabase/server'
import { processWhatsAppMessage, type ChitConfig } from '@/lib/ingestion/ingest'
import { persistConfirmedIngestion } from '@/lib/ingestion/persistence'
import type { IngestionResult, ConfirmedIngestion } from '@/lib/ingestion/types'
import { contentHash, normaliseMessage } from '@/lib/whatsapp'
import { revalidatePath } from 'next/cache'
// Phase 7F: Verification invalidation on auction_event and ledger_entry INSERT
// is handled atomically by DB triggers (migration 20261003000002_*).
// No application-layer clearCashFlowVerification call is needed here.

export async function addToQueue(chitId: string, rawText: string) {
  try {
    if (!rawText || rawText.trim() === '') {
      return { success: false, error: 'Raw text is required' }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Verify chit ownership
    const { data: chit, error: chitError } = await supabase
      .from('chits')
      .select('id')
      .eq('id', chitId)
      .single()

    if (chitError || !chit) {
      return { success: false, error: 'Chit not found or unauthorized' }
    }

    const hash = contentHash(normaliseMessage(rawText))
    
    // Check if duplicate source message already exists
    const { data: duplicateCheck, error: dupError } = await supabase
      .from('source_messages')
      .select('id')
      .eq('content_hash', hash)
      .eq('chit_id', chitId)
      .eq('profile_id', user.id)
      .limit(1)
      .maybeSingle()

    if (dupError) {
      return { success: false, error: 'Failed to check for duplicate messages.' }
    }

    if (duplicateCheck) {
      return { success: false, error: 'Duplicate message already exists.' }
    }

    const { error: insertError } = await (supabase as any)
      .from('source_messages')
      .insert({
        profile_id: user.id,
        chit_id: chitId,
        raw_text: rawText,
        parse_status: 'PENDING',
        content_hash: hash,
        received_at: new Date().toISOString(),
        matched_auction_event_id: null,
        notes: null
      })

    if (insertError) {
      return { success: false, error: `Failed to insert into queue: ${insertError.message}` }
    }

    revalidatePath(`/chits/${chitId}/queue`)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error adding to queue' }
  }
}

export async function dismissFromQueue(sourceMessageId: string, chitId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    // Update parse_status to SUPERSEDED
    const { error } = await (supabase as any)
      .from('source_messages')
      .update({ parse_status: 'SUPERSEDED' })
      .eq('id', sourceMessageId)
      .eq('profile_id', user.id)

    if (error) {
      return { success: false, error: 'Failed to dismiss message' }
    }

    revalidatePath(`/chits/${chitId}/queue`)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error dismissing from queue' }
  }
}

export async function confirmFromQueue(
  sourceMessageId: string,
  chitId: string,
  manualRoundNumber?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    // 1. Re-read the source message
    const { data: sourceMsgRaw, error: sourceError } = await supabase
      .from('source_messages')
      .select('raw_text, parse_status, content_hash, received_at')
      .eq('id', sourceMessageId)
      .eq('profile_id', user.id)
      .single()

    const sourceMsg = sourceMsgRaw as any

    if (sourceError || !sourceMsg) {
      return { success: false, error: 'Source message not found or unauthorized' }
    }

    if (sourceMsg.parse_status === 'PARSED' || sourceMsg.parse_status === 'SUPERSEDED') {
      return { success: false, error: 'Message already processed or superseded' }
    }

    // 2. Fetch chit config
    const { data: chit, error: chitError } = await supabase
      .from('chits')
      .select('face_value, base_installment, member_count')
      .eq('id', chitId)
      .single() as any

    if (chitError || !chit) {
      return { success: false, error: 'Chit not found' }
    }

    const chitConfig: ChitConfig = {
      face_value: Number(chit.face_value),
      base_installment: Number(chit.base_installment),
      member_count: Number(chit.member_count),
    }

    // 3. Re-run ingestion parser
    const isDuplicate = false // We already checked duplicates at insertion, but could re-check. The hash hasn't changed.
    const result = processWhatsAppMessage(
      {
        profile_id: user.id,
        chit_id: chitId,
        raw_text: sourceMsg.raw_text,
        round_number: manualRoundNumber,
        received_at: sourceMsg.received_at ? new Date(sourceMsg.received_at) : new Date()
      },
      isDuplicate,
      chitConfig
    )

    if (result.status === 'DUPLICATE') return { success: false, error: 'Cannot confirm a duplicate message.' }
    if (result.status === 'PARSE_FAILED') return { success: false, error: 'Cannot confirm unparseable message.' }

    const validResult = result as Extract<IngestionResult, { status: 'READY_FOR_CONFIRMATION' | 'NEEDS_REVIEW' }>
    const roundNumber = manualRoundNumber ?? validResult.input.round_number ?? validResult.parse_result.metadata.round_number
    
    if (!roundNumber) {
      return { success: false, error: 'Round number is required' }
    }

    // 4. Duplicate round detection
    const { data: existingRound, error: existingRoundError } = await supabase
      .from('auction_events')
      .select('id')
      .eq('chit_id', chitId)
      .eq('round_number', roundNumber)
      .limit(1)
      .maybeSingle()

    if (existingRoundError) return { success: false, error: 'Failed to verify existing rounds.' }
    if (existingRound) return { success: false, error: `Round ${roundNumber} already exists for this chit.` }

    // 5. Setup payload
    const eventType = validResult.parse_result.event_type || 'UNKNOWN'
    const parsedFields = validResult.parse_result.fields

    // Detect explicit winner from parser — never invent.
    const wonByUs = parsedFields?.won_by_us === true ? true : null

    const confirmed: ConfirmedIngestion = {
      profile_id: user.id,
      chit_id: chitId,
      raw_text: validResult.input.raw_text,
      received_at: validResult.input.received_at ? new Date(validResult.input.received_at) : new Date(),
      content_hash: validResult.hash,
      parse_status: 'PARSED',
      existing_source_message_id: sourceMessageId,
      auction_event: {
        round_number: roundNumber,
        event_type: eventType as any,
        thallu: parsedFields?.thallu,
        commission: parsedFields?.commission,
        member_thallu: parsedFields?.stated_member_thallu,
        non_winner_payment: parsedFields?.stated_payment,
        // Only set won_by_us: true when the parser explicitly detected it.
        // If unknown, explicitly pass null.
        won_by_us: wonByUs,
        // Only record actual payout if the message stated it explicitly.
        // NEVER invent from face_value - thallu.
        our_payout_amount: wonByUs ? parsedFields?.our_payout_amount : undefined,
        calculation_status: validResult.status === 'NEEDS_REVIEW'
            ? (validResult.proposed_calculation_status === 'FLAGGED_MISMATCH' ? 'FLAGGED_MISMATCH' : 'MANUAL_OVERRIDE')
            : (validResult.proposed_calculation_status || 'INDUSTRY_DEFAULT'),
        auction_date: new Date(),
      },
    }

    // Build ledger entries. Winner round: INSTALLMENT_PAID + AUCTION_PAYOUT_RECEIVED.
    // Non-winner: INSTALLMENT_PAID only. No entry if stated_payment absent.
    const ledgerEntries: ConfirmedIngestion['ledger_entries'] = []

    if (parsedFields?.stated_payment) {
      ledgerEntries.push({
        entry_type: 'INSTALLMENT_PAID',
        amount: parsedFields.stated_payment,
        transaction_date: new Date(),
      })
    }

    if (wonByUs && parsedFields?.our_payout_amount) {
      ledgerEntries.push({
        entry_type: 'AUCTION_PAYOUT_RECEIVED',
        amount: parsedFields.our_payout_amount,
        transaction_date: new Date(),
      })
    }

    confirmed.ledger_entries = ledgerEntries.length > 0 ? ledgerEntries : undefined

    // 6. Persist with existing logic
    const persistResult = await persistConfirmedIngestion(supabase, confirmed)
    if (!persistResult.success) {
      return { success: false, error: persistResult.error }
    }

    // Phase 7F: Invalidation is handled atomically by DB triggers on
    // auction_events and ledger_entries. No application-layer call needed.

    revalidatePath(`/chits/${chitId}`)
    revalidatePath(`/chits/${chitId}/queue`)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error during queue confirmation' }
  }
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { processWhatsAppMessage, type ChitConfig } from '@/lib/ingestion/ingest'
import { persistConfirmedIngestion } from '@/lib/ingestion/persistence'
import type { IngestionResult, ConfirmedIngestion } from '@/lib/ingestion/types'
import { contentHash, normaliseMessage } from '@/lib/whatsapp'
import { revalidatePath } from 'next/cache'

export async function processIngestionText(
  chitId: string,
  rawText: string,
  roundNumberStr?: string
): Promise<{ success: boolean; result?: IngestionResult; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Check chit ownership
    const { data: chit, error: chitError } = await supabase
      .from('chits')
      .select('face_value, base_installment, member_count, duration_months')
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

    // Check duplicate
    const hash = contentHash(normaliseMessage(rawText))
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

    const isDuplicate = !!duplicateCheck

    let roundNumber: number | undefined = undefined
    if (roundNumberStr && roundNumberStr.trim() !== '') {
      const parsed = parseInt(roundNumberStr, 10)
      if (!isNaN(parsed) && parsed > 0) {
        roundNumber = parsed
      }
    }

    const result = processWhatsAppMessage(
      {
        profile_id: user.id,
        chit_id: chitId,
        raw_text: rawText,
        round_number: roundNumber,
        received_at: new Date()
      },
      isDuplicate,
      chitConfig
    )

    return { success: true, result }
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error during processing' }
  }
}

export async function confirmIngestion(
  chitId: string,
  rawText: string,
  manualRoundNumber?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!rawText || rawText.trim() === '') {
      return { success: false, error: 'Raw text is required' }
    }

    // Securely reconstruct the IngestionResult on the server
    const { success, result, error } = await processIngestionText(
      chitId, 
      rawText, 
      manualRoundNumber ? manualRoundNumber.toString() : undefined
    )

    if (!success || !result) {
      return { success: false, error: error || 'Failed to process message during confirmation' }
    }

    if (result.status === 'DUPLICATE') {
      return { success: false, error: 'Cannot confirm a duplicate message.' }
    }
    
    if (result.status === 'PARSE_FAILED') {
      return { success: false, error: 'Cannot confirm unparseable message.' }
    }
    
    // Typecast to remove the duplicate and parse_failed types for the remainder of the function
    const validResult = result as Extract<IngestionResult, { status: 'READY_FOR_CONFIRMATION' | 'NEEDS_REVIEW' }>

    const roundNumber = manualRoundNumber ?? validResult.input.round_number ?? validResult.parse_result.metadata.round_number
    if (!roundNumber) {
      return { success: false, error: 'Round number is required' }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Ensure duplicate round check
    const { data: existingRound, error: existingRoundError } = await supabase
      .from('auction_events')
      .select('id')
      .eq('chit_id', chitId)
      .eq('round_number', roundNumber)
      .limit(1)
      .maybeSingle()

    if (existingRoundError) {
      return { success: false, error: 'Failed to verify existing rounds.' }
    }

    if (existingRound) {
      return { success: false, error: `Round ${roundNumber} already exists for this chit.` }
    }

    const eventType = validResult.parse_result.event_type || 'UNKNOWN'
    const parsedFields = validResult.parse_result.fields

    // Detect explicit winner from parser. Only true when message explicitly states it.
    // Never invent: absent means unknown.
    // We preserve NULL/unknown if won_by_us is absent.
    const wonByUs = parsedFields?.won_by_us === true ? true : null

    // Build the confirmed payload
    const confirmed: ConfirmedIngestion = {
      profile_id: user.id,
      chit_id: chitId,
      raw_text: validResult.input.raw_text,
      received_at: validResult.input.received_at ? new Date(validResult.input.received_at) : new Date(),
      content_hash: validResult.hash,
      parse_status: 'PARSED',
      auction_event: {
        round_number: roundNumber,
        event_type: eventType as any,
        thallu: parsedFields?.thallu,
        commission: parsedFields?.commission,
        member_thallu: parsedFields?.stated_member_thallu,
        non_winner_payment: parsedFields?.stated_payment,
        // Only set won_by_us: true when the parser explicitly detected it.
        // If unknown, we explicitly pass null to preserve the unknown state in the DB.
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

    // Build ledger entries. Winner round gets INSTALLMENT_PAID + AUCTION_PAYOUT_RECEIVED.
    // Non-winner gets INSTALLMENT_PAID only.
    // No ledger entry at all if the stated_payment is absent.
    const ledgerEntries: ConfirmedIngestion['ledger_entries'] = []

    if (parsedFields?.stated_payment) {
      ledgerEntries.push({
        entry_type: 'INSTALLMENT_PAID',
        amount: parsedFields.stated_payment,
        transaction_date: new Date(),
      })
    }

    if (wonByUs && parsedFields?.our_payout_amount) {
      // Actual payout explicitly recorded — create the inflow entry.
      ledgerEntries.push({
        entry_type: 'AUCTION_PAYOUT_RECEIVED',
        amount: parsedFields.our_payout_amount,
        transaction_date: new Date(),
      })
    }
    // If wonByUs but our_payout_amount is absent, the warning was already emitted by the parser.
    // Do NOT fabricate an amount. The user must enter it manually via a ledger correction.

    confirmed.ledger_entries = ledgerEntries.length > 0 ? ledgerEntries : undefined

    const persistResult = await persistConfirmedIngestion(supabase, confirmed)

    if (!persistResult.success) {
      return { success: false, error: persistResult.error }
    }

    revalidatePath(`/chits/${chitId}`)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error during confirmation' }
  }
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
// Phase 7F: Verification invalidation on ledger_entry INSERT is handled
// atomically by the DB trigger trg_ledger_entries_invalidate_verification
// (migration 20261003000002_verification_invalidation_triggers.sql).
// No application-layer clearCashFlowVerification call is needed here.

const correctionSchema = z.object({
  chit_id: z.string().uuid(),
  original_entry_id: z.string().uuid(),
  new_amount: z.number().min(0, "Amount must be zero or positive"),
  notes: z.string().optional()
})

export async function correctLedgerEntry(data: z.infer<typeof correctionSchema>) {
  const result = correctionSchema.safeParse(data)
  if (!result.success) {
    return { success: false, error: 'Invalid input data: ' + result.error.message }
  }

  const { chit_id, original_entry_id, new_amount, notes } = result.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // 1. Fetch original entry and verify ownership/RLS
  const { data: original, error: origError } = await (supabase as any)
    .from('ledger_entries')
    .select('id, profile_id, chit_id, auction_event_id, entry_type, amount, corrects_entry_id, transaction_date')
    .eq('id', original_entry_id)
    .single()

  if (origError || !original) {
    return { success: false, error: 'Original entry not found' }
  }

  if (original.chit_id !== chit_id) {
    return { success: false, error: 'Mismatched chit ID' }
  }

  if (original.profile_id !== user.id) {
    return { success: false, error: 'Permission denied' }
  }

  if (original.entry_type === 'MANUAL_CORRECTION') {
    return { success: false, error: 'Cannot correct a correction entry' }
  }

  // Check if already corrected
  const { data: existingCorrection } = await supabase
    .from('ledger_entries')
    .select('id')
    .eq('corrects_entry_id', original_entry_id)
    .maybeSingle()
    
  if (existingCorrection) {
    return { success: false, error: 'Entry has already been corrected' }
  }

  // 2. Insert correction
  const { error: insertError } = await (supabase as any)
    .from('ledger_entries')
    .insert({
      profile_id: user.id,
      chit_id: chit_id,
      auction_event_id: original.auction_event_id,
      entry_type: 'MANUAL_CORRECTION',
      amount: new_amount,
      transaction_date: original.transaction_date,
      corrects_entry_id: original.id,
      notes: notes || `Corrected amount for ${original.entry_type}`
    })

  if (insertError) {
    return { success: false, error: `Failed to save correction: ${insertError.message}` }
  }

  // Phase 3: Set calculation_status to MANUAL_OVERRIDE
  const { error: eventError } = await (supabase as any)
    .from('auction_events')
    .update({ calculation_status: 'MANUAL_OVERRIDE' })
    .eq('id', original.auction_event_id)
    .eq('profile_id', user.id)

  if (eventError) {
    return { success: false, error: `Failed to update calculation status: ${eventError.message}` }
  }

  // Phase 7F: Invalidation is handled atomically by the DB trigger
  // trg_ledger_entries_invalidate_verification which fires BEFORE INSERT on
  // ledger_entries. verified_at and verified_by were cleared within the same
  // Postgres transaction that committed the correction above.

  revalidatePath(`/chits/${chit_id}`)
  return { success: true }
}

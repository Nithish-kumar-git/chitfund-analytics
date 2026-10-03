'use server'

/**
 * Phase 8A.1 — Winner Status Confirmation Actions
 *
 * DOMAIN RULE:
 *   Winner status is an auction-event fact, separate from cash flow recording.
 *
 * SEMANTICS:
 *   NULL  = winner unknown (imported historical data, or not yet confirmed)
 *   TRUE  = user explicitly confirmed WE WON this round
 *   FALSE = user explicitly confirmed SOMEONE ELSE WON this round
 *
 * PRINCIPLES:
 *   - Winner status is NOT inferred from payout recording
 *   - NULL is NEVER silently converted
 *   - source_messages remain unchanged
 *   - Financial fields (thallu, commission, payment, payout) remain unchanged
 *   - Only auction_events.won_by_us is updated
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const confirmWinnerSchema = z.object({
  chit_id: z.string().uuid('Invalid chit ID'),
  auction_event_id: z.string().uuid('Invalid auction event ID'),
  won_by_us: z.boolean('Winner status must be true or false'),
})

export type ConfirmWinnerResult =
  | { success: true }
  | { success: false; error: string }

/**
 * Explicitly confirm winner status for an auction round.
 *
 * This action allows users to establish winner facts for imported historical
 * data where won_by_us was set to NULL because the source message did not
 * explicitly state the winner.
 *
 * Prerequisites:
 *  1. User is authenticated
 *  2. Chit exists and is owned by the authenticated user
 *  3. Auction event exists and belongs to the specified chit
 *  4. won_by_us is a boolean (true = we won, false = someone else won)
 *
 * On success: updates auction_events.won_by_us only.
 * Does NOT modify: source_messages, financial fields, ledger entries.
 */
export async function confirmWinnerStatus(
  data: z.infer<typeof confirmWinnerSchema>
): Promise<ConfirmWinnerResult> {
  // 1. Validate input
  const parsed = confirmWinnerSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input: ' + parsed.error.message }
  }
  const { chit_id, auction_event_id, won_by_us } = parsed.data

  const supabase = await createClient()

  // 2. Authenticate
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // 3. Verify chit ownership (RLS enforces profile_id, but explicit check for clarity)
  const { data: chit, error: chitError } = await supabase
    .from('chits')
    .select('id, profile_id')
    .eq('id', chit_id)
    .eq('profile_id', user.id)
    .single()

  if (chitError || !chit) {
    return { success: false, error: 'Chit not found or permission denied' }
  }

  // 4. Verify auction_event belongs to this chit and fetch current winner status
  const { data: auctionEvent, error: eventError } = await supabase
    .from('auction_events')
    .select('id, chit_id, round_number, won_by_us, profile_id')
    .eq('id', auction_event_id)
    .eq('chit_id', chit_id)
    .single()

  if (eventError || !auctionEvent) {
    return { success: false, error: 'Auction event not found or does not belong to this chit' }
  }

  // Additional ownership check (belt-and-suspenders, RLS handles this)
  if ((auctionEvent as any).profile_id !== user.id) {
    return { success: false, error: 'Permission denied' }
  }

  // 5. Update ONLY won_by_us field
  const { error: updateError } = await (supabase as any)
    .from('auction_events')
    .update({ won_by_us: won_by_us })
    .eq('id', auction_event_id)
    .eq('profile_id', user.id)

  if (updateError) {
    return { success: false, error: `Failed to update winner status: ${updateError.message}` }
  }

  // Note: Verification invalidation trigger fires on auction_events INSERT,
  // but NOT on UPDATE. This is by design: confirming winner status does not
  // invalidate cash flow verification, because it doesn't change the financial
  // amounts. Only new auction_events or ledger_entries invalidate verification.

  revalidatePath(`/chits/${chit_id}`)
  return { success: true }
}

'use server'

/**
 * Phase 7F — Cash-Flow Verification Action (atomicity-hardened)
 *
 * ARCHITECTURE:
 *   - Invalidation of verified_at/verified_by on ledger changes and auction
 *     event inserts/updates/deletes is handled atomically by DB triggers.
 *
 *   - updateChitAction inlines verified_at=null into its own UPDATE statement
 *     when financial fields change, making that path atomic too. This file
 *     does NOT provide a separate clearCashFlowVerification helper for that.
 *
 * IMPORTANT:
 *   - verified_by is derived from the authenticated session, never from the client.
 *   - Only COMPLETED chits may be verified.
 *   - verifyChitCashFlows uses a locked database RPC to close the TOCTOU window.
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const verifySchema = z.object({
  chit_id: z.string().uuid('Invalid chit ID'),
})

export type VerifyResult =
  | { success: true }
  | { success: false; error: string }

/**
 * Verifies that the cash flows for a COMPLETED chit are complete and accurate.
 *
 * Prerequisites (must all pass, matching the ROI engine):
 *  1. User is authenticated.
 *  2. Chit exists and is owned by the authenticated user.
 *  3. chit.status === 'COMPLETED'.
 *  4. Every round in the exact set 1..duration_months is recorded.
 *  5. No unresolved FLAGGED_MISMATCH in auction events.
 *
 * Concurrency safety:
 *  - The verify_chit_cash_flows RPC locks the parent chit row.
 *  - It checks status, the exact expected round set, and calculation blockers,
 *    then records verification in the same PostgreSQL transaction.
 *  - Event and ledger mutation triggers acquire the same parent lock and always
 *    invalidate verification, so no stale verified state can commit.
 *
 * On success: sets verified_at = NOW(), verified_by = auth user's UUID.
 * On failure: returns an error without touching the DB.
 */
export async function verifyChitCashFlows(data: { chit_id: string }): Promise<VerifyResult> {
  // 1. Validate input
  const parsed = verifySchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input: ' + parsed.error.message }
  }
  const { chit_id } = parsed.data

  const supabase = await createClient()

  // 2. Authenticate — derive verifier identity from session, never from client
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const { error: verifyError } = await (supabase as any).rpc('verify_chit_cash_flows', {
    p_chit_id: chit_id,
  })

  if (verifyError) {
    return { success: false, error: verifyError.message }
  }

  revalidatePath(`/chits/${chit_id}`)
  return { success: true }
}

const roundActionSchema = z.object({
  chit_id: z.string().uuid('Invalid chit ID'),
  auction_event_id: z.string().uuid('Invalid event ID'),
})

export async function confirmFormula(data: { chit_id: string; auction_event_id: string }): Promise<VerifyResult> {
  const parsed = roundActionSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.message }
  const { chit_id, auction_event_id } = parsed.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { error } = await supabase
    .from('auction_events')
    // @ts-ignore - Supabase type inference for Update is resolving to never
    .update({ calculation_status: 'VERIFIED_FORMULA' })
    .eq('id', auction_event_id)
    .eq('chit_id', chit_id)
    .eq('profile_id', user.id)

  if (error) return { success: false, error: `Failed to confirm formula: ${error.message}` }
  
  revalidatePath(`/chits/${chit_id}`)
  return { success: true }
}

export async function confirmSource(data: { chit_id: string; auction_event_id: string }): Promise<VerifyResult> {
  const parsed = roundActionSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.message }
  const { chit_id, auction_event_id } = parsed.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Must only apply if currently FLAGGED_MISMATCH? 
  // Actually it can apply if the user just wants to confirm source. 
  // We'll just set it. 
  const { error } = await supabase
    .from('auction_events')
    // @ts-ignore
    .update({ calculation_status: 'CONFIRM_SOURCE' })
    .eq('id', auction_event_id)
    .eq('chit_id', chit_id)
    .eq('profile_id', user.id)
    .eq('calculation_status', 'FLAGGED_MISMATCH')

  if (error) return { success: false, error: `Failed to confirm source: ${error.message}` }
  
  revalidatePath(`/chits/${chit_id}`)
  return { success: true }
}

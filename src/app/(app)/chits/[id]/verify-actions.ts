'use server'

/**
 * Phase 7F — Cash-Flow Verification Action (atomicity-hardened)
 *
 * ARCHITECTURE:
 *   - Invalidation of verified_at/verified_by on ledger_entry and auction_event
 *     inserts is now handled atomically by DB triggers (see migration
 *     20261003000002_verification_invalidation_triggers.sql). Application-layer
 *     invalidation calls have been removed from those mutation paths.
 *
 *   - updateChitAction inlines verified_at=null into its own UPDATE statement
 *     when financial fields change, making that path atomic too. This file
 *     does NOT provide a separate clearCashFlowVerification helper for that.
 *
 * IMPORTANT:
 *   - verified_by is derived from the authenticated session, never from the client.
 *   - Only COMPLETED chits may be verified.
 *   - verifyChitCashFlows uses an optimistic concurrency check to close the
 *     TOCTOU race window.
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
 *  4. All expected rounds are recorded (auction_events.count === duration_months).
 *  5. No unresolved FLAGGED_MISMATCH in auction events.
 *
 * Concurrency safety (optimistic lock):
 *  - The chit's updated_at is read during the prerequisite check.
 *  - The final UPDATE includes AND updated_at = <read_value> AND status = 'COMPLETED'.
 *  - If another mutation (ingest, correction, status change) committed between
 *    the prerequisite read and the write, the DB trigger or the chit update will
 *    have changed updated_at, causing the optimistic lock to detect zero rows
 *    affected, and verification will be refused.
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

  // 3. Fetch the chit — include updated_at for the optimistic concurrency check.
  //    RLS enforces profile_id ownership at the DB level.
  //    The .eq('profile_id', user.id) is belt-and-suspenders defence.
  const { data: chit, error: chitError } = await supabase
    .from('chits')
    .select('id, profile_id, status, duration_months, updated_at')
    .eq('id', chit_id)
    .eq('profile_id', user.id)
    .single()

  if (chitError || !chit) {
    return { success: false, error: 'Chit not found or permission denied' }
  }

  // 4. Require COMPLETED status — must not verify an active chit
  if ((chit as any).status !== 'COMPLETED') {
    return {
      success: false,
      error: 'Only COMPLETED chits can be verified. Current status: ' + (chit as any).status,
    }
  }

  // 5. Require all expected rounds to be recorded
  const { count: roundCount, error: roundError } = await supabase
    .from('auction_events')
    .select('id', { count: 'exact', head: true })
    .eq('chit_id', chit_id)

  if (roundError) {
    return { success: false, error: 'Failed to count auction rounds: ' + roundError.message }
  }

  const durationMonths = (chit as any).duration_months as number
  if ((roundCount ?? 0) < durationMonths) {
    return {
      success: false,
      error: `Not all rounds are recorded. Expected ${durationMonths}, found ${roundCount ?? 0}.`,
    }
  }

  // 6. Require no unresolved FLAGGED_MISMATCH
  const { count: flaggedCount, error: flaggedError } = await supabase
    .from('auction_events')
    .select('id', { count: 'exact', head: true })
    .eq('chit_id', chit_id)
    .eq('calculation_status', 'FLAGGED_MISMATCH')

  if (flaggedError) {
    return { success: false, error: 'Failed to check flagged mismatches: ' + flaggedError.message }
  }

  if ((flaggedCount ?? 0) > 0) {
    return {
      success: false,
      error: `${flaggedCount} round(s) have an unresolved flagged mismatch. Resolve them before verifying.`,
    }
  }

  // 7. Write verification — with optimistic concurrency lock.
  //
  //    The WHERE clause includes:
  //      AND updated_at = <value read in step 3>
  //      AND status = 'COMPLETED'
  //
  //    If any financial mutation (insert to ledger_entries or auction_events)
  //    committed between step 3 and now, the DB trigger will have updated
  //    chits.updated_at (via the handle_updated_at trigger). The optimistic
  //    lock condition will match zero rows, and we return an error.
  //
  //    If updateChitAction ran between step 3 and now, it also updated
  //    chits.updated_at (trigger fires on UPDATE too). Same protection applies.
  //
  //    NOTE: Supabase JS client does not expose `rowCount` from UPDATE
  //    responses directly. We use .select('id').maybeSingle() to detect
  //    whether the row was matched and updated.
  const readUpdatedAt = (chit as any).updated_at as string

  const { data: updatedChit, error: updateError } = await (supabase as any)
    .from('chits')
    .update({
      verified_at: new Date().toISOString(),
      verified_by: user.id,
    })
    .eq('id', chit_id)
    .eq('profile_id', user.id)
    .eq('status', 'COMPLETED')
    .eq('updated_at', readUpdatedAt)
    .select('id')
    .maybeSingle()

  if (updateError) {
    return { success: false, error: 'Failed to save verification: ' + updateError.message }
  }

  if (!updatedChit) {
    // Zero rows matched. Either:
    //   (a) A concurrent mutation changed updated_at between our read and this write.
    //   (b) Status changed away from COMPLETED between read and write.
    // In both cases, the prerequisite state is stale. Refuse verification.
    return {
      success: false,
      error:
        'The chit was modified by another action while verification was in progress. ' +
        'Please refresh and verify again.',
    }
  }

  revalidatePath(`/chits/${chit_id}`)
  return { success: true }
}

'use server'

/**
 * Phase 8A — Record Actual Cash Flows
 *
 * FINANCIAL PRINCIPLE:
 *   EXPECTED PAYMENT (from imported WhatsApp auction data) ≠ ACTUAL PAYMENT (ledger entry)
 *
 * ARCHITECTURE:
 *   - These actions allow users to EXPLICITLY record actual cash flows (installments
 *     paid and payouts received) against auction rounds.
 *   - NEVER automatically convert expected payment amounts into ledger entries.
 *   - Verification invalidation on ledger_entry INSERT is handled atomically by
 *     the DB trigger trg_ledger_entries_invalidate_verification.
 *   - Append-only ledger: these actions only INSERT, never UPDATE or DELETE.
 *   - Correction compatibility: if a user records the wrong amount, they use
 *     correctLedgerEntry (ledger-actions.ts) to append a MANUAL_CORRECTION.
 *
 * VALIDATION:
 *   - User must be authenticated and own the chit (RLS enforced at DB level)
 *   - Chit must exist and auction_event must belong to that chit
 *   - Amount must be positive
 *   - transaction_date is required (user explicitly chooses the date)
 *   - For payouts: won_by_us must be true (cannot record "our payout" if we didn't win)
 *   - Duplicate safety: warn if an entry of the same type already exists for this event
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const recordInstallmentSchema = z.object({
  chit_id: z.string().uuid('Invalid chit ID'),
  auction_event_id: z.string().uuid('Invalid auction event ID'),
  amount: z.number().positive('Amount must be greater than zero'),
  transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (expected YYYY-MM-DD)'),
  notes: z.string().optional(),
  idempotency_key: z.string().uuid('Invalid idempotency key').optional(),
})

const recordPayoutSchema = z.object({
  chit_id: z.string().uuid('Invalid chit ID'),
  auction_event_id: z.string().uuid('Invalid auction event ID'),
  amount: z.number().positive('Amount must be greater than zero'),
  transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (expected YYYY-MM-DD)'),
  notes: z.string().optional(),
  idempotency_key: z.string().uuid('Invalid idempotency key').optional(),
})

export type RecordResult =
  | { success: true }
  | { success: false; error: string }

/**
 * Record an actual installment payment made by the user for a specific auction round.
 *
 * Prerequisites:
 *  1. User is authenticated.
 *  2. Chit exists and is owned by the authenticated user.
 *  3. Auction event exists and belongs to the specified chit.
 *  4. Amount is positive.
 *  5. transaction_date is provided (user explicitly chooses when payment was made).
 *
 * Duplicate safety:
 *  - Warns if an INSTALLMENT_PAID entry already exists for this auction_event_id.
 *  - Does not block the insert (user may have paid multiple installments for one round).
 *
 * On success: inserts a ledger_entry with entry_type = 'INSTALLMENT_PAID'.
 * Verification invalidation: handled automatically by DB trigger.
 */
export async function recordInstallment(
  data: z.infer<typeof recordInstallmentSchema>
): Promise<RecordResult> {
  // 1. Validate input
  const parsed = recordInstallmentSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input: ' + parsed.error.message }
  }
  const { chit_id, auction_event_id, amount, transaction_date, notes, idempotency_key } = parsed.data

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

  // 4. Verify auction_event belongs to this chit
  const { data: auctionEvent, error: eventError } = await supabase
    .from('auction_events')
    .select('id, chit_id, round_number')
    .eq('id', auction_event_id)
    .eq('chit_id', chit_id)
    .single()

  if (eventError || !auctionEvent) {
    return { success: false, error: 'Auction event not found or does not belong to this chit' }
  }

  // 5. Duplicate safety check (warn, but allow insert)
  const { data: existingEntries } = await supabase
    .from('ledger_entries')
    .select('id')
    .eq('chit_id', chit_id)
    .eq('auction_event_id', auction_event_id)
    .eq('entry_type', 'INSTALLMENT_PAID')
    .limit(1)

  if (existingEntries && existingEntries.length > 0) {
    // Allow the insert, but warn the user (they can correct later if needed)
    console.warn(
      `[recordInstallment] An INSTALLMENT_PAID entry already exists for auction_event_id=${auction_event_id}. Allowing duplicate.`
    )
  }

  // 6. Insert ledger entry
  const { error: insertError } = await supabase.from('ledger_entries').insert({
    profile_id: user.id,
    chit_id: chit_id,
    auction_event_id: auction_event_id,
    entry_type: 'INSTALLMENT_PAID',
    amount: amount,
    transaction_date: transaction_date,
    notes: notes ?? `Installment paid for Round ${(auctionEvent as any).round_number}`,
    idempotency_key: idempotency_key ?? null,
  } as any)

  if (insertError) {
    // Phase 8A.1: Check if error is duplicate idempotency key
    if (insertError.code === '23505' && insertError.message?.includes('idempotency_key')) {
      return { success: false, error: 'This transaction has already been recorded (duplicate submission detected)' }
    }
    return { success: false, error: `Failed to record installment: ${insertError.message}` }
  }

  // Verification invalidation is handled atomically by DB trigger
  // trg_ledger_entries_invalidate_verification (BEFORE INSERT on ledger_entries).

  revalidatePath(`/chits/${chit_id}`)
  return { success: true }
}

/**
 * Record an actual payout received by the user for a specific auction round.
 *
 * Prerequisites:
 *  1. User is authenticated.
 *  2. Chit exists and is owned by the authenticated user.
 *  3. Auction event exists and belongs to the specified chit.
 *  4. won_by_us = true (cannot record "our payout" if we didn't win the round).
 *  5. Amount is positive.
 *  6. transaction_date is provided (user explicitly chooses when payout was received).
 *
 * Duplicate safety:
 *  - Warns if an AUCTION_PAYOUT_RECEIVED entry already exists for this auction_event_id.
 *  - Does not block the insert (user may have received payout in multiple tranches).
 *
 * On success: inserts a ledger_entry with entry_type = 'AUCTION_PAYOUT_RECEIVED'.
 * Verification invalidation: handled automatically by DB trigger.
 */
export async function recordPayout(
  data: z.infer<typeof recordPayoutSchema>
): Promise<RecordResult> {
  // 1. Validate input
  const parsed = recordPayoutSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input: ' + parsed.error.message }
  }
  const { chit_id, auction_event_id, amount, transaction_date, notes, idempotency_key } = parsed.data

  const supabase = await createClient()

  // 2. Authenticate
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // 3. Verify chit ownership
  const { data: chit, error: chitError } = await supabase
    .from('chits')
    .select('id, profile_id')
    .eq('id', chit_id)
    .eq('profile_id', user.id)
    .single()

  if (chitError || !chit) {
    return { success: false, error: 'Chit not found or permission denied' }
  }

  // 4. Verify auction_event belongs to this chit AND won_by_us = true
  const { data: auctionEvent, error: eventError } = await supabase
    .from('auction_events')
    .select('id, chit_id, round_number, won_by_us')
    .eq('id', auction_event_id)
    .eq('chit_id', chit_id)
    .single()

  if (eventError || !auctionEvent) {
    return { success: false, error: 'Auction event not found or does not belong to this chit' }
  }

  const wonByUs = (auctionEvent as any).won_by_us
  if (wonByUs !== true) {
    // If won_by_us is false or NULL, user cannot record a payout
    const status = wonByUs === false ? 'false (we did not win)' : 'NULL (winner status unknown)'
    return {
      success: false,
      error: `Cannot record payout: won_by_us is ${status}. Only rounds won by us can have payouts recorded.`,
    }
  }

  // 5. Duplicate safety check (warn, but allow insert)
  const { data: existingEntries } = await supabase
    .from('ledger_entries')
    .select('id')
    .eq('chit_id', chit_id)
    .eq('auction_event_id', auction_event_id)
    .eq('entry_type', 'AUCTION_PAYOUT_RECEIVED')
    .limit(1)

  if (existingEntries && existingEntries.length > 0) {
    console.warn(
      `[recordPayout] An AUCTION_PAYOUT_RECEIVED entry already exists for auction_event_id=${auction_event_id}. Allowing duplicate.`
    )
  }

  // 6. Insert ledger entry
  const { error: insertError } = await supabase.from('ledger_entries').insert({
    profile_id: user.id,
    chit_id: chit_id,
    auction_event_id: auction_event_id,
    entry_type: 'AUCTION_PAYOUT_RECEIVED',
    amount: amount,
    transaction_date: transaction_date,
    notes: notes ?? `Payout received for Round ${(auctionEvent as any).round_number}`,
    idempotency_key: idempotency_key ?? null,
  } as any)

  if (insertError) {
    // Phase 8A.1: Check if error is duplicate idempotency key
    if (insertError.code === '23505' && insertError.message?.includes('idempotency_key')) {
      return { success: false, error: 'This transaction has already been recorded (duplicate submission detected)' }
    }
    return { success: false, error: `Failed to record payout: ${insertError.message}` }
  }

  // Verification invalidation is handled atomically by DB trigger.

  revalidatePath(`/chits/${chit_id}`)
  return { success: true }
}

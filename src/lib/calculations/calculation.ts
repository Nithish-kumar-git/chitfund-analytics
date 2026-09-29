/**
 * Chit Fund Analytics — Canonical Normal Auction Calculation Engine
 *
 * This is the SINGLE source of truth for normal chit auction calculations.
 * Do NOT duplicate these formulas elsewhere.
 *
 * VERIFIED FORMULAS (from real project WhatsApp data, NORMAL events only):
 *
 *   net_thallu         = thallu - commission
 *   member_thallu      = net_thallu / member_count
 *   non_winner_payment = base_installment - member_thallu
 *
 * IMPORTANT:
 *   - Uses big.js for exact decimal arithmetic (no floating-point rounding errors).
 *   - Intermediate precision is preserved — no silent rounding.
 *   - Winner payout (our_payout_amount) is NOT calculated: mechanics unverified.
 *   - FINAL / SPECIAL_NO_AUCTION / UNKNOWN events return CalculationNotApplicable.
 */

import Big from 'big.js'
import type {
  NormalAuctionInput,
  AuctionCalculationResult,
  CalculationSuccess,
} from './types'
import { validateNormalAuctionInput } from './validation'

// Configure big.js: preserve precision during intermediate steps,
// no auto-rounding. Callers may round for display using roundForDisplay().
Big.DP = 20 // decimal places for division
Big.RM = 1  // round half up

/**
 * Main entry point — accepts a NormalAuctionInput and returns a typed result.
 *
 * Result variants:
 *   { kind: 'success' }          — NORMAL event, valid input, all values computed
 *   { kind: 'not_applicable' }   — non-NORMAL event type
 *   { kind: 'error' }            — input validation failed
 */
export function calculateAuction(
  input: NormalAuctionInput,
): AuctionCalculationResult {
  // ── Step 1: Handle non-NORMAL event types before any formula ──────────────
  if (input.event_type !== 'NORMAL') {
    return {
      kind: 'not_applicable',
      event_type: input.event_type as Exclude<typeof input.event_type, 'NORMAL'>,
      reason:
        `Event type '${input.event_type}' does not use the normal auction formula. ` +
        `Mechanics for this event type have not been independently verified and ` +
        `must not be inferred from normal auction rules.`,
    }
  }

  // ── Step 2: Validate input ─────────────────────────────────────────────────
  const errors = validateNormalAuctionInput(input)
  if (errors.length > 0) {
    return { kind: 'error', errors }
  }

  // ── Step 3: Apply the verified normal auction formula ──────────────────────
  //    All intermediate values use big.js to prevent floating-point drift.
  const bThallu = new Big(input.thallu)
  const bCommission = new Big(input.commission)
  const bBaseInstallment = new Big(input.base_installment)
  const bMemberCount = new Big(input.member_count)

  const bNetThallu = bThallu.minus(bCommission)                    // net_thallu = thallu - commission
  const bMemberThallu = bNetThallu.div(bMemberCount)               // member_thallu = net_thallu / member_count
  const bNonWinnerPayment = bBaseInstallment.minus(bMemberThallu)  // non_winner_payment = base_installment - member_thallu

  // ── Step 4: Consistency check — face_value ≈ base_installment × member_count
  //    This is informational only. The calculation proceeds regardless.
  const bExpectedFaceValue = bBaseInstallment.times(bMemberCount)
  const bActualFaceValue = new Big(input.face_value)
  const faceValueMismatch = !bExpectedFaceValue.eq(bActualFaceValue)

  const result: CalculationSuccess = {
    kind: 'success',
    event_type: 'NORMAL',
    // Input echo
    face_value: input.face_value,
    base_installment: input.base_installment,
    member_count: input.member_count,
    thallu: input.thallu,
    commission: input.commission,
    // Derived values — converted back to number with full big.js precision
    net_thallu: bNetThallu.toNumber(),
    member_thallu: bMemberThallu.toNumber(),
    non_winner_payment: bNonWinnerPayment.toNumber(),
  }

  if (faceValueMismatch) {
    result.face_value_mismatch = {
      expected_face_value: bExpectedFaceValue.toNumber(),
      actual_face_value: input.face_value,
      note:
        'face_value does not equal base_installment × member_count. ' +
        'This is informational — no financial values were altered.',
    }
  }

  return result
}

/**
 * Display helper — rounds a monetary value to the specified number of
 * decimal places (default: 2) using half-up rounding.
 *
 * Intentionally SEPARATE from the calculation above so the engine always
 * returns full precision and callers decide when/how to round for display.
 */
export function roundForDisplay(value: number, decimalPlaces = 2): number {
  return new Big(value).round(decimalPlaces, 1).toNumber()
}

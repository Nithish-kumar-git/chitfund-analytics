/**
 * Chit Fund Analytics — Calculation Cross-Check Helper
 *
 * Compares parsed WhatsApp stated values against independently calculated values.
 * Used ONLY for testing and validation — NEVER for ingestion.
 *
 * This helper calls the Phase 2A calculation engine.
 * It does NOT duplicate any formula.
 * It does NOT overwrite stated values with calculated ones.
 */

import { calculateAuction } from '@/lib/calculations/calculation'
import type { NormalAuctionInput } from '@/lib/calculations/types'
import type { ParsedFields, CrossCheckResult } from './types'

/**
 * Validates parsed WhatsApp values against the Phase 2A calculation engine.
 *
 * @param parsed      - The parsed fields from parseWhatsAppMessage()
 * @param chitConfig  - Known chit configuration (from DB or test fixture)
 * @returns CrossCheckResult — match, mismatch, or not_applicable
 *
 * NEVER overwrites parsed.stated_member_thallu or parsed.stated_payment.
 * Returns a structured mismatch if they differ from calculated values.
 */
export function crossCheckWithCalculation(
  parsed: ParsedFields,
  chitConfig: {
    face_value: number
    base_installment: number
    member_count: number
  },
): CrossCheckResult {
  // Can only cross-check when we have the required parsed fields
  if (parsed.thallu === undefined) {
    return {
      kind: 'not_applicable',
      reason:
        'thallu is not present in parsed fields (may be a SPECIAL_NO_AUCTION or partial parse). ' +
        'Cross-check requires a parsed thallu value.',
    }
  }
  if (parsed.commission === undefined) {
    return {
      kind: 'not_applicable',
      reason: 'commission is not present in parsed fields.',
    }
  }
  if (
    parsed.stated_member_thallu === undefined ||
    parsed.stated_payment === undefined
  ) {
    return {
      kind: 'not_applicable',
      reason:
        'stated_member_thallu or stated_payment is missing from parsed fields — ' +
        'cannot cross-check against calculation engine.',
    }
  }

  // Build the calculation engine input
  const input: NormalAuctionInput = {
    face_value: chitConfig.face_value,
    base_installment: chitConfig.base_installment,
    member_count: chitConfig.member_count,
    thallu: parsed.thallu,
    commission: parsed.commission,
    event_type: 'NORMAL',
  }

  const calcResult = calculateAuction(input)

  if (calcResult.kind !== 'success') {
    return {
      kind: 'not_applicable',
      reason: `Calculation engine returned '${calcResult.kind}' — cannot cross-check.`,
    }
  }

  const {
    member_thallu: calculatedMemberThallu,
    non_winner_payment: calculatedPayment,
  } = calcResult

  const memberThallDelta = Math.abs(
    calculatedMemberThallu - parsed.stated_member_thallu,
  )
  const paymentDelta = Math.abs(calculatedPayment - parsed.stated_payment)

  // Tolerance: allow up to 0.01 for floating-point noise
  const TOLERANCE = 0.01
  const isMatch =
    memberThallDelta <= TOLERANCE && paymentDelta <= TOLERANCE

  if (isMatch) {
    return {
      kind: 'match',
      calculated_member_thallu: calculatedMemberThallu,
      calculated_non_winner_payment: calculatedPayment,
      stated_member_thallu: parsed.stated_member_thallu,
      stated_payment: parsed.stated_payment,
    }
  }

  return {
    kind: 'mismatch',
    calculated_member_thallu: calculatedMemberThallu,
    calculated_non_winner_payment: calculatedPayment,
    stated_member_thallu: parsed.stated_member_thallu,
    stated_payment: parsed.stated_payment,
    member_thallu_delta: memberThallDelta,
    payment_delta: paymentDelta,
  }
}

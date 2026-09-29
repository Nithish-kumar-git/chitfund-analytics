/**
 * Chit Fund Analytics — Calculation Engine Types
 *
 * Discriminated union for all possible calculation results.
 * Every consumer of the engine must handle all three variants.
 *
 * IMPORTANT TERMINOLOGY:
 *   thallu           = total auction discount bid by the winner
 *   commission       = chit organiser's commission deducted from thallu
 *   net_thallu       = thallu remaining after commission
 *   member_thallu    = per-member benefit/reduction for non-winners
 *   non_winner_payment = installment amount actually paid by non-winners
 *
 * DO NOT use: profit, return, ROI, interest — those require a full cash-flow model.
 * DO NOT include: winner payout, our_payout_amount — mechanics unverified.
 */

// ──────────────────────────────────────────────────────────────────
// Event types
// ──────────────────────────────────────────────────────────────────

export type ChitEventType =
  | 'NORMAL'
  | 'SPECIAL_NO_AUCTION'
  | 'FINAL'
  | 'UNKNOWN'

// ──────────────────────────────────────────────────────────────────
// Calculation input
// ──────────────────────────────────────────────────────────────────

export interface NormalAuctionInput {
  /** Nominal value of the chit (e.g. 300000 for ₹3L). Must be > 0. */
  face_value: number
  /** Fixed monthly installment before any thallu reduction. Must be >= 0. */
  base_installment: number
  /** Number of members in the chit group. Must be > 0. */
  member_count: number
  /** Auction discount bid by the winning member. Must be >= 0. */
  thallu: number
  /** Organiser commission deducted from thallu. Must be >= 0 and <= thallu. */
  commission: number
  /** The event type for this round — engine will only apply the normal
   *  formula when this is 'NORMAL'. */
  event_type: ChitEventType
}

// ──────────────────────────────────────────────────────────────────
// Calculation results (discriminated union)
// ──────────────────────────────────────────────────────────────────

/**
 * Returned for a valid NORMAL event type.
 * All monetary values are represented as numbers with sufficient
 * precision (see calculation.ts for exact-decimal handling).
 */
export interface CalculationSuccess {
  kind: 'success'
  event_type: 'NORMAL'
  /** Input echo */
  face_value: number
  base_installment: number
  member_count: number
  thallu: number
  commission: number
  /** Derived values */
  net_thallu: number
  member_thallu: number
  non_winner_payment: number
  /**
   * Optional consistency note: present if face_value does not equal
   * base_installment × member_count. This is informational only —
   * it does NOT invalidate the calculation.
   */
  face_value_mismatch?: {
    expected_face_value: number
    actual_face_value: number
    note: string
  }
}

/**
 * Returned for event types where the normal auction formula
 * does not apply: SPECIAL_NO_AUCTION, FINAL, UNKNOWN.
 *
 * The engine does NOT invent values for these types.
 */
export interface CalculationNotApplicable {
  kind: 'not_applicable'
  event_type: Exclude<ChitEventType, 'NORMAL'>
  reason: string
}

/**
 * Returned when input validation fails.
 * Contains structured error information — never NaN or silently wrong values.
 */
export interface CalculationError {
  kind: 'error'
  errors: ValidationError[]
}

export interface ValidationError {
  field: keyof NormalAuctionInput | 'general'
  message: string
}

/** Top-level discriminated union returned by calculateAuction() */
export type AuctionCalculationResult =
  | CalculationSuccess
  | CalculationNotApplicable
  | CalculationError

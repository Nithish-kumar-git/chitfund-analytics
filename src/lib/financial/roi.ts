/**
 * Completed Chit ROI Engine — Phase 7E
 *
 * Rules:
 * - ROI is ONLY computed for chits where ALL four prerequisites are met.
 * - ONLY actual effective (non-superseded) ledger entries are used.
 * - MANUAL_CORRECTION entries are counted via their effective type (inherited from the
 *   original they correct); the original (superseded) is excluded.
 * - No projected, assumed, or invented cash flows are ever introduced.
 * - Division by zero is explicitly guarded.
 * - XIRR and annualisation are NOT implemented here.
 *
 * @see docs/financial-model-spec.md §10–11
 */

import type { LedgerEntryType } from '@/types/database'

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/**
 * A single effective ledger entry already resolved by the caller.
 * Superseded originals must be excluded by the caller before passing in.
 * MANUAL_CORRECTION entries must carry `effectiveEntryType` set to the
 * entry_type of the original entry they correct.
 */
export interface EffectiveLedgerEntry {
  id: string
  entry_type: LedgerEntryType
  /**
   * For MANUAL_CORRECTION rows, this is the entry_type of the original
   * corrected row. For all other rows, this equals entry_type.
   */
  effective_entry_type: LedgerEntryType
  /** Always a positive absolute value as stored in the DB. */
  amount: number
  transaction_date: string
}

/**
 * Minimal chit configuration needed for ROI prerequisite checks.
 * No financial assumptions are derived from these values.
 */
export interface RoiChitConfig {
  status: string
  duration_months: number
}

/**
 * Prerequisite inputs for computing completed-chit ROI.
 */
export interface RoiInput {
  chit: RoiChitConfig
  /** Number of auction_events rows recorded for this chit. */
  recordedRoundCount: number
  /**
   * All NON-SUPERSEDED effective ledger entries. The caller is responsible
   * for the correction/superseded logic before passing this list in.
   */
  effectiveEntries: EffectiveLedgerEntry[]
  /**
   * True if any effective (non-superseded) ledger entry has
   * calculation_status = 'FLAGGED_MISMATCH'.
   */
  hasFlaggedMismatch: boolean
  /**
   * True if the user has explicitly verified that all actual cash flows
   * (installments and payouts) have been fully recorded. The system cannot
   * mathematically prove this.
   */
  isCashFlowVerified: boolean
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type RoiUnavailableReason =
  | 'CHIT_NOT_COMPLETED'
  | 'ROUNDS_MISSING'
  | 'FLAGGED_MISMATCH'
  | 'NO_ENTRIES'
  | 'ZERO_TOTAL_PAID'
  | 'DATA_COMPLETENESS_UNVERIFIED'

export interface RoiUnavailable {
  status: 'UNAVAILABLE'
  reasons: RoiUnavailableReason[]
}

export interface RoiResult {
  status: 'AVAILABLE'
  /** Sum of effective INSTALLMENT_PAID + LATE_FEE + negative ADJUSTMENT amounts. */
  totalActualPaid: number
  /**
   * Sum of effective AUCTION_PAYOUT_RECEIVED + MATURITY_SETTLEMENT
   * + positive ADJUSTMENT amounts.
   */
  totalActualReceived: number
  /** totalActualReceived - totalActualPaid */
  netActualCashFlow: number
  /** (netActualCashFlow / totalActualPaid) * 100 */
  simpleRoiPercent: number
}

export type RoiOutcome = RoiResult | RoiUnavailable

// ---------------------------------------------------------------------------
// Direction helpers — entry_type to outflow/inflow classification
// ---------------------------------------------------------------------------

/** Returns true if this effective entry type is an outflow (we paid). */
function isOutflow(effectiveType: LedgerEntryType): boolean {
  return effectiveType === 'INSTALLMENT_PAID' || effectiveType === 'LATE_FEE'
}

/** Returns true if this effective entry type is an inflow (we received). */
function isInflow(effectiveType: LedgerEntryType): boolean {
  return (
    effectiveType === 'AUCTION_PAYOUT_RECEIVED' ||
    effectiveType === 'MATURITY_SETTLEMENT'
  )
}

/**
 * ADJUSTMENT is sign-aware per the spec (§8.1):
 *   negative amount → outflow
 *   positive amount → inflow
 * Note: amounts as stored in the DB are absolute values recorded by the ingestion
 * pipeline. Per spec §8.2 historical note, INSTALLMENT_PAID was stored as positive.
 * For ADJUSTMENT we follow the sign convention from the entry_type description.
 * Since the DB field is `amount` (NUMERIC), we treat negative stored values as
 * an outflow contribution and positive stored values as an inflow contribution.
 */
function adjustmentContribution(amount: number): { outflow: number; inflow: number } {
  if (amount < 0) return { outflow: Math.abs(amount), inflow: 0 }
  if (amount > 0) return { outflow: 0, inflow: amount }
  return { outflow: 0, inflow: 0 }
}

// ---------------------------------------------------------------------------
// Core ROI computation
// ---------------------------------------------------------------------------

/**
 * Computes the completed-chit ROI or returns an explicit unavailability result.
 *
 * DOES NOT:
 * - Project future cash flows.
 * - Assume KULUKAL thallu = 0.
 * - Compute face_value - thallu as a winner payout fallback.
 * - Annualise returns.
 * - Use XIRR.
 *
 * @param input - Prerequisite data already loaded by the caller.
 * @returns RoiOutcome — either a complete result or an explicit unavailability.
 */
export function computeCompletedRoi(input: RoiInput): RoiOutcome {
  const reasons: RoiUnavailableReason[] = []

  // Prerequisite 1: chit must be COMPLETED
  if (input.chit.status !== 'COMPLETED') {
    reasons.push('CHIT_NOT_COMPLETED')
  }

  // Prerequisite 2: all expected rounds must be recorded
  if (input.recordedRoundCount < input.chit.duration_months) {
    reasons.push('ROUNDS_MISSING')
  }

  // Prerequisite 3: no unresolved FLAGGED_MISMATCH entries
  if (input.hasFlaggedMismatch) {
    reasons.push('FLAGGED_MISMATCH')
  }

  // Prerequisite 4: at least one effective entry must exist (data completeness)
  if (input.effectiveEntries.length === 0) {
    reasons.push('NO_ENTRIES')
  }

  // Prerequisite 5: User must have explicitly verified cash flow completeness
  // since the system cannot mathematically prove it.
  if (!input.isCashFlowVerified) {
    reasons.push('DATA_COMPLETENESS_UNVERIFIED')
  }

  // Bail early if any prerequisite failed
  if (reasons.length > 0) {
    return { status: 'UNAVAILABLE', reasons }
  }

  // ---------------------------------------------------------------------------
  // Aggregate effective cash flows
  // ---------------------------------------------------------------------------
  let totalActualPaid = 0
  let totalActualReceived = 0

  for (const entry of input.effectiveEntries) {
    const t = entry.effective_entry_type
    const amt = Math.abs(entry.amount)

    if (isOutflow(t)) {
      totalActualPaid += amt
    } else if (isInflow(t)) {
      totalActualReceived += amt
    } else if (t === 'ADJUSTMENT') {
      const { outflow, inflow } = adjustmentContribution(entry.amount)
      totalActualPaid += outflow
      totalActualReceived += inflow
    }
    // MANUAL_CORRECTION: its effective_entry_type is set to the original's type,
    // so it is already handled by the outflow/inflow/adjustment branches above.
    // The original superseded entry was excluded by the caller.
  }

  // Guard against division by zero
  if (totalActualPaid === 0) {
    return { status: 'UNAVAILABLE', reasons: ['ZERO_TOTAL_PAID'] }
  }

  const netActualCashFlow = totalActualReceived - totalActualPaid
  const simpleRoiPercent = (netActualCashFlow / totalActualPaid) * 100

  return {
    status: 'AVAILABLE',
    totalActualPaid,
    totalActualReceived,
    netActualCashFlow,
    simpleRoiPercent,
  }
}

// ---------------------------------------------------------------------------
// Active Cash Flow computation
// ---------------------------------------------------------------------------

/**
 * Computes the running cash flow metrics for any chit (active or completed)
 * without computing ROI or requiring completeness checks.
 */
export function computeActiveMetrics(effectiveEntries: EffectiveLedgerEntry[]) {
  let totalActualPaid = 0
  let totalActualReceived = 0

  for (const entry of effectiveEntries) {
    const t = entry.effective_entry_type
    const amt = Math.abs(entry.amount)

    if (isOutflow(t)) {
      totalActualPaid += amt
    } else if (isInflow(t)) {
      totalActualReceived += amt
    } else if (t === 'ADJUSTMENT') {
      const { outflow, inflow } = adjustmentContribution(entry.amount)
      totalActualPaid += outflow
      totalActualReceived += inflow
    }
  }

  return {
    totalActualPaid,
    totalActualReceived,
    netActualCashFlow: totalActualReceived - totalActualPaid,
  }
}

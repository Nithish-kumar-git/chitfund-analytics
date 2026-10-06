/**
 * build-statement-data.ts
 *
 * Pure, framework-free function that assembles the data needed to render an
 * individual chit statement (print/PDF, XLSX, AI brief, etc.).
 *
 * RULES:
 * - Does NOT reimplement any financial logic.
 * - Delegates to computeCompletedRoi / computeActiveMetrics.
 * - Effective-entry logic mirrors the main page exactly (supersede-safe).
 * - UNKNOWN remains UNKNOWN; SPECIAL_NO_AUCTION has no individual winner.
 * - expected (non_winner_payment) is never substituted for actual paid.
 * - Superseded ledger entries are excluded from cash-flow totals.
 * - No external side effects.
 */

import type { Chit, AuctionEvent, LedgerEntryType } from '@/types/database'
import {
  computeCompletedRoi,
  computeActiveMetrics,
  type EffectiveLedgerEntry,
  type RoiOutcome,
} from '@/lib/financial/roi'
import { computeInstallmentSavings, type InstallmentSavingsMetrics } from '@/lib/financial/savings'

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/**
 * Minimal ledger row needed by this module.
 * Mirrors the columns fetched by the main chit page.
 */
export interface StatementLedgerRow {
  id: string
  transaction_date: string
  entry_type: LedgerEntryType
  amount: number
  notes: string | null
  created_at: string
  round_number: number | null
  auction_event_id: string | null
  corrects_entry_id: string | null
  is_superseded: boolean
  effective_entry_type: LedgerEntryType
}

export interface StatementInput {
  chit: Chit
  companyName: string | null
  auctionEvents: AuctionEvent[]
  /** All ledger rows with supersede metadata already resolved. */
  ledgerRows: StatementLedgerRow[]
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type WinnerDisplay =
  | 'WE_WON'
  | 'SOMEONE_ELSE_WON'
  | 'UNKNOWN'
  | 'NOT_APPLICABLE' // SPECIAL_NO_AUCTION

export interface StatementRound {
  roundNumber: number
  eventType: AuctionEvent['event_type']
  calculationStatus: AuctionEvent['calculation_status']
  auctionDate: string | null
  paymentDate: string | null
  thallu: number | null
  commission: number | null
  memberThallu: number | null
  /** Expected / configured installment (non_winner_payment). NOT actual paid. */
  expectedInstallment: number | null
  /** Sum of effective INSTALLMENT_PAID / LATE_FEE ledger entries for this round. */
  actualPaid: number | null
  /** Sum of effective AUCTION_PAYOUT_RECEIVED / MATURITY_SETTLEMENT for this round. */
  actualPayout: number | null
  savedThisRound: number | null
  cumulativeNormal: number | null
  cumulativePaid: number | null
  cumulativeSaved: number | null
  winner: WinnerDisplay
  notes: string | null
}

export interface StatementCashFlowRow {
  id: string
  date: string
  entryType: LedgerEntryType
  effectiveEntryType: LedgerEntryType
  roundNumber: number | null
  amount: number
  isSuperseded: boolean
  notes: string | null
}

export type DataQualityFlag =
  | { kind: 'UNVERIFIED_COMPLETED'; message: string }
  | { kind: 'FLAGGED_MISMATCH'; round: number; message: string }
  | { kind: 'UNKNOWN_EVENT'; round: number; message: string }
  | { kind: 'MISSING_WINNER'; round: number; message: string }
  | { kind: 'MISSING_AUCTION_DATE'; round: number; message: string }
  | { kind: 'MISSING_CASH_FLOW'; round: number; message: string }

export interface StatementData {
  chit: Chit
  companyName: string | null
  rounds: StatementRound[]
  cashFlow: StatementCashFlowRow[]
  effectiveEntries: EffectiveLedgerEntry[]
  roiOutcome: RoiOutcome
  activeMetrics: {
    totalActualPaid: number
    totalActualReceived: number
    netActualCashFlow: number
  }
  hasFlaggedMismatch: boolean
  isCashFlowVerified: boolean
  qualityFlags: DataQualityFlag[]
  generatedAt: string
  installmentSavings: InstallmentSavingsMetrics | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveWinner(event: AuctionEvent): WinnerDisplay {
  if (event.event_type === 'SPECIAL_NO_AUCTION') return 'NOT_APPLICABLE'
  if (event.won_by_us === true) return 'WE_WON'
  if (event.won_by_us === false) return 'SOMEONE_ELSE_WON'
  return 'UNKNOWN'
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

/**
 * Assembles statement data from pre-fetched, pre-resolved rows.
 *
 * The caller must:
 *  1. Resolve is_superseded and effective_entry_type on each ledger row.
 *  2. Pass all ledger rows (including superseded) so the cash-flow section
 *     can show/dim them as appropriate.
 *
 * This function does NOT touch the database.
 */
export function buildStatementData(input: StatementInput): StatementData {
  const { chit, companyName, auctionEvents, ledgerRows } = input

  const generatedAt = new Date().toISOString()

  // Effective entries (non-superseded)
  const effectiveEntries: EffectiveLedgerEntry[] = ledgerRows
    .filter((r) => !r.is_superseded)
    .map((r) => ({
      id: r.id,
      entry_type: r.entry_type,
      effective_entry_type: r.effective_entry_type,
      amount: r.amount,
      transaction_date: r.transaction_date,
    }))

  const hasFlaggedMismatch = auctionEvents.some(
    (e) => e.calculation_status === 'FLAGGED_MISMATCH'
  )
  const isCashFlowVerified = chit.verified_at !== null && chit.verified_by !== null

  const roiOutcome = computeCompletedRoi({
    chit: { status: chit.status, duration_months: chit.duration_months },
    recordedRoundCount: auctionEvents.length,
    effectiveEntries,
    hasFlaggedMismatch,
    isCashFlowVerified,
  })

  const activeMetrics = computeActiveMetrics(effectiveEntries)

  // Build event-id -> effective-rows lookup for round actuals
  const effectiveByEventId = new Map<string, StatementLedgerRow[]>()
  for (const row of ledgerRows) {
    if (row.is_superseded || !row.auction_event_id) continue
    const existing = effectiveByEventId.get(row.auction_event_id) ?? []
    existing.push(row)
    effectiveByEventId.set(row.auction_event_id, existing)
  }

  // Build rounds (chronological ascending)
  const sortedEvents = [...auctionEvents].sort(
    (a, b) => a.round_number - b.round_number
  )

  const rounds: StatementRound[] = sortedEvents.map((event) => {
    const roundEntries = effectiveByEventId.get(event.id) ?? []

    const actualPaidEntries = roundEntries.filter(
      (r) =>
        r.effective_entry_type === 'INSTALLMENT_PAID' ||
        r.effective_entry_type === 'LATE_FEE'
    )

    const actualPaidAmt = actualPaidEntries.reduce((sum, r) => sum + Math.abs(r.amount), 0)

    const paymentDate = actualPaidEntries.length > 0 ? actualPaidEntries[0].transaction_date : null

    const actualPayoutAmt = roundEntries
      .filter(
        (r) =>
          r.effective_entry_type === 'AUCTION_PAYOUT_RECEIVED' ||
          r.effective_entry_type === 'MATURITY_SETTLEMENT'
      )
      .reduce((sum, r) => sum + Math.abs(r.amount), 0)

    return {
      roundNumber: event.round_number,
      eventType: event.event_type,
      calculationStatus: event.calculation_status,
      auctionDate: event.auction_date,
      paymentDate,
      thallu: event.thallu != null ? Number(event.thallu) : null,
      commission: event.commission != null ? Number(event.commission) : null,
      memberThallu: event.member_thallu != null ? Number(event.member_thallu) : null,
      expectedInstallment:
        event.non_winner_payment != null ? Number(event.non_winner_payment) : null,
      actualPaid: actualPaidAmt > 0 ? actualPaidAmt : null,
      actualPayout: actualPayoutAmt > 0 ? actualPayoutAmt : null,
      savedThisRound: null,
      cumulativeNormal: null,
      cumulativePaid: null,
      cumulativeSaved: null,
      winner: resolveWinner(event),
      notes: event.notes,
    }
  })

  const { metrics: installmentSavings, roundSavingsByNumber } = computeInstallmentSavings(
    Number(chit.base_installment),
    rounds.map(r => ({ roundNumber: r.roundNumber, actualPaid: r.actualPaid }))
  )

  for (const round of rounds) {
    const savings = roundSavingsByNumber[round.roundNumber]
    if (savings) {
      round.savedThisRound = savings.savedThisRound
      round.cumulativeNormal = savings.cumulativeNormal
      round.cumulativePaid = savings.cumulativePaid
      round.cumulativeSaved = savings.cumulativeSaved
    }
  }

  // Cash-flow rows (all rows, sorted chronologically)
  const cashFlow: StatementCashFlowRow[] = [...ledgerRows]
    .sort(
      (a, b) =>
        new Date(a.transaction_date + 'T00:00:00').getTime() -
        new Date(b.transaction_date + 'T00:00:00').getTime()
    )
    .map((r) => ({
      id: r.id,
      date: r.transaction_date,
      entryType: r.entry_type,
      effectiveEntryType: r.effective_entry_type,
      roundNumber: r.round_number,
      amount: Math.abs(r.amount),
      isSuperseded: r.is_superseded,
      notes: r.notes,
    }))

  // Data quality flags
  const qualityFlags: DataQualityFlag[] = []

  if (chit.status === 'COMPLETED' && !chit.verified_at) {
    qualityFlags.push({
      kind: 'UNVERIFIED_COMPLETED',
      message: 'Pending — transactions recorded, but cash-flow verification has not been completed.',
    })
  }

  for (const event of sortedEvents) {
    if (event.calculation_status === 'FLAGGED_MISMATCH') {
      qualityFlags.push({
        kind: 'FLAGGED_MISMATCH',
        round: event.round_number,
        message: 'Calculated financial fields mismatch the parsed source text.',
      })
    }
    if (event.event_type === 'UNKNOWN') {
      qualityFlags.push({
        kind: 'UNKNOWN_EVENT',
        round: event.round_number,
        message: 'Event type could not be determined from source data.',
      })
    }
    if (event.event_type === 'NORMAL' && event.won_by_us === null) {
      qualityFlags.push({
        kind: 'MISSING_WINNER',
        round: event.round_number,
        message: 'Winner status is unconfirmed for this NORMAL round.',
      })
    }
    const roundEffective = effectiveByEventId.get(event.id) ?? []
    const hasPaymentDate = roundEffective.length > 0

    if (!event.auction_date) {
      qualityFlags.push({
        kind: 'MISSING_AUCTION_DATE',
        round: event.round_number,
        message: hasPaymentDate ? 'Auction date is missing; payment date is recorded.' : 'Auction date is missing.',
      })
    }
    if (!hasPaymentDate) {
      qualityFlags.push({
        kind: 'MISSING_CASH_FLOW',
        round: event.round_number,
        message: 'No effective cash-flow entries recorded for this round.',
      })
    }
  }

  return {
    chit,
    companyName,
    rounds,
    cashFlow,
    effectiveEntries,
    roiOutcome,
    activeMetrics,
    hasFlaggedMismatch,
    isCashFlowVerified,
    qualityFlags,
    generatedAt,
    installmentSavings,
  }
}

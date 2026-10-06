import type { ChitEventType } from '@/lib/calculations/types'
import type { WhatsAppParseResult, CrossCheckResult, ParseSuccess, ParsePartial, ParseError } from '@/lib/whatsapp/types'

export type IngestionStatus =
  | 'READY_FOR_CONFIRMATION'
  | 'NEEDS_REVIEW'
  | 'DUPLICATE'
  | 'PARSE_FAILED'

export interface IngestionInput {
  profile_id: string
  chit_id?: string
  raw_text: string
  received_at?: Date
  round_number?: number // Explicitly provided by user if missing in text
}

// ─────────────────────────────────────────────────────────────────
// Ingestion Result States
// ─────────────────────────────────────────────────────────────────

export interface IngestionResultBase {
  status: IngestionStatus
  input: IngestionInput
  hash: string // djb2 normalized content hash
  warnings: string[]
}

export interface IngestionDuplicate extends IngestionResultBase {
  status: 'DUPLICATE'
}

export interface IngestionParseFailed extends IngestionResultBase {
  status: 'PARSE_FAILED'
  parse_result: ParseError
}

export interface IngestionNeedsReview extends IngestionResultBase {
  status: 'NEEDS_REVIEW'
  parse_result: ParseSuccess | ParsePartial
  cross_check_result?: CrossCheckResult
  proposed_calculation_status: 'FLAGGED_MISMATCH' | 'INDUSTRY_DEFAULT' | 'VERIFIED_FORMULA'
}

export interface IngestionReady extends IngestionResultBase {
  status: 'READY_FOR_CONFIRMATION'
  parse_result: ParseSuccess | ParsePartial
  cross_check_result?: CrossCheckResult
  proposed_calculation_status: 'VERIFIED_FORMULA' | 'INDUSTRY_DEFAULT'
}

export type IngestionResult =
  | IngestionDuplicate
  | IngestionParseFailed
  | IngestionNeedsReview
  | IngestionReady

// ─────────────────────────────────────────────────────────────────
// Confirmation Model
// ─────────────────────────────────────────────────────────────────

export type CalculationStatus = 'VERIFIED_FORMULA' | 'INDUSTRY_DEFAULT' | 'MANUAL_OVERRIDE' | 'FLAGGED_MISMATCH' | 'CONFIRM_SOURCE'

export interface ConfirmedAuctionEvent {
  round_number: number
  event_type: ChitEventType
  thallu?: number
  commission?: number
  net_thallu?: number
  member_thallu?: number
  non_winner_payment?: number
  won_by_us?: boolean | null
  our_payout_amount?: number
  calculation_status: CalculationStatus
  auction_date?: Date
  notes?: string
}

export interface ConfirmedLedgerEntry {
  entry_type: 'INSTALLMENT_PAID' | 'AUCTION_PAYOUT_RECEIVED'
  amount: number
  transaction_date: Date
  notes?: string
}

export interface ConfirmedIngestion {
  profile_id: string
  chit_id?: string
  raw_text: string
  received_at?: Date
  content_hash: string
  parse_status: 'PARSED' | 'PENDING' | 'PARSE_FAILED'

  existing_source_message_id?: string

  auction_event?: ConfirmedAuctionEvent
  /**
   * One or more ledger entries to persist in insertion order.
   * A winner round produces 2 entries: INSTALLMENT_PAID + AUCTION_PAYOUT_RECEIVED.
   * A non-winner round produces 1 entry: INSTALLMENT_PAID.
   * If omitted, no ledger entry is created.
   */
  ledger_entries?: ConfirmedLedgerEntry[]
  /** @deprecated Use ledger_entries instead. Kept for backwards compatibility only. */
  ledger_entry?: ConfirmedLedgerEntry
}

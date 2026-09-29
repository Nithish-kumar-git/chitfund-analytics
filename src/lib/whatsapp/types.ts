/**
 * Chit Fund Analytics — WhatsApp Parser Types
 *
 * Discriminated union for all parse outcomes.
 * The parser EXTRACTS — it does NOT calculate.
 * Financial formulas live exclusively in src/lib/calculations/calculation.ts.
 */

import type { ChitEventType } from '@/lib/calculations/types'

// ─────────────────────────────────────────────────────────────────
// Extracted fields (all optional — only set when confidently parsed)
// ─────────────────────────────────────────────────────────────────

/**
 * Values read directly from the WhatsApp message text.
 *
 * CRITICAL DISTINCTION:
 *   stated_member_thallu — what the MESSAGE says the per-member reduction is.
 *   stated_payment       — what the MESSAGE says members should pay.
 *
 * These are NOT the same as the calculation engine's outputs.
 * A later validation layer will compare stated vs. calculated values.
 * The parser must NEVER replace a stated value with a calculated one.
 */
export interface ParsedFields {
  /** Total auction discount bid. Tamil: தள்ளு */
  thallu?: number
  /** Whether the message explicitly states there is no thallu (தள்ளு இல்லை) */
  thallu_absent?: true
  /** Organiser commission. Tamil: கமிஷன் */
  commission?: number
  /** Per-member reduction stated in the message. Tamil: ஒரு நபர் தள்ளு */
  stated_member_thallu?: number
  /** Payment amount stated in the message. Tamil: கட்ட வேண்டிய தொகை */
  stated_payment?: number
}

/**
 * Optional metadata — only populated when reliably identifiable.
 * Never invented. If uncertain, field is omitted and a warning is added.
 */
export interface ParsedMetadata {
  /** e.g. "3 lakh chit", "6L", from message header/label */
  group_label?: string
  /** Chit face value if stated explicitly in the message */
  face_value?: number
  /** Round/month number. Only extracted when the pattern is unambiguous. */
  round_number?: number
  /** Date string from the message, unparsed (preserves original format) */
  event_date_raw?: string
}

// ─────────────────────────────────────────────────────────────────
// Parse result variants
// ─────────────────────────────────────────────────────────────────

/** Common fields shared by all parse result variants */
interface ParseResultBase {
  /** The unmodified original message text — always preserved */
  raw_text: string
  /** Normalised text used internally for matching (for debugging) */
  normalised_text: string
  /** SHA-256-like deterministic content hash of normalised_text */
  content_hash: string
  /** Warnings about ambiguous content or missing optional fields */
  warnings: string[]
}

/**
 * All four required fields were confidently extracted.
 * event_type is determined with sufficient evidence.
 */
export interface ParseSuccess extends ParseResultBase {
  kind: 'success'
  event_type: ChitEventType
  fields: Required<ParsedFields>  // thallu or thallu_absent, commission, stated_member_thallu, stated_payment
  metadata: ParsedMetadata
}

/**
 * The message appears to be a chit message (contains recognised labels)
 * but one or more expected fields could not be extracted.
 * Contains whatever was successfully extracted.
 */
export interface ParsePartial extends ParseResultBase {
  kind: 'partial'
  event_type: ChitEventType
  fields: ParsedFields
  metadata: ParsedMetadata
  /** Which fields were not found */
  missing_fields: (keyof ParsedFields)[]
}

/**
 * The text does not appear to be a recognisable chit message.
 */
export interface ParseError extends ParseResultBase {
  kind: 'error'
  reason: string
}

export type WhatsAppParseResult = ParseSuccess | ParsePartial | ParseError

// ─────────────────────────────────────────────────────────────────
// Cross-check result (used by validation helper, not the parser)
// ─────────────────────────────────────────────────────────────────

export interface CrossCheckMatch {
  kind: 'match'
  calculated_member_thallu: number
  calculated_non_winner_payment: number
  stated_member_thallu: number
  stated_payment: number
}

export interface CrossCheckMismatch {
  kind: 'mismatch'
  calculated_member_thallu: number
  calculated_non_winner_payment: number
  stated_member_thallu: number
  stated_payment: number
  member_thallu_delta: number
  payment_delta: number
}

export interface CrossCheckNotApplicable {
  kind: 'not_applicable'
  reason: string
}

export type CrossCheckResult =
  | CrossCheckMatch
  | CrossCheckMismatch
  | CrossCheckNotApplicable

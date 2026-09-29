/**
 * Chit Fund Analytics — WhatsApp Chit Message Parser
 *
 * EXTRACTS structured fields from raw WhatsApp chit-fund messages.
 * Does NOT calculate anything. Financial formulas are in:
 *   src/lib/calculations/calculation.ts
 *
 * Pipeline:
 *   raw text → normalise → detect event type → extract fields → classify result
 */

import { normaliseMessage, parseMoneyString } from './normalize'
import { contentHash } from './hash'
import {
  CHIT_RECOGNITION_PATTERNS,
  THALLU_ABSENT_PATTERN,
  FINAL_ROUND_PATTERNS,
  THALLU_PATTERN,
  COMMISSION_PATTERN,
  STATED_MEMBER_THALLU_PATTERN,
  STATED_PAYMENT_PATTERN,
  ROUND_NUMBER_PATTERN,
  FACE_VALUE_LAKH_PATTERN,
  FACE_VALUE_AMOUNT_PATTERN,
  extractMoneyFromMatch,
} from './labels'
import type {
  WhatsAppParseResult,
  ParsedFields,
  ParsedMetadata,
  ParseSuccess,
  ParsePartial,
  ParseError,
} from './types'
import type { ChitEventType } from '@/lib/calculations/types'

// ─────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────

/**
 * Parse a raw WhatsApp chit message into a structured result.
 *
 * Returns one of:
 *   { kind: 'success' }  — all four fields extracted, event type determined
 *   { kind: 'partial' }  — recognised as chit message but fields missing
 *   { kind: 'error' }    — not recognisable as a chit message
 */
export function parseWhatsAppMessage(rawText: string): WhatsAppParseResult {
  const warnings: string[] = []

  // ── Step 1: Normalise ────────────────────────────────────────────
  const normalised = normaliseMessage(rawText)
  const hash = contentHash(normalised)

  const base = {
    raw_text: rawText,
    normalised_text: normalised,
    content_hash: hash,
    warnings,
  }

  // ── Step 2: Gate — is this a chit message at all? ────────────────
  const isChitMessage = CHIT_RECOGNITION_PATTERNS.some(p => p.test(normalised))
  if (!isChitMessage) {
    return {
      ...base,
      kind: 'error',
      reason:
        'No recognised chit-fund labels found. ' +
        'Text does not appear to be a chit fund message.',
    } satisfies ParseError
  }

  // ── Step 3: Detect event type ────────────────────────────────────
  const eventType = detectEventType(normalised, warnings)

  // ── Step 4: Extract metadata ─────────────────────────────────────
  const metadata = extractMetadata(normalised, warnings)

  // ── Step 5: Extract fields ───────────────────────────────────────
  const fields = extractFields(normalised, warnings)

  // ── Step 6: Classify result ──────────────────────────────────────
  const requiredFields: (keyof ParsedFields)[] = [
    'commission',
    'stated_member_thallu',
    'stated_payment',
  ]
  // thallu OR thallu_absent must be present
  const hasThalluInfo = fields.thallu !== undefined || fields.thallu_absent === true
  if (!hasThalluInfo) requiredFields.push('thallu')

  const missingFields = requiredFields.filter(f => fields[f] === undefined)

  if (missingFields.length === 0 && hasThalluInfo) {
    return {
      ...base,
      kind: 'success',
      event_type: eventType,
      fields: fields as Required<ParsedFields>,
      metadata,
    } satisfies ParseSuccess
  }

  return {
    ...base,
    kind: 'partial',
    event_type: eventType,
    fields,
    metadata,
    missing_fields: missingFields,
  } satisfies ParsePartial
}

// ─────────────────────────────────────────────────────────────────
// Event type detection
// ─────────────────────────────────────────────────────────────────

function detectEventType(
  normalised: string,
  warnings: string[],
): ChitEventType {
  // Check for FINAL first (explicit only)
  if (FINAL_ROUND_PATTERNS.some(p => p.test(normalised))) {
    return 'FINAL'
  }

  // Check for explicit SPECIAL_NO_AUCTION (தள்ளு இல்லை — must be present)
  if (THALLU_ABSENT_PATTERN.test(normalised)) {
    return 'SPECIAL_NO_AUCTION'
  }

  // Check for NORMAL: must have evidence of thallu > 0 AND commission
  const hasThalluAmount = THALLU_PATTERN.test(normalised)
  const hasCommission = COMMISSION_PATTERN.test(normalised)
  const hasMemberThallu = STATED_MEMBER_THALLU_PATTERN.test(normalised)
  const hasPayment = STATED_PAYMENT_PATTERN.test(normalised)

  if (hasThalluAmount && hasCommission && (hasMemberThallu || hasPayment)) {
    // Extract thallu to confirm it's > 0
    const thalluMatch = normalised.match(THALLU_PATTERN)
    const thalluStr = extractMoneyFromMatch(thalluMatch)
    const thalluVal = thalluStr ? parseMoneyString(thalluStr) : undefined
    if (thalluVal !== undefined && thalluVal > 0) {
      return 'NORMAL'
    }
    // thallu == 0 with commission present — ambiguous
    warnings.push(
      'thallu appears to be 0 with commission present — event type is ambiguous; ' +
        'defaulting to UNKNOWN. Review manually.',
    )
    return 'UNKNOWN'
  }

  if (!hasThalluAmount && !hasMemberThallu && !hasPayment) {
    warnings.push(
      'Insufficient field evidence to determine event type; defaulting to UNKNOWN.',
    )
  }

  return 'UNKNOWN'
}

// ─────────────────────────────────────────────────────────────────
// Field extraction
// ─────────────────────────────────────────────────────────────────

function extractFields(normalised: string, warnings: string[]): ParsedFields {
  const fields: ParsedFields = {}

  // தள்ளு இல்லை — no-thallu flag (must check before thallu amount)
  if (THALLU_ABSENT_PATTERN.test(normalised)) {
    fields.thallu_absent = true
    // thallu stays undefined when absent is flagged
  } else {
    // தள்ளு [amount]
    const thalluMatch = normalised.match(THALLU_PATTERN)
    const thalluStr = extractMoneyFromMatch(thalluMatch)
    if (thalluStr !== undefined) {
      const v = parseMoneyString(thalluStr)
      if (v !== undefined) {
        fields.thallu = v
      } else {
        warnings.push(`Could not parse thallu amount from: "${thalluStr}"`)
      }
    }
  }

  // கமிஷன்
  const commissionMatch = normalised.match(COMMISSION_PATTERN)
  const commissionStr = extractMoneyFromMatch(commissionMatch)
  if (commissionStr !== undefined) {
    const v = parseMoneyString(commissionStr)
    if (v !== undefined) {
      fields.commission = v
    } else {
      warnings.push(`Could not parse commission amount from: "${commissionStr}"`)
    }
  }

  // ஒரு நபர் தள்ளு (stated_member_thallu — NOT calculated)
  const memberThalluMatch = normalised.match(STATED_MEMBER_THALLU_PATTERN)
  const memberThalluStr = extractMoneyFromMatch(memberThalluMatch)
  if (memberThalluStr !== undefined) {
    const v = parseMoneyString(memberThalluStr)
    if (v !== undefined) {
      fields.stated_member_thallu = v
    } else {
      warnings.push(
        `Could not parse stated_member_thallu from: "${memberThalluStr}"`,
      )
    }
  }

  // கட்ட வேண்டிய தொகை (stated_payment — NOT calculated)
  const paymentMatch = normalised.match(STATED_PAYMENT_PATTERN)
  const paymentStr = extractMoneyFromMatch(paymentMatch)
  if (paymentStr !== undefined) {
    const v = parseMoneyString(paymentStr)
    if (v !== undefined) {
      fields.stated_payment = v
    } else {
      warnings.push(
        `Could not parse stated_payment from: "${paymentStr}"`,
      )
    }
  }

  return fields
}

// ─────────────────────────────────────────────────────────────────
// Metadata extraction (opportunistic — never invented)
// ─────────────────────────────────────────────────────────────────

function extractMetadata(
  normalised: string,
  warnings: string[],
): ParsedMetadata {
  const metadata: ParsedMetadata = {}

  // Round number — only when pattern is explicit
  const roundMatch = normalised.match(ROUND_NUMBER_PATTERN)
  if (roundMatch) {
    // Match groups: [1] "9th round", [2] "round 9", [3] "9வது"
    const rawNum = roundMatch[1] ?? roundMatch[2] ?? roundMatch[3]
    const n = parseInt(rawNum, 10)
    if (!isNaN(n) && n > 0) {
      metadata.round_number = n
    } else {
      warnings.push(`Found round pattern but could not parse number: "${roundMatch[0]}"`)
    }
  }

  // Face value — lakh notation first
  const lakhMatch = normalised.match(FACE_VALUE_LAKH_PATTERN)
  if (lakhMatch) {
    const lakhs = parseFloat(lakhMatch[1])
    if (!isNaN(lakhs)) {
      metadata.face_value = lakhs * 100_000
      metadata.group_label = lakhMatch[0].trim()
    }
  } else {
    const fvMatch = normalised.match(FACE_VALUE_AMOUNT_PATTERN)
    const fvStr = extractMoneyFromMatch(fvMatch)
    if (fvStr) {
      const v = parseMoneyString(fvStr)
      if (v !== undefined) metadata.face_value = v
    }
  }

  return metadata
}

import { parseWhatsAppMessage, crossCheckWithCalculation, normaliseMessage, contentHash } from '@/lib/whatsapp'
import type { 
  IngestionInput, 
  IngestionResult, 
  IngestionReady, 
  IngestionNeedsReview,
  CalculationStatus
} from './types'

export interface ChitConfig {
  face_value: number
  base_installment: number
  member_count: number
}

/**
 * Pure function to process a WhatsApp message into an ingestion result state.
 * Does NOT persist to the database.
 * 
 * @param input The raw input data
 * @param isDuplicate Whether this content_hash already exists for this profile
 * @param chitConfig Optional chit configuration for calculation cross-checks
 */
export function processWhatsAppMessage(
  input: IngestionInput,
  isDuplicate: boolean,
  chitConfig?: ChitConfig
): IngestionResult {
  const normalised = normaliseMessage(input.raw_text)
  const hash = contentHash(normalised)
  const warnings: string[] = []

  // 1. Duplicate detection
  if (isDuplicate) {
    return {
      status: 'DUPLICATE',
      input,
      hash,
      warnings
    }
  }

  // 2. Parse message
  const parseResult = parseWhatsAppMessage(input.raw_text)
  if (parseResult.kind === 'error') {
    return {
      status: 'PARSE_FAILED',
      input,
      hash,
      warnings,
      parse_result: parseResult
    }
  }

  // Combine parser warnings
  warnings.push(...parseResult.warnings)

  // 3. Determine if we have a round number (from user input OR parse metadata)
  const roundNumber = input.round_number ?? parseResult.metadata.round_number
  if (!roundNumber) {
    warnings.push('Round number is missing.')
  }

  // 4. Cross-check if it's a NORMAL event and we have chit config
  let crossCheckResult
  let proposedCalculationStatus: CalculationStatus = 'INDUSTRY_DEFAULT'

  if (parseResult.event_type === 'NORMAL' && chitConfig) {
    crossCheckResult = crossCheckWithCalculation(parseResult.fields, chitConfig)
    if (crossCheckResult.kind === 'match') {
      proposedCalculationStatus = 'VERIFIED_FORMULA'
    } else if (crossCheckResult.kind === 'mismatch') {
      proposedCalculationStatus = 'FLAGGED_MISMATCH'
      warnings.push('Calculation mismatch detected.')
    }
  }

  // 5. Determine if Ready for Confirmation or Needs Review
  let isReady = true

  // Require round number for readiness
  if (!roundNumber) {
    isReady = false
  }

  // If partial parse, always needs review
  if (parseResult.kind === 'partial') {
    isReady = false
  }

  // If calculation mismatch, needs review
  if (crossCheckResult?.kind === 'mismatch') {
    isReady = false
  }

  // SPECIAL_NO_AUCTION is ready if round number is present
  // FINAL is always needs review because settlement mechanics are unverified
  if (parseResult.event_type === 'FINAL' || parseResult.event_type === 'UNKNOWN') {
    isReady = false
  }

  if (isReady) {
    return {
      status: 'READY_FOR_CONFIRMATION',
      input,
      hash,
      warnings,
      parse_result: parseResult,
      cross_check_result: crossCheckResult,
      proposed_calculation_status: proposedCalculationStatus
    } as IngestionReady
  }

  return {
    status: 'NEEDS_REVIEW',
    input,
    hash,
    warnings,
    parse_result: parseResult,
    cross_check_result: crossCheckResult,
    proposed_calculation_status: proposedCalculationStatus
  } as IngestionNeedsReview
}

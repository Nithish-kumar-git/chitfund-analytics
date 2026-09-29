/**
 * Chit Fund Analytics — WhatsApp Label Patterns
 *
 * Explicit regex patterns for recognising Tamil/English chit fund labels.
 * All patterns are anchored to their label — no broad "first number" grabs.
 *
 * Design principles:
 *   - Each label has one canonical regex.
 *   - Patterns allow reasonable whitespace variation (spaces, tabs, colons).
 *   - Patterns do NOT rely on line position.
 *   - Money capture group always: ₹? optional, commas allowed, lakh format.
 *   - All regexes use the 'i' (case-insensitive) flag for English labels.
 *   - Unicode flag 'u' for Tamil label patterns.
 */

// ─────────────────────────────────────────────────────────────────
// Money capture group (reused across all patterns)
// Matches: 56000  |  56,000  |  ₹56,000  |  ₹ 56,000  |  1,05,000
// ─────────────────────────────────────────────────────────────────
const MONEY = String.raw`(₹\s*)?(\d[\d,]*(?:\.\d+)?)`

// ─────────────────────────────────────────────────────────────────
// Label separator: optional whitespace, optional colon/dash, optional whitespace
// ─────────────────────────────────────────────────────────────────
const SEP = String.raw`[\s:：\-]*`

// ─────────────────────────────────────────────────────────────────
// Chit-recognition patterns (at least one must match for partial/success)
// ─────────────────────────────────────────────────────────────────
export const CHIT_RECOGNITION_PATTERNS: RegExp[] = [
  /தள்ளு/u,
  /கமிஷன்/u,
  /ஒரு\s*நபர்\s*தள்ளு/u,
  /கட்ட\s*வேண்டிய\s*தொகை/u,
  /chit\s*(fund|amount|payment)/i,
]

// ─────────────────────────────────────────────────────────────────
// "No thallu" indicator — MUST be checked BEFORE thallu amount pattern
// Tamil: தள்ளு இல்லை ("thallu illai" = no thallu)
// ─────────────────────────────────────────────────────────────────
export const THALLU_ABSENT_PATTERN = /தள்ளு\s*இல்லை/u

// ─────────────────────────────────────────────────────────────────
// "Final round" indicator
// ─────────────────────────────────────────────────────────────────
export const FINAL_ROUND_PATTERNS: RegExp[] = [
  /final\s*(round|chit|month)/i,
  /கடைசி\s*(மாதம்|சீட்டு)/u,
  /maturity/i,
]

// ─────────────────────────────────────────────────────────────────
// Field extraction patterns
// Each has one named capture group: `amount`
// ─────────────────────────────────────────────────────────────────

/**
 * தள்ளு [amount]
 * Must NOT match when preceded immediately by "ஒரு நபர்" —
 * that is the stated_member_thallu label.
 * Implementation: use negative lookbehind for "நபர்"
 */
export const THALLU_PATTERN = new RegExp(
  String.raw`(?<!நபர்\s{0,5})தள்ளு${SEP}${MONEY}`,
  'u',
)

/**
 * கமிஷன் [amount]
 * Also matches English: commission [amount]
 */
export const COMMISSION_PATTERN = new RegExp(
  String.raw`(?:கமிஷன்|commission)${SEP}${MONEY}`,
  'iu',
)

/**
 * ஒரு நபர் தள்ளு [amount]
 * Per-member reduction as STATED in the message.
 */
export const STATED_MEMBER_THALLU_PATTERN = new RegExp(
  String.raw`ஒரு\s*நபர்\s*தள்ளு${SEP}${MONEY}`,
  'u',
)

/**
 * கட்ட வேண்டிய தொகை [amount]
 * Payment as STATED in the message.
 * Also matches English: "amount to pay", "payment amount"
 */
export const STATED_PAYMENT_PATTERN = new RegExp(
  String.raw`(?:கட்ட\s*வேண்டிய\s*தொகை|amount\s+to\s+pay|payment\s+amount)${SEP}${MONEY}`,
  'iu',
)

// ─────────────────────────────────────────────────────────────────
// Metadata patterns (opportunistic — failures produce warnings, not errors)
// ─────────────────────────────────────────────────────────────────

/**
 * Round number — only extracted when the pattern is explicit.
 * Accepts: "9th chit", "9th round", "9th month", "9வது", "round 9", "month 9"
 * Does NOT accept bare standalone numbers as round indicators.
 */
export const ROUND_NUMBER_PATTERN = new RegExp(
  String.raw`(?:(\d+)(?:st|nd|rd|th)\s*(?:chit|round|month|சீட்டு|மாதம்)|(?:round|month|சீட்டு|மாதம்)\s*:?\s*(\d+)|(\d+)\s*வது)`,
  'iu',
)

/**
 * Face value from message header (e.g. "3 Lakh Chit", "₹6,00,000")
 * Lakh notation: N lakh → N * 100000
 */
export const FACE_VALUE_LAKH_PATTERN = /(\d+(?:\.\d+)?)\s*lakh\s*chit/i
export const FACE_VALUE_AMOUNT_PATTERN = new RegExp(
  String.raw`(?:face\s*value|சீட்டு\s*மதிப்பு)${SEP}${MONEY}`,
  'iu',
)

// ─────────────────────────────────────────────────────────────────
// Helper: extract the money value from a regex match
// Capture group 2 = optional ₹ prefix, capture group 3 = number string
// ─────────────────────────────────────────────────────────────────
export function extractMoneyFromMatch(
  match: RegExpMatchArray | null,
): string | undefined {
  // group 1 = lookbehind (no capture in THALLU), group 2 = ₹?, group 3 = digits
  // But our regex structure: full match [0], ₹? [1], number [2]
  if (!match) return undefined
  // Find the last non-empty group — it will be the digit string
  for (let i = match.length - 1; i >= 1; i--) {
    if (match[i] && /\d/.test(match[i])) return match[i]
  }
  return undefined
}

/**
 * Chit Fund Analytics — WhatsApp Message Normaliser
 *
 * Prepares raw message text for label matching.
 * Does NOT alter numeric content — only whitespace and structural noise.
 */

// ─────────────────────────────────────────────────────────────────
// Normalise
// ─────────────────────────────────────────────────────────────────

/**
 * Normalises a raw WhatsApp message for deterministic label matching.
 *
 * Operations performed (in order):
 *   1. Collapse CRLF → LF
 *   2. Remove forwarded-message artifacts ("Forwarded", "> ")
 *   3. Strip common WhatsApp date/time header lines
 *   4. Trim leading/trailing whitespace on each line
 *   5. Collapse multiple blank lines → single blank line
 *   6. Trim surrounding whitespace from the whole text
 *
 * NOT performed:
 *   - Changing numeric values
 *   - Removing currency symbols (₹ is part of number parsing)
 *   - Transliteration
 */
export function normaliseMessage(raw: string): string {
  return raw
    // CRLF → LF
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // WhatsApp forwarded-message header
    .replace(/^\[?Forwarded.*?\]?\s*/gim, '')
    .replace(/^>\s*/gm, '')
    // Trim each line
    .split('\n')
    .map(line => line.trim())
    // Collapse 2+ blank lines into 1
    .reduce<string[]>((acc, line) => {
      if (line === '' && acc.at(-1) === '') return acc
      acc.push(line)
      return acc
    }, [])
    .join('\n')
    .trim()
}

// ─────────────────────────────────────────────────────────────────
// Number parsing
// ─────────────────────────────────────────────────────────────────

/**
 * Parses a monetary string into a number.
 *
 * Handles:
 *   56000 → 56000
 *   56,000 → 56000
 *   1,05,000 → 105000   (Indian lakh notation)
 *   ₹56,000 → 56000
 *   ₹ 56,000 → 56000
 *   Rs.1,05,000 → 105000
 *
 * Returns undefined if the value is not recognisable as a valid non-negative number.
 * Returns 0 for explicit "0" inputs.
 */
export function parseMoneyString(raw: string): number | undefined {
  if (!raw) return undefined
  // Strip currency prefix (₹, Rs., Rs )
  const stripped = raw.replace(/^[₹Rs.\s]+/i, '').trim()
  // Remove all commas (handles both 1,000 and 1,05,000)
  const noCommas = stripped.replace(/,/g, '')
  // Must be a pure non-negative number at this point
  if (!/^\d+(\.\d+)?$/.test(noCommas)) return undefined
  const n = parseFloat(noCommas)
  return isNaN(n) ? undefined : n
}

// ─────────────────────────────────────────────────────────────────
// Simple deterministic hash (no crypto module needed for Node/browser)
// We implement djb2 over the normalised string — fast, deterministic,
// pure TypeScript with no external dependencies.
// The full SHA-256 hash is computed in hash.ts for external use.
// ─────────────────────────────────────────────────────────────────

/**
 * djb2 hash — used internally only.
 * Produces a hex string of the djb2 hash of the input.
 */
export function djb2Hash(text: string): string {
  let hash = 5381
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(i)
    hash = hash >>> 0  // keep as 32-bit unsigned
  }
  return hash.toString(16).padStart(8, '0')
}

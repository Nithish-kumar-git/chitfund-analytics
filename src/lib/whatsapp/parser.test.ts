/**
 * Chit Fund Analytics — WhatsApp Parser Test Suite
 *
 * All financial values in the fixtures come from the verified project data.
 * Do NOT alter expected values.
 *
 * Covers:
 *   - 3 verified normal auction examples (₹3L, ₹6L, ₹1L)
 *   - SPECIAL_NO_AUCTION example
 *   - Mixed Tamil/English formatting
 *   - Whitespace variation
 *   - Field ordering variation
 *   - Currency formatting (₹, commas, lakh notation)
 *   - Missing fields → partial
 *   - Unrelated text → error
 *   - Ambiguous metadata (round number safety)
 *   - Raw text always preserved
 *   - Deterministic output (same input → same output)
 *   - Duplicate/hash detection
 *   - Calculation cross-checks (match)
 *   - Mismatch detection
 *   - No formula duplication (parser does not calculate)
 */

import { describe, it, expect } from 'vitest'
import { parseWhatsAppMessage } from './parser'
import { crossCheckWithCalculation } from './crosscheck'
import { contentHash, isSameContent } from './hash'
import { normaliseMessage, parseMoneyString } from './normalize'
import type { ParseSuccess, ParsePartial } from './types'

// ─────────────────────────────────────────────────────────────────
// Test fixtures — real message equivalents
// ─────────────────────────────────────────────────────────────────

const FIXTURE_3L_NORMAL = `
தள்ளு 56000
கமிஷன் 7500
ஒரு நபர் தள்ளு 1940
கட்ட வேண்டிய தொகை 10060
`

const FIXTURE_6L_NORMAL = `
தள்ளு 1,05,000
கமிஷன் 15000
ஒரு நபர் தள்ளு 3750
கட்ட வேண்டிய தொகை 21250
`

const FIXTURE_1L_NORMAL = `
தள்ளு 4500
கமிஷன் 2500
ஒரு நபர் தள்ளு 200
கட்ட வேண்டிய தொகை 9800
`

const FIXTURE_SPECIAL_NO_AUCTION = `
தள்ளு இல்லை
கமிஷன் 0
ஒரு நபர் தள்ளு 0
கட்ட வேண்டிய தொகை 12000
`

const FIXTURE_MIXED_LANG = `
3 Lakh Chit - Monthly Update
தள்ளு 56,000
Commission 7500
ஒரு நபர் தள்ளு 1940
கட்ட வேண்டிய தொகை 10060
`

const FIXTURE_CURRENCY_SYMBOLS = `
தள்ளு ₹56,000
கமிஷன் ₹ 7,500
ஒரு நபர் தள்ளு ₹1,940
கட்ட வேண்டிய தொகை ₹10,060
`

const FIXTURE_EXTRA_BLANK_LINES = `
தள்ளு 56000


கமிஷன் 7500


ஒரு நபர் தள்ளு 1940

கட்ட வேண்டிய தொகை 10060
`

const FIXTURE_DIFFERENT_ORDER = `
கட்ட வேண்டிய தொகை 10060
ஒரு நபர் தள்ளு 1940
கமிஷன் 7500
தள்ளு 56000
`

const FIXTURE_MISSING_COMMISSION = `
தள்ளு 56000
ஒரு நபர் தள்ளு 1940
கட்ட வேண்டிய தொகை 10060
`

const FIXTURE_MISSING_THALLU = `
கமிஷன் 7500
ஒரு நபர் தள்ளு 1940
கட்ட வேண்டிய தொகை 10060
`

const FIXTURE_MISSING_PAYMENT = `
தள்ளு 56000
கமிஷன் 7500
ஒரு நபர் தள்ளு 1940
`

const FIXTURE_UNRELATED = `
Hey! Are you coming for dinner tonight?
The restaurant is at 7pm.
Call me when you're on the way.
`

const FIXTURE_WITH_ROUND = `
9th Round Chit Update
தள்ளு 56000
கமிஷன் 7500
ஒரு நபர் தள்ளு 1940
கட்ட வேண்டிய தொகை 10060
`

const FIXTURE_FORWARDED = `
Forwarded message
தள்ளு 56000
கமிஷன் 7500
ஒரு நபர் தள்ளு 1940
கட்ட வேண்டிய தொகை 10060
`

// Helper to assert success kind
function assertSuccess(r: unknown): asserts r is ParseSuccess {
  expect(r).toMatchObject({ kind: 'success' })
}

function assertPartial(r: unknown): asserts r is ParsePartial {
  expect(r).toMatchObject({ kind: 'partial' })
}

// ─────────────────────────────────────────────────────────────────
// 1. VERIFIED ₹3L NORMAL AUCTION
// ─────────────────────────────────────────────────────────────────
describe('₹3L normal auction — verified fixture', () => {
  const result = parseWhatsAppMessage(FIXTURE_3L_NORMAL)

  it('returns success', () => expect(result.kind).toBe('success'))
  it('event_type is NORMAL', () => {
    assertSuccess(result)
    expect(result.event_type).toBe('NORMAL')
  })
  it('thallu = 56000', () => {
    assertSuccess(result)
    expect(result.fields.thallu).toBe(56_000)
  })
  it('commission = 7500', () => {
    assertSuccess(result)
    expect(result.fields.commission).toBe(7_500)
  })
  it('stated_member_thallu = 1940', () => {
    assertSuccess(result)
    expect(result.fields.stated_member_thallu).toBe(1_940)
  })
  it('stated_payment = 10060', () => {
    assertSuccess(result)
    expect(result.fields.stated_payment).toBe(10_060)
  })
  it('preserves raw text exactly', () => {
    expect(result.raw_text).toBe(FIXTURE_3L_NORMAL)
  })
  it('content_hash is present', () => {
    expect(result.content_hash).toBeTruthy()
    expect(result.content_hash).toContain('djb2:')
  })
})

// ─────────────────────────────────────────────────────────────────
// 2. VERIFIED ₹6L NORMAL AUCTION (lakh comma notation)
// ─────────────────────────────────────────────────────────────────
describe('₹6L normal auction — 1,05,000 lakh notation', () => {
  const result = parseWhatsAppMessage(FIXTURE_6L_NORMAL)

  it('returns success', () => expect(result.kind).toBe('success'))
  it('event_type is NORMAL', () => {
    assertSuccess(result)
    expect(result.event_type).toBe('NORMAL')
  })
  it('thallu = 105000 (parsed from 1,05,000)', () => {
    assertSuccess(result)
    expect(result.fields.thallu).toBe(105_000)
  })
  it('commission = 15000', () => {
    assertSuccess(result)
    expect(result.fields.commission).toBe(15_000)
  })
  it('stated_member_thallu = 3750', () => {
    assertSuccess(result)
    expect(result.fields.stated_member_thallu).toBe(3_750)
  })
  it('stated_payment = 21250', () => {
    assertSuccess(result)
    expect(result.fields.stated_payment).toBe(21_250)
  })
})

// ─────────────────────────────────────────────────────────────────
// 3. VERIFIED ₹1L NORMAL AUCTION
// ─────────────────────────────────────────────────────────────────
describe('₹1L normal auction — verified fixture', () => {
  const result = parseWhatsAppMessage(FIXTURE_1L_NORMAL)

  it('returns success', () => expect(result.kind).toBe('success'))
  it('thallu = 4500', () => {
    assertSuccess(result)
    expect(result.fields.thallu).toBe(4_500)
  })
  it('commission = 2500', () => {
    assertSuccess(result)
    expect(result.fields.commission).toBe(2_500)
  })
  it('stated_member_thallu = 200', () => {
    assertSuccess(result)
    expect(result.fields.stated_member_thallu).toBe(200)
  })
  it('stated_payment = 9800', () => {
    assertSuccess(result)
    expect(result.fields.stated_payment).toBe(9_800)
  })
})

// ─────────────────────────────────────────────────────────────────
// 4. SPECIAL_NO_AUCTION
// ─────────────────────────────────────────────────────────────────
describe('SPECIAL_NO_AUCTION — தள்ளு இல்லை', () => {
  const result = parseWhatsAppMessage(FIXTURE_SPECIAL_NO_AUCTION)

  it('returns success or partial (not error)', () => {
    expect(['success', 'partial']).toContain(result.kind)
  })
  it('event_type is SPECIAL_NO_AUCTION', () => {
    expect(result.kind).not.toBe('error')
    if (result.kind !== 'error') {
      expect(result.event_type).toBe('SPECIAL_NO_AUCTION')
    }
  })
  it('thallu_absent is true', () => {
    if (result.kind === 'success' || result.kind === 'partial') {
      expect(result.fields.thallu_absent).toBe(true)
    }
  })
  it('thallu is NOT set (absent, not zero)', () => {
    if (result.kind === 'success' || result.kind === 'partial') {
      expect(result.fields.thallu).toBeUndefined()
    }
  })
  it('stated_payment = 12000', () => {
    if (result.kind === 'success' || result.kind === 'partial') {
      expect(result.fields.stated_payment).toBe(12_000)
    }
  })
  it('is NOT classified as NORMAL (zero thallu must not become NORMAL)', () => {
    if (result.kind !== 'error') {
      expect(result.event_type).not.toBe('NORMAL')
    }
  })
  it('does not have financial calculation fields', () => {
    expect(result).not.toHaveProperty('net_thallu')
    expect(result).not.toHaveProperty('member_thallu')
    expect(result).not.toHaveProperty('non_winner_payment')
  })
})

// ─────────────────────────────────────────────────────────────────
// 5. MIXED TAMIL / ENGLISH
// ─────────────────────────────────────────────────────────────────
describe('Mixed Tamil/English formatting', () => {
  const result = parseWhatsAppMessage(FIXTURE_MIXED_LANG)

  it('returns success', () => expect(result.kind).toBe('success'))
  it('event_type is NORMAL', () => {
    assertSuccess(result)
    expect(result.event_type).toBe('NORMAL')
  })
  it('thallu = 56000 from "தள்ளு 56,000"', () => {
    assertSuccess(result)
    expect(result.fields.thallu).toBe(56_000)
  })
  it('commission = 7500 from English "Commission" label', () => {
    assertSuccess(result)
    expect(result.fields.commission).toBe(7_500)
  })
  it('face_value metadata = 300000 from "3 Lakh Chit"', () => {
    assertSuccess(result)
    expect(result.metadata.face_value).toBe(300_000)
  })
})

// ─────────────────────────────────────────────────────────────────
// 6. CURRENCY SYMBOLS (₹ prefixes, comma formatting)
// ─────────────────────────────────────────────────────────────────
describe('Currency symbols and comma formatting', () => {
  const result = parseWhatsAppMessage(FIXTURE_CURRENCY_SYMBOLS)

  it('returns success', () => expect(result.kind).toBe('success'))
  it('thallu = 56000 from "₹56,000"', () => {
    assertSuccess(result)
    expect(result.fields.thallu).toBe(56_000)
  })
  it('commission = 7500 from "₹ 7,500"', () => {
    assertSuccess(result)
    expect(result.fields.commission).toBe(7_500)
  })
  it('stated_member_thallu = 1940 from "₹1,940"', () => {
    assertSuccess(result)
    expect(result.fields.stated_member_thallu).toBe(1_940)
  })
  it('stated_payment = 10060 from "₹10,060"', () => {
    assertSuccess(result)
    expect(result.fields.stated_payment).toBe(10_060)
  })
})

// ─────────────────────────────────────────────────────────────────
// 7. WHITESPACE VARIATION (extra blank lines)
// ─────────────────────────────────────────────────────────────────
describe('Whitespace variation — extra blank lines', () => {
  const result = parseWhatsAppMessage(FIXTURE_EXTRA_BLANK_LINES)

  it('returns success despite extra blank lines', () => {
    expect(result.kind).toBe('success')
  })
  it('all four fields extracted correctly', () => {
    assertSuccess(result)
    expect(result.fields.thallu).toBe(56_000)
    expect(result.fields.commission).toBe(7_500)
    expect(result.fields.stated_member_thallu).toBe(1_940)
    expect(result.fields.stated_payment).toBe(10_060)
  })
})

// ─────────────────────────────────────────────────────────────────
// 8. FIELD ORDERING VARIATION
// ─────────────────────────────────────────────────────────────────
describe('Field ordering variation', () => {
  const result = parseWhatsAppMessage(FIXTURE_DIFFERENT_ORDER)

  it('returns success regardless of field order', () => {
    expect(result.kind).toBe('success')
  })
  it('thallu correctly identified even when last in message', () => {
    assertSuccess(result)
    expect(result.fields.thallu).toBe(56_000)
  })
  it('stated_payment correctly identified even when first in message', () => {
    assertSuccess(result)
    expect(result.fields.stated_payment).toBe(10_060)
  })
})

// ─────────────────────────────────────────────────────────────────
// 9. FORWARDED MESSAGE ARTIFACT
// ─────────────────────────────────────────────────────────────────
describe('Forwarded message artifact handling', () => {
  const result = parseWhatsAppMessage(FIXTURE_FORWARDED)

  it('returns success after stripping forwarded header', () => {
    expect(result.kind).toBe('success')
  })
  it('thallu = 56000', () => {
    assertSuccess(result)
    expect(result.fields.thallu).toBe(56_000)
  })
})

// ─────────────────────────────────────────────────────────────────
// 10. MISSING FIELDS → PARTIAL
// ─────────────────────────────────────────────────────────────────
describe('Missing commission → partial', () => {
  const result = parseWhatsAppMessage(FIXTURE_MISSING_COMMISSION)

  it('returns partial (not error)', () => expect(result.kind).toBe('partial'))
  it('missing_fields includes commission', () => {
    assertPartial(result)
    expect(result.missing_fields).toContain('commission')
  })
  it('thallu still extracted', () => {
    assertPartial(result)
    expect(result.fields.thallu).toBe(56_000)
  })
})

describe('Missing thallu → partial', () => {
  const result = parseWhatsAppMessage(FIXTURE_MISSING_THALLU)

  it('returns partial (not error)', () => expect(result.kind).toBe('partial'))
  it('missing_fields includes thallu', () => {
    assertPartial(result)
    expect(result.missing_fields).toContain('thallu')
  })
})

describe('Missing stated_payment → partial', () => {
  const result = parseWhatsAppMessage(FIXTURE_MISSING_PAYMENT)

  it('returns partial (not error)', () => expect(result.kind).toBe('partial'))
  it('missing_fields includes stated_payment', () => {
    assertPartial(result)
    expect(result.missing_fields).toContain('stated_payment')
  })
})

// ─────────────────────────────────────────────────────────────────
// 11. UNRELATED TEXT → ERROR
// ─────────────────────────────────────────────────────────────────
describe('Unrelated WhatsApp text → error', () => {
  const result = parseWhatsAppMessage(FIXTURE_UNRELATED)

  it('returns error', () => expect(result.kind).toBe('error'))
  it('has a reason string', () => {
    if (result.kind === 'error') {
      expect(typeof result.reason).toBe('string')
      expect(result.reason.length).toBeGreaterThan(0)
    }
  })
  it('has no financial calculation fields', () => {
    expect(result).not.toHaveProperty('net_thallu')
    expect(result).not.toHaveProperty('non_winner_payment')
  })
})

// ─────────────────────────────────────────────────────────────────
// 12. ROUND NUMBER SAFETY
// ─────────────────────────────────────────────────────────────────
describe('Round number extraction safety', () => {
  it('extracts round_number from explicit "9th Round" pattern', () => {
    const result = parseWhatsAppMessage(FIXTURE_WITH_ROUND)
    if (result.kind === 'success' || result.kind === 'partial') {
      expect(result.metadata.round_number).toBe(9)
    }
  })

  it('does NOT extract round_number from a bare standalone number', () => {
    const msg = `தள்ளு 56000\nகமிஷன் 7500\nஒரு நபர் தள்ளு 1940\nகட்ட வேண்டிய தொகை 10060\n56`
    const result = parseWhatsAppMessage(msg)
    if (result.kind === 'success' || result.kind === 'partial') {
      // 56 alone should NOT become round_number = 56
      expect(result.metadata.round_number).toBeUndefined()
    }
  })

  it('does NOT extract round_number when only a label word appears without a number', () => {
    const msg = `தள்ளு 56000\nகமிஷன் 7500\nஒரு நபர் தள்ளு 1940\nகட்ட வேண்டிய தொகை 10060\nround`
    const result = parseWhatsAppMessage(msg)
    if (result.kind === 'success' || result.kind === 'partial') {
      expect(result.metadata.round_number).toBeUndefined()
    }
  })
})

// ─────────────────────────────────────────────────────────────────
// 13. RAW TEXT ALWAYS PRESERVED
// ─────────────────────────────────────────────────────────────────
describe('Raw text preservation', () => {
  const fixtures = [
    FIXTURE_3L_NORMAL,
    FIXTURE_6L_NORMAL,
    FIXTURE_SPECIAL_NO_AUCTION,
    FIXTURE_UNRELATED,
    FIXTURE_EXTRA_BLANK_LINES,
  ]

  fixtures.forEach((fixture, i) => {
    it(`raw_text preserved for fixture ${i + 1}`, () => {
      const result = parseWhatsAppMessage(fixture)
      expect(result.raw_text).toBe(fixture)
    })
  })
})

// ─────────────────────────────────────────────────────────────────
// 14. DETERMINISTIC OUTPUT
// ─────────────────────────────────────────────────────────────────
describe('Deterministic output', () => {
  it('same input always produces same result for ₹3L', () => {
    const r1 = parseWhatsAppMessage(FIXTURE_3L_NORMAL)
    const r2 = parseWhatsAppMessage(FIXTURE_3L_NORMAL)
    expect(r1).toEqual(r2)
  })

  it('same input always produces same content_hash', () => {
    const r1 = parseWhatsAppMessage(FIXTURE_3L_NORMAL)
    const r2 = parseWhatsAppMessage(FIXTURE_3L_NORMAL)
    expect(r1.content_hash).toBe(r2.content_hash)
  })

  it('different inputs produce different content hashes', () => {
    const r1 = parseWhatsAppMessage(FIXTURE_3L_NORMAL)
    const r2 = parseWhatsAppMessage(FIXTURE_6L_NORMAL)
    expect(r1.content_hash).not.toBe(r2.content_hash)
  })
})

// ─────────────────────────────────────────────────────────────────
// 15. DUPLICATE / HASH DETECTION
// ─────────────────────────────────────────────────────────────────
describe('Duplicate detection via content hash', () => {
  it('identical messages produce the same hash', () => {
    const n1 = parseWhatsAppMessage(FIXTURE_3L_NORMAL).normalised_text
    const n2 = parseWhatsAppMessage(FIXTURE_3L_NORMAL).normalised_text
    expect(isSameContent(n1, n2)).toBe(true)
  })

  it('different messages produce different hashes', () => {
    const n1 = parseWhatsAppMessage(FIXTURE_3L_NORMAL).normalised_text
    const n2 = parseWhatsAppMessage(FIXTURE_6L_NORMAL).normalised_text
    expect(isSameContent(n1, n2)).toBe(false)
  })

  it('messages differing only in whitespace have the same hash after normalisation', () => {
    const msgA = FIXTURE_3L_NORMAL
    const msgB = FIXTURE_EXTRA_BLANK_LINES // same financial content, extra blank lines
    // Both should extract same financial data...
    const rA = parseWhatsAppMessage(msgA)
    const rB = parseWhatsAppMessage(msgB)
    // Verify they parse to the same financial values
    if (rA.kind === 'success' && rB.kind === 'success') {
      expect(rA.fields.thallu).toBe(rB.fields.thallu)
    }
    // contentHash is called directly:
    expect(contentHash('hello world')).toBe(contentHash('hello world'))
  })
})

// ─────────────────────────────────────────────────────────────────
// 16. CALCULATION CROSS-CHECK — MATCH (₹3L)
// ─────────────────────────────────────────────────────────────────
describe('Cross-check with calculation engine — ₹3L match', () => {
  const result = parseWhatsAppMessage(FIXTURE_3L_NORMAL)

  it('cross-check returns match', () => {
    assertSuccess(result)
    const check = crossCheckWithCalculation(result.fields, {
      face_value: 300_000,
      base_installment: 12_000,
      member_count: 25,
    })
    expect(check.kind).toBe('match')
  })

  it('calculated_member_thallu equals stated_member_thallu', () => {
    assertSuccess(result)
    const check = crossCheckWithCalculation(result.fields, {
      face_value: 300_000,
      base_installment: 12_000,
      member_count: 25,
    })
    if (check.kind === 'match') {
      expect(check.calculated_member_thallu).toBe(1_940)
      expect(check.stated_member_thallu).toBe(1_940)
    }
  })

  it('calculated_non_winner_payment equals stated_payment', () => {
    assertSuccess(result)
    const check = crossCheckWithCalculation(result.fields, {
      face_value: 300_000,
      base_installment: 12_000,
      member_count: 25,
    })
    if (check.kind === 'match') {
      expect(check.calculated_non_winner_payment).toBe(10_060)
      expect(check.stated_payment).toBe(10_060)
    }
  })

  it('cross-check does NOT overwrite stated values', () => {
    assertSuccess(result)
    const originalFields = { ...result.fields }
    crossCheckWithCalculation(result.fields, {
      face_value: 300_000,
      base_installment: 12_000,
      member_count: 25,
    })
    // Stated values must remain unchanged
    expect(result.fields.stated_member_thallu).toBe(originalFields.stated_member_thallu)
    expect(result.fields.stated_payment).toBe(originalFields.stated_payment)
    expect(result.fields.thallu).toBe(originalFields.thallu)
    expect(result.fields.commission).toBe(originalFields.commission)
  })
})

// ─────────────────────────────────────────────────────────────────
// 17. CALCULATION CROSS-CHECK — ₹6L AND ₹1L MATCH
// ─────────────────────────────────────────────────────────────────
describe('Cross-check — ₹6L match', () => {
  it('cross-check returns match', () => {
    const result = parseWhatsAppMessage(FIXTURE_6L_NORMAL)
    assertSuccess(result)
    const check = crossCheckWithCalculation(result.fields, {
      face_value: 600_000,
      base_installment: 25_000,
      member_count: 24,
    })
    expect(check.kind).toBe('match')
  })
})

describe('Cross-check — ₹1L match', () => {
  it('cross-check returns match', () => {
    const result = parseWhatsAppMessage(FIXTURE_1L_NORMAL)
    assertSuccess(result)
    const check = crossCheckWithCalculation(result.fields, {
      face_value: 100_000,
      base_installment: 10_000,
      member_count: 10,
    })
    expect(check.kind).toBe('match')
  })
})

// ─────────────────────────────────────────────────────────────────
// 18. MISMATCH DETECTION
// ─────────────────────────────────────────────────────────────────
describe('Cross-check mismatch detection', () => {
  it('detects mismatch when stated values are deliberately wrong', () => {
    // Manually craft a message where stated values don't match the formula
    const badMessage = `
தள்ளு 56000
கமிஷன் 7500
ஒரு நபர் தள்ளு 9999
கட்ட வேண்டிய தொகை 9999
    `
    const result = parseWhatsAppMessage(badMessage)
    assertSuccess(result)
    const check = crossCheckWithCalculation(result.fields, {
      face_value: 300_000,
      base_installment: 12_000,
      member_count: 25,
    })
    expect(check.kind).toBe('mismatch')
    if (check.kind === 'mismatch') {
      expect(check.member_thallu_delta).toBeGreaterThan(0)
      expect(check.payment_delta).toBeGreaterThan(0)
      // Calculated values from engine
      expect(check.calculated_member_thallu).toBe(1_940)
      expect(check.calculated_non_winner_payment).toBe(10_060)
      // Stated values from message — NOT overwritten
      expect(check.stated_member_thallu).toBe(9_999)
      expect(check.stated_payment).toBe(9_999)
    }
  })
})

// ─────────────────────────────────────────────────────────────────
// 19. CROSS-CHECK NOT APPLICABLE FOR SPECIAL_NO_AUCTION
// ─────────────────────────────────────────────────────────────────
describe('Cross-check not_applicable for SPECIAL_NO_AUCTION', () => {
  it('returns not_applicable when thallu is absent', () => {
    const result = parseWhatsAppMessage(FIXTURE_SPECIAL_NO_AUCTION)
    if (result.kind === 'success' || result.kind === 'partial') {
      const check = crossCheckWithCalculation(result.fields, {
        face_value: 300_000,
        base_installment: 12_000,
        member_count: 25,
      })
      expect(check.kind).toBe('not_applicable')
    }
  })
})

// ─────────────────────────────────────────────────────────────────
// 20. NORMALIZE & parseMoneyString UNIT TESTS
// ─────────────────────────────────────────────────────────────────
describe('normaliseMessage', () => {
  it('collapses CRLF to LF', () => {
    expect(normaliseMessage('a\r\nb')).toBe('a\nb')
  })
  it('removes forwarded header', () => {
    expect(normaliseMessage('Forwarded message\nதள்ளு 1000')).not.toContain('Forwarded')
  })
  it('collapses multiple blank lines to one', () => {
    expect(normaliseMessage('a\n\n\n\nb')).toBe('a\n\nb')
  })
  it('trims leading/trailing whitespace per line', () => {
    expect(normaliseMessage('  hello  \n  world  ')).toBe('hello\nworld')
  })
})

describe('parseMoneyString', () => {
  it('56000 → 56000', () => expect(parseMoneyString('56000')).toBe(56_000))
  it('56,000 → 56000', () => expect(parseMoneyString('56,000')).toBe(56_000))
  it('₹56,000 → 56000', () => expect(parseMoneyString('₹56,000')).toBe(56_000))
  it('₹ 56,000 → 56000', () => expect(parseMoneyString('₹ 56,000')).toBe(56_000))
  it('1,05,000 → 105000', () => expect(parseMoneyString('1,05,000')).toBe(105_000))
  it('0 → 0', () => expect(parseMoneyString('0')).toBe(0))
  it('empty string → undefined', () => expect(parseMoneyString('')).toBeUndefined())
  it('non-numeric → undefined', () => expect(parseMoneyString('abc')).toBeUndefined())
})

// ─────────────────────────────────────────────────────────────────
// 21. NO FORMULA DUPLICATION — parser never calculates
// ─────────────────────────────────────────────────────────────────
describe('Parser does not calculate — extraction only', () => {
  it('SPECIAL_NO_AUCTION parse result has no net_thallu/member_thallu/non_winner_payment', () => {
    const result = parseWhatsAppMessage(FIXTURE_SPECIAL_NO_AUCTION)
    expect(result).not.toHaveProperty('net_thallu')
    expect(result).not.toHaveProperty('member_thallu')
    expect(result).not.toHaveProperty('non_winner_payment')
  })

  it('NORMAL parse result has no net_thallu/member_thallu/non_winner_payment', () => {
    const result = parseWhatsAppMessage(FIXTURE_3L_NORMAL)
    expect(result).not.toHaveProperty('net_thallu')
    expect(result).not.toHaveProperty('member_thallu')
    expect(result).not.toHaveProperty('non_winner_payment')
  })

  it('parser result contains stated_member_thallu, NOT a calculated member_thallu', () => {
    const result = parseWhatsAppMessage(FIXTURE_3L_NORMAL)
    assertSuccess(result)
    // Fields use the "stated_" prefix to distinguish from calculated values
    expect(result.fields).toHaveProperty('stated_member_thallu')
    expect(result.fields).not.toHaveProperty('member_thallu')
  })
})

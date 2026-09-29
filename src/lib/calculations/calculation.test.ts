/**
 * Chit Fund Analytics — Calculation Engine Test Suite
 *
 * All three verified test cases come from real WhatsApp project data.
 * Do NOT alter their expected values.
 *
 * Tests cover:
 *   - Three verified real-world examples
 *   - Event-type safety (SPECIAL_NO_AUCTION, FINAL, UNKNOWN)
 *   - Input validation (member_count, thallu, commission, base_installment, face_value)
 *   - Decimal precision
 *   - Face-value mismatch is informational only
 *   - Result structure never contains NaN or undefined financial values
 *   - Invariant properties of the formulas
 *   - Winner payout is absent from all results
 */

import { describe, it, expect } from 'vitest'
import { calculateAuction, roundForDisplay } from './calculation'
import type { CalculationSuccess } from './types'

// ─────────────────────────────────────────────────────────────────
// Helper: assert a result is CalculationSuccess
// ─────────────────────────────────────────────────────────────────
function assertSuccess(result: unknown): asserts result is CalculationSuccess {
  expect(result).toMatchObject({ kind: 'success' })
}

// ─────────────────────────────────────────────────────────────────
// TEST CASE 1 — ₹3 Lakh chit (verified from real WhatsApp data)
// ─────────────────────────────────────────────────────────────────
describe('Verified example 1 — ₹3L chit', () => {
  const input = {
    face_value: 300_000,
    base_installment: 12_000,
    member_count: 25,
    thallu: 56_000,
    commission: 7_500,
    event_type: 'NORMAL' as const,
  }

  it('returns a success result', () => {
    const result = calculateAuction(input)
    expect(result.kind).toBe('success')
  })

  it('net_thallu = 48500', () => {
    const result = calculateAuction(input)
    assertSuccess(result)
    expect(result.net_thallu).toBe(48_500)
  })

  it('member_thallu = 1940', () => {
    const result = calculateAuction(input)
    assertSuccess(result)
    expect(result.member_thallu).toBe(1_940)
  })

  it('non_winner_payment = 10060', () => {
    const result = calculateAuction(input)
    assertSuccess(result)
    expect(result.non_winner_payment).toBe(10_060)
  })

  it('echoes all input fields correctly', () => {
    const result = calculateAuction(input)
    assertSuccess(result)
    expect(result.face_value).toBe(300_000)
    expect(result.base_installment).toBe(12_000)
    expect(result.member_count).toBe(25)
    expect(result.thallu).toBe(56_000)
    expect(result.commission).toBe(7_500)
    expect(result.event_type).toBe('NORMAL')
  })

  it('does NOT include winner payout in the result', () => {
    const result = calculateAuction(input)
    assertSuccess(result)
    expect(result).not.toHaveProperty('our_payout_amount')
    expect(result).not.toHaveProperty('winner_payout')
  })

  it('has no face_value_mismatch (12000 × 25 = 300000)', () => {
    const result = calculateAuction(input)
    assertSuccess(result)
    expect(result.face_value_mismatch).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────
// TEST CASE 2 — ₹6 Lakh chit (verified from real WhatsApp data)
// ─────────────────────────────────────────────────────────────────
describe('Verified example 2 — ₹6L chit', () => {
  const input = {
    face_value: 600_000,
    base_installment: 25_000,
    member_count: 24,
    thallu: 105_000,
    commission: 15_000,
    event_type: 'NORMAL' as const,
  }

  it('net_thallu = 90000', () => {
    const result = calculateAuction(input)
    assertSuccess(result)
    expect(result.net_thallu).toBe(90_000)
  })

  it('member_thallu = 3750', () => {
    const result = calculateAuction(input)
    assertSuccess(result)
    expect(result.member_thallu).toBe(3_750)
  })

  it('non_winner_payment = 21250', () => {
    const result = calculateAuction(input)
    assertSuccess(result)
    expect(result.non_winner_payment).toBe(21_250)
  })
})

// ─────────────────────────────────────────────────────────────────
// TEST CASE 3 — ₹1 Lakh chit (verified from real WhatsApp data)
// ─────────────────────────────────────────────────────────────────
describe('Verified example 3 — ₹1L chit', () => {
  const input = {
    face_value: 100_000,
    base_installment: 10_000,
    member_count: 10,
    thallu: 4_500,
    commission: 2_500,
    event_type: 'NORMAL' as const,
  }

  it('net_thallu = 2000', () => {
    const result = calculateAuction(input)
    assertSuccess(result)
    expect(result.net_thallu).toBe(2_000)
  })

  it('member_thallu = 200', () => {
    const result = calculateAuction(input)
    assertSuccess(result)
    expect(result.member_thallu).toBe(200)
  })

  it('non_winner_payment = 9800', () => {
    const result = calculateAuction(input)
    assertSuccess(result)
    expect(result.non_winner_payment).toBe(9_800)
  })
})

// ─────────────────────────────────────────────────────────────────
// Additional valid NORMAL case — different input set
// ─────────────────────────────────────────────────────────────────
describe('Additional valid NORMAL case', () => {
  it('computes correctly for a 20-member ₹2L chit', () => {
    const result = calculateAuction({
      face_value: 200_000,
      base_installment: 10_000,
      member_count: 20,
      thallu: 30_000,
      commission: 5_000,
      event_type: 'NORMAL',
    })
    assertSuccess(result)
    // net_thallu = 30000 - 5000 = 25000
    expect(result.net_thallu).toBe(25_000)
    // member_thallu = 25000 / 20 = 1250
    expect(result.member_thallu).toBe(1_250)
    // non_winner_payment = 10000 - 1250 = 8750
    expect(result.non_winner_payment).toBe(8_750)
  })
})

// ─────────────────────────────────────────────────────────────────
// EVENT-TYPE SAFETY
// Only NORMAL may use the normal auction formula.
// ─────────────────────────────────────────────────────────────────
describe('Event-type safety', () => {
  const baseInput = {
    face_value: 300_000,
    base_installment: 12_000,
    member_count: 25,
    thallu: 56_000,
    commission: 7_500,
  }

  it('SPECIAL_NO_AUCTION returns not_applicable', () => {
    const result = calculateAuction({ ...baseInput, event_type: 'SPECIAL_NO_AUCTION' })
    expect(result.kind).toBe('not_applicable')
    expect(result).toMatchObject({ kind: 'not_applicable', event_type: 'SPECIAL_NO_AUCTION' })
  })

  it('FINAL returns not_applicable', () => {
    const result = calculateAuction({ ...baseInput, event_type: 'FINAL' })
    expect(result.kind).toBe('not_applicable')
    expect(result).toMatchObject({ kind: 'not_applicable', event_type: 'FINAL' })
  })

  it('UNKNOWN returns not_applicable', () => {
    const result = calculateAuction({ ...baseInput, event_type: 'UNKNOWN' })
    expect(result.kind).toBe('not_applicable')
    expect(result).toMatchObject({ kind: 'not_applicable', event_type: 'UNKNOWN' })
  })

  it('SPECIAL_NO_AUCTION with thallu=0 commission=0 does NOT produce a normal-auction result', () => {
    const result = calculateAuction({
      face_value: 300_000,
      base_installment: 12_000,
      member_count: 25,
      thallu: 0,
      commission: 0,
      event_type: 'SPECIAL_NO_AUCTION',
    })
    expect(result.kind).toBe('not_applicable')
    // Must NOT have any calculated financial fields
    expect(result).not.toHaveProperty('net_thallu')
    expect(result).not.toHaveProperty('member_thallu')
    expect(result).not.toHaveProperty('non_winner_payment')
  })

  it('not_applicable result has a reason string', () => {
    const result = calculateAuction({ ...baseInput, event_type: 'FINAL' })
    expect(result.kind).toBe('not_applicable')
    if (result.kind === 'not_applicable') {
      expect(typeof result.reason).toBe('string')
      expect(result.reason.length).toBeGreaterThan(0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────
// INPUT VALIDATION
// ─────────────────────────────────────────────────────────────────
describe('Input validation', () => {
  const validBase = {
    face_value: 300_000,
    base_installment: 12_000,
    member_count: 25,
    thallu: 56_000,
    commission: 7_500,
    event_type: 'NORMAL' as const,
  }

  it('member_count = 0 is rejected', () => {
    const result = calculateAuction({ ...validBase, member_count: 0 })
    expect(result.kind).toBe('error')
    if (result.kind === 'error') {
      expect(result.errors.some(e => e.field === 'member_count')).toBe(true)
    }
  })

  it('negative member_count is rejected', () => {
    const result = calculateAuction({ ...validBase, member_count: -5 })
    expect(result.kind).toBe('error')
    if (result.kind === 'error') {
      expect(result.errors.some(e => e.field === 'member_count')).toBe(true)
    }
  })

  it('negative thallu is rejected', () => {
    const result = calculateAuction({ ...validBase, thallu: -1 })
    expect(result.kind).toBe('error')
    if (result.kind === 'error') {
      expect(result.errors.some(e => e.field === 'thallu')).toBe(true)
    }
  })

  it('negative commission is rejected', () => {
    const result = calculateAuction({ ...validBase, commission: -100 })
    expect(result.kind).toBe('error')
    if (result.kind === 'error') {
      expect(result.errors.some(e => e.field === 'commission')).toBe(true)
    }
  })

  it('negative base_installment is rejected', () => {
    const result = calculateAuction({ ...validBase, base_installment: -1 })
    expect(result.kind).toBe('error')
    if (result.kind === 'error') {
      expect(result.errors.some(e => e.field === 'base_installment')).toBe(true)
    }
  })

  it('face_value = 0 is rejected', () => {
    const result = calculateAuction({ ...validBase, face_value: 0 })
    expect(result.kind).toBe('error')
    if (result.kind === 'error') {
      expect(result.errors.some(e => e.field === 'face_value')).toBe(true)
    }
  })

  it('negative face_value is rejected', () => {
    const result = calculateAuction({ ...validBase, face_value: -300_000 })
    expect(result.kind).toBe('error')
    if (result.kind === 'error') {
      expect(result.errors.some(e => e.field === 'face_value')).toBe(true)
    }
  })

  it('commission > thallu is rejected', () => {
    const result = calculateAuction({ ...validBase, thallu: 5_000, commission: 10_000 })
    expect(result.kind).toBe('error')
    if (result.kind === 'error') {
      expect(result.errors.some(e => e.field === 'commission')).toBe(true)
    }
  })

  it('error result never contains NaN values', () => {
    const result = calculateAuction({ ...validBase, member_count: 0 })
    expect(result.kind).toBe('error')
    // There must be no net_thallu / member_thallu / non_winner_payment on errors
    expect(result).not.toHaveProperty('net_thallu')
    expect(result).not.toHaveProperty('member_thallu')
    expect(result).not.toHaveProperty('non_winner_payment')
  })

  it('error result contains structured ValidationError objects', () => {
    const result = calculateAuction({ ...validBase, member_count: 0, thallu: -1 })
    expect(result.kind).toBe('error')
    if (result.kind === 'error') {
      expect(result.errors.length).toBeGreaterThanOrEqual(2)
      result.errors.forEach(e => {
        expect(typeof e.field).toBe('string')
        expect(typeof e.message).toBe('string')
      })
    }
  })
})

// ─────────────────────────────────────────────────────────────────
// DECIMAL PRECISION
// ─────────────────────────────────────────────────────────────────
describe('Decimal precision', () => {
  it('preserves precision when member_thallu is a repeating decimal', () => {
    // net_thallu = 10000, member_count = 3 → member_thallu = 3333.333...
    const result = calculateAuction({
      face_value: 300_000,
      base_installment: 12_000,
      member_count: 3,
      thallu: 12_500,
      commission: 2_500,
      event_type: 'NORMAL',
    })
    assertSuccess(result)
    // net_thallu = 12500 - 2500 = 10000
    expect(result.net_thallu).toBe(10_000)
    // member_thallu = 10000 / 3 — should NOT be silently rounded to 3333
    // big.js gives 3333.33333... — we verify it's not an integer
    expect(result.member_thallu).not.toBe(3_333)
    expect(result.member_thallu).toBeCloseTo(10_000 / 3, 10)
  })

  it('roundForDisplay rounds half-up to 2dp', () => {
    expect(roundForDisplay(1940)).toBe(1940)
    expect(roundForDisplay(3333.3333333)).toBe(3333.33)
    expect(roundForDisplay(3333.3350000)).toBe(3333.34)
    expect(roundForDisplay(10060)).toBe(10060)
  })

  it('roundForDisplay with 0dp rounds to integer', () => {
    expect(roundForDisplay(3333.5, 0)).toBe(3334)
    expect(roundForDisplay(3333.4, 0)).toBe(3333)
  })

  it('does not produce NaN for valid decimal inputs', () => {
    const result = calculateAuction({
      face_value: 150_000,
      base_installment: 7_500,
      member_count: 20,
      thallu: 22_222.22,
      commission: 3_333.33,
      event_type: 'NORMAL',
    })
    assertSuccess(result)
    expect(isNaN(result.net_thallu)).toBe(false)
    expect(isNaN(result.member_thallu)).toBe(false)
    expect(isNaN(result.non_winner_payment)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────
// FACE VALUE MISMATCH — informational only, does not alter values
// ─────────────────────────────────────────────────────────────────
describe('Face value mismatch', () => {
  it('signals mismatch when face_value ≠ base_installment × member_count', () => {
    const result = calculateAuction({
      face_value: 300_001, // intentionally off by 1
      base_installment: 12_000,
      member_count: 25,
      thallu: 56_000,
      commission: 7_500,
      event_type: 'NORMAL',
    })
    assertSuccess(result)
    expect(result.face_value_mismatch).toBeDefined()
    expect(result.face_value_mismatch?.actual_face_value).toBe(300_001)
    expect(result.face_value_mismatch?.expected_face_value).toBe(300_000)
  })

  it('face_value mismatch does NOT alter net_thallu, member_thallu, or non_winner_payment', () => {
    const result = calculateAuction({
      face_value: 300_001, // intentionally off by 1
      base_installment: 12_000,
      member_count: 25,
      thallu: 56_000,
      commission: 7_500,
      event_type: 'NORMAL',
    })
    assertSuccess(result)
    // Values must be identical to the verified ₹3L example
    expect(result.net_thallu).toBe(48_500)
    expect(result.member_thallu).toBe(1_940)
    expect(result.non_winner_payment).toBe(10_060)
  })

  it('no face_value_mismatch when values match exactly', () => {
    const result = calculateAuction({
      face_value: 300_000,
      base_installment: 12_000,
      member_count: 25,
      thallu: 56_000,
      commission: 7_500,
      event_type: 'NORMAL',
    })
    assertSuccess(result)
    expect(result.face_value_mismatch).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────
// FORMULA INVARIANTS
// ─────────────────────────────────────────────────────────────────
describe('Formula invariants', () => {
  const cases = [
    { face_value: 300_000, base_installment: 12_000, member_count: 25, thallu: 56_000, commission: 7_500 },
    { face_value: 600_000, base_installment: 25_000, member_count: 24, thallu: 105_000, commission: 15_000 },
    { face_value: 100_000, base_installment: 10_000, member_count: 10, thallu: 4_500, commission: 2_500 },
    { face_value: 200_000, base_installment: 10_000, member_count: 20, thallu: 30_000, commission: 5_000 },
  ]

  cases.forEach(({ face_value, base_installment, member_count, thallu, commission }) => {
    it(`invariants hold for face_value=${face_value}`, () => {
      const result = calculateAuction({ face_value, base_installment, member_count, thallu, commission, event_type: 'NORMAL' })
      assertSuccess(result)

      // Invariant 1: net_thallu = thallu - commission
      expect(result.net_thallu).toBeCloseTo(thallu - commission, 10)

      // Invariant 2: member_thallu = net_thallu / member_count
      expect(result.member_thallu).toBeCloseTo(result.net_thallu / member_count, 10)

      // Invariant 3: non_winner_payment = base_installment - member_thallu
      expect(result.non_winner_payment).toBeCloseTo(base_installment - result.member_thallu, 10)
    })
  })
})

import { describe, it, expect } from 'vitest'
import { processWhatsAppMessage } from './ingest'
import type { ChitConfig } from './ingest'

// Fixtures
const FIXTURE_NORMAL = `
தள்ளு 56000
கமிஷன் 7500
ஒரு நபர் தள்ளு 1940
கட்ட வேண்டிய தொகை 10060
9th round
`

const FIXTURE_MISMATCH = `
தள்ளு 56000
கமிஷன் 7500
ஒரு நபர் தள்ளு 9999
கட்ட வேண்டிய தொகை 9999
9th round
`

const FIXTURE_SPECIAL_NO_AUCTION = `
தள்ளு இல்லை
கமிஷன் 0
ஒரு நபர் தள்ளு 0
கட்ட வேண்டிய தொகை 12000
round 10
`

const FIXTURE_FINAL = `
final round
கமிஷன் 7500
ஒரு நபர் தள்ளு 1940
கட்ட வேண்டிய தொகை 10060
`

const FIXTURE_UNKNOWN = `
தள்ளு 1234
round 1
`

const FIXTURE_MISSING_FIELDS = `
தள்ளு 56000
round 1
`

const mockConfig: ChitConfig = {
  face_value: 300_000,
  base_installment: 12_000,
  member_count: 25
}

describe('Ingestion Pipeline', () => {
  it('A. NORMAL message — READY_FOR_CONFIRMATION', () => {
    const result = processWhatsAppMessage({
      profile_id: 'user1',
      raw_text: FIXTURE_NORMAL
    }, false, mockConfig)

    expect(result.status).toBe('READY_FOR_CONFIRMATION')
    if (result.status === 'READY_FOR_CONFIRMATION') {
      expect(result.proposed_calculation_status).toBe('VERIFIED_FORMULA')
      expect(result.cross_check_result?.kind).toBe('match')
    }
  })

  it('B. NORMAL mismatch — NEEDS_REVIEW', () => {
    const result = processWhatsAppMessage({
      profile_id: 'user1',
      raw_text: FIXTURE_MISMATCH
    }, false, mockConfig)

    expect(result.status).toBe('NEEDS_REVIEW')
    if (result.status === 'NEEDS_REVIEW') {
      expect(result.proposed_calculation_status).toBe('FLAGGED_MISMATCH')
      expect(result.cross_check_result?.kind).toBe('mismatch')
    }
  })

  it('C. SPECIAL_NO_AUCTION — normal calculation is NOT applied', () => {
    const result = processWhatsAppMessage({
      profile_id: 'user1',
      raw_text: FIXTURE_SPECIAL_NO_AUCTION
    }, false, mockConfig)

    expect(result.status).toBe('READY_FOR_CONFIRMATION')
    if (result.status === 'READY_FOR_CONFIRMATION') {
      expect(result.parse_result.event_type).toBe('SPECIAL_NO_AUCTION')
      expect(result.cross_check_result).toBeUndefined()
    }
  })

  it('D. FINAL — no invented calculation, goes to NEEDS_REVIEW', () => {
    const result = processWhatsAppMessage({
      profile_id: 'user1',
      raw_text: FIXTURE_FINAL
    }, false, mockConfig)

    expect(result.status).toBe('NEEDS_REVIEW')
    if (result.status === 'NEEDS_REVIEW') {
      expect(result.parse_result.event_type).toBe('FINAL')
      expect(result.cross_check_result).toBeUndefined()
    }
  })

  it('E. UNKNOWN — does not become normal auction, goes to NEEDS_REVIEW', () => {
    const result = processWhatsAppMessage({
      profile_id: 'user1',
      raw_text: FIXTURE_UNKNOWN
    }, false, mockConfig)

    expect(result.status).toBe('NEEDS_REVIEW')
    if (result.status === 'NEEDS_REVIEW') {
      expect(result.parse_result.event_type).toBe('UNKNOWN')
    }
  })

  it('F. Duplicate — detected early, returns DUPLICATE status', () => {
    const result = processWhatsAppMessage({
      profile_id: 'user1',
      raw_text: FIXTURE_NORMAL
    }, true, mockConfig)

    expect(result.status).toBe('DUPLICATE')
  })

  it('G. Missing fields — returns NEEDS_REVIEW, no invented values', () => {
    const result = processWhatsAppMessage({
      profile_id: 'user1',
      raw_text: FIXTURE_MISSING_FIELDS
    }, false, mockConfig)

    expect(result.status).toBe('NEEDS_REVIEW')
    if (result.status === 'NEEDS_REVIEW' && result.parse_result.kind === 'partial') {
      expect(result.parse_result.missing_fields.length).toBeGreaterThan(0)
    }
  })

  it('K. Raw message preservation — original text remains exactly the same', () => {
    const result = processWhatsAppMessage({
      profile_id: 'user1',
      raw_text: '  Some  weird   spacing \n\r'
    }, false)

    expect(result.input.raw_text).toBe('  Some  weird   spacing \n\r')
  })
})

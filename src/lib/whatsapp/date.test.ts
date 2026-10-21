import { describe, expect, it } from 'vitest'
import { extractSourceEventDate } from './date'
import { parseWhatsAppMessage } from './parser'

describe('source event dates', () => {
  it('preserves and normalizes a complete WhatsApp export date', () => {
    expect(extractSourceEventDate('[05/07/2025, 10:30] organiser: update')).toEqual({
      raw: '05/07/2025',
      isoDate: '2025-07-05',
    })
  })

  it('represents a missing year as unknown instead of inventing one', () => {
    expect(extractSourceEventDate('[05/07, 10:30] organiser: update')).toEqual({
      raw: '05/07',
      isoDate: null,
    })
  })

  it('rejects impossible calendar dates', () => {
    expect(extractSourceEventDate('[31/02/2025, 10:30] organiser: update')).toEqual({
      raw: '31/02/2025',
      isoDate: null,
    })
  })

  it('does not treat unlabeled financial numbers as dates', () => {
    expect(extractSourceEventDate('installment 10060 / commission 7500')).toBeNull()
  })

  it('preserves the raw source date in parser metadata', () => {
    const parsed = parseWhatsAppMessage(`[05/07/2025, 10:30] organiser:
9th round
தள்ளு 56000
கமிஷன் 7500
ஒரு நபர் தள்ளு 1940
கட்ட வேண்டிய தொகை 10060`)

    expect(parsed.kind).toBe('success')
    if (parsed.kind !== 'error') {
      expect(parsed.metadata.event_date_raw).toBe('05/07/2025')
    }
  })
})

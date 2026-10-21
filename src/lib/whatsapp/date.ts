export interface SourceEventDate {
  raw: string
  isoDate: string | null
}

const WHATSAPP_DATE_PATTERN = /(?:\[\s*|(?:date|தேதி)\s*[:\-]?\s*)(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)(?=[,\]\s]|$)/iu
const ISO_DATE_PATTERN = /(?:\[\s*|(?:date|தேதி)\s*[:\-]?\s*)(\d{4}-\d{1,2}-\d{1,2})(?=[,\]\s]|$)/iu

function validIsoDate(year: number, month: number, day: number): string | null {
  const candidate = new Date(Date.UTC(year, month - 1, day))
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) {
    return null
  }

  return [
    year.toString().padStart(4, '0'),
    month.toString().padStart(2, '0'),
    day.toString().padStart(2, '0'),
  ].join('-')
}

/**
 * Extract a date explicitly present in a WhatsApp export header or date label.
 * A day/month value without a four-digit year is preserved as raw metadata but
 * deliberately returns a null ISO date; no historical year is inferred.
 */
export function extractSourceEventDate(rawText: string): SourceEventDate | null {
  const isoMatch = rawText.match(ISO_DATE_PATTERN)
  if (isoMatch) {
    const [year, month, day] = isoMatch[1].split('-').map(Number)
    return { raw: isoMatch[1], isoDate: validIsoDate(year, month, day) }
  }

  const whatsappMatch = rawText.match(WHATSAPP_DATE_PATTERN)
  if (!whatsappMatch) return null

  const raw = whatsappMatch[1]
  const rawParts = raw.split(/[/-]/)
  if (rawParts.length !== 3 || rawParts[2].length !== 4) {
    return { raw, isoDate: null }
  }

  const [day, month, year] = rawParts.map(Number)
  return { raw, isoDate: validIsoDate(year, month, day) }
}

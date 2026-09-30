import { describe, it, expect } from 'vitest'
import { chitFormSchema } from './schema'

// Valid base payload — all required fields pass DB constraints
const VALID_BASE = {
  name: 'Shriram ₹3L Group',
  face_value: 300000,
  duration_months: 25,
  member_count: 25,
  base_installment: 12000,
  commission_type: 'PERCENTAGE' as const,
  commission_value: 2.5,
  status: 'ACTIVE' as const,
}

describe('chitFormSchema — required field validation', () => {
  it('accepts a fully valid payload', () => {
    const result = chitFormSchema.safeParse(VALID_BASE)
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = chitFormSchema.safeParse({ ...VALID_BASE, name: '' })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.name).toBeDefined()
  })

  it('rejects missing name', () => {
    const { name: _n, ...rest } = VALID_BASE
    const result = chitFormSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })
})

describe('chitFormSchema — face_value constraint', () => {
  it('accepts positive face_value', () => {
    expect(chitFormSchema.safeParse({ ...VALID_BASE, face_value: 100000 }).success).toBe(true)
  })

  it('rejects zero face_value', () => {
    const result = chitFormSchema.safeParse({ ...VALID_BASE, face_value: 0 })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.face_value).toBeDefined()
  })

  it('rejects negative face_value', () => {
    const result = chitFormSchema.safeParse({ ...VALID_BASE, face_value: -1 })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.face_value).toBeDefined()
  })
})

describe('chitFormSchema — duration_months constraint', () => {
  it('accepts positive duration_months', () => {
    expect(chitFormSchema.safeParse({ ...VALID_BASE, duration_months: 1 }).success).toBe(true)
  })

  it('rejects zero duration', () => {
    const result = chitFormSchema.safeParse({ ...VALID_BASE, duration_months: 0 })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.duration_months).toBeDefined()
  })

  it('rejects negative duration', () => {
    const result = chitFormSchema.safeParse({ ...VALID_BASE, duration_months: -5 })
    expect(result.success).toBe(false)
  })
})

describe('chitFormSchema — member_count constraint', () => {
  it('accepts positive member_count', () => {
    expect(chitFormSchema.safeParse({ ...VALID_BASE, member_count: 10 }).success).toBe(true)
  })

  it('rejects zero member_count', () => {
    const result = chitFormSchema.safeParse({ ...VALID_BASE, member_count: 0 })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.member_count).toBeDefined()
  })

  it('rejects negative member_count', () => {
    const result = chitFormSchema.safeParse({ ...VALID_BASE, member_count: -1 })
    expect(result.success).toBe(false)
  })
})

describe('chitFormSchema — base_installment constraint (DB: > 0, NOT >= 0)', () => {
  it('accepts positive base_installment', () => {
    expect(chitFormSchema.safeParse({ ...VALID_BASE, base_installment: 12000 }).success).toBe(true)
  })

  it('rejects zero base_installment', () => {
    const result = chitFormSchema.safeParse({ ...VALID_BASE, base_installment: 0 })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.base_installment).toBeDefined()
  })

  it('rejects negative base_installment', () => {
    const result = chitFormSchema.safeParse({ ...VALID_BASE, base_installment: -100 })
    expect(result.success).toBe(false)
  })

  it('rejects very small non-zero positive (edge)', () => {
    // Any positive value is accepted; 0 is not
    expect(chitFormSchema.safeParse({ ...VALID_BASE, base_installment: 0.01 }).success).toBe(true)
  })
})

describe('chitFormSchema — commission_value constraint (DB: >= 0)', () => {
  it('accepts zero commission_value', () => {
    expect(chitFormSchema.safeParse({ ...VALID_BASE, commission_value: 0 }).success).toBe(true)
  })

  it('accepts positive commission_value', () => {
    expect(chitFormSchema.safeParse({ ...VALID_BASE, commission_value: 2.5 }).success).toBe(true)
  })

  it('rejects negative commission_value', () => {
    const result = chitFormSchema.safeParse({ ...VALID_BASE, commission_value: -0.1 })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.commission_value).toBeDefined()
  })
})

describe('chitFormSchema — commission_type enum', () => {
  it('accepts PERCENTAGE', () => {
    expect(chitFormSchema.safeParse({ ...VALID_BASE, commission_type: 'PERCENTAGE' }).success).toBe(true)
  })

  it('accepts FLAT_AMOUNT', () => {
    expect(chitFormSchema.safeParse({ ...VALID_BASE, commission_type: 'FLAT_AMOUNT' }).success).toBe(true)
  })

  it('accepts OTHER', () => {
    expect(chitFormSchema.safeParse({ ...VALID_BASE, commission_type: 'OTHER' }).success).toBe(true)
  })

  it('rejects invalid commission_type', () => {
    const result = chitFormSchema.safeParse({ ...VALID_BASE, commission_type: 'FIXED' })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.commission_type).toBeDefined()
  })

  it('rejects empty string commission_type', () => {
    const result = chitFormSchema.safeParse({ ...VALID_BASE, commission_type: '' })
    expect(result.success).toBe(false)
  })
})

describe('chitFormSchema — optional fields', () => {
  it('accepts missing group_label', () => {
    const { ...rest } = VALID_BASE
    expect(chitFormSchema.safeParse(rest).success).toBe(true)
  })

  it('accepts empty group_label', () => {
    expect(chitFormSchema.safeParse({ ...VALID_BASE, group_label: '' }).success).toBe(true)
  })

  it('accepts empty company_id', () => {
    expect(chitFormSchema.safeParse({ ...VALID_BASE, company_id: '' }).success).toBe(true)
  })

  it('accepts empty start_date', () => {
    expect(chitFormSchema.safeParse({ ...VALID_BASE, start_date: '' }).success).toBe(true)
  })

  it('accepts valid start_date format', () => {
    expect(chitFormSchema.safeParse({ ...VALID_BASE, start_date: '2025-01-01' }).success).toBe(true)
  })

  it('rejects invalid start_date format', () => {
    const result = chitFormSchema.safeParse({ ...VALID_BASE, start_date: '01/01/2025' })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.start_date).toBeDefined()
  })

  it('accepts empty commission_notes', () => {
    expect(chitFormSchema.safeParse({ ...VALID_BASE, commission_notes: '' }).success).toBe(true)
  })

  it('accepts empty notes', () => {
    expect(chitFormSchema.safeParse({ ...VALID_BASE, notes: '' }).success).toBe(true)
  })
})

describe('chitFormSchema — status constraint', () => {
  it('accepts ACTIVE', () => {
    expect(chitFormSchema.safeParse({ ...VALID_BASE, status: 'ACTIVE' }).success).toBe(true)
  })

  it('accepts COMPLETED', () => {
    expect(chitFormSchema.safeParse({ ...VALID_BASE, status: 'COMPLETED' }).success).toBe(true)
  })

  it('accepts EXITED', () => {
    expect(chitFormSchema.safeParse({ ...VALID_BASE, status: 'EXITED' }).success).toBe(true)
  })

  it('accepts ARCHIVED', () => {
    expect(chitFormSchema.safeParse({ ...VALID_BASE, status: 'ARCHIVED' }).success).toBe(true)
  })

  it('rejects invalid status', () => {
    const result = chitFormSchema.safeParse({ ...VALID_BASE, status: 'PENDING' })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.status).toBeDefined()
  })

  it('rejects arbitrary status string', () => {
    const result = chitFormSchema.safeParse({ ...VALID_BASE, status: 'RUNNING' })
    expect(result.success).toBe(false)
  })

  it('defaults status to ACTIVE when omitted', () => {
    const { status: _s, ...rest } = VALID_BASE
    const result = chitFormSchema.safeParse(rest)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('ACTIVE')
    }
  })
})

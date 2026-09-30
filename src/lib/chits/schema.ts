import { z } from 'zod'

// ---------------------------------------------------------------------------
// Zod schema for the Add Chit form.
// Mirrors the `chits` table DB constraints exactly.
// Used for both client-side validation and server-side validation.
// ---------------------------------------------------------------------------

export const chitFormSchema = z.object({
  // Basic Information
  name: z.string().min(1, 'Chit name is required').max(200, 'Name is too long'),
  group_label: z.string().max(100, 'Group label is too long').optional().or(z.literal('')),
  company_id: z.string().uuid('Invalid company selection').optional().or(z.literal('')),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional()
    .or(z.literal('')),

  // Financial Structure — all strictly positive per DB CHECK constraints
  face_value: z
    .number({ message: 'Face value must be a number' })
    .positive('Face value must be greater than 0'),
  duration_months: z
    .number({ message: 'Duration must be a number' })
    .int('Duration must be a whole number')
    .positive('Duration must be greater than 0'),
  member_count: z
    .number({ message: 'Member count must be a number' })
    .int('Member count must be a whole number')
    .positive('Member count must be greater than 0'),
  base_installment: z
    .number({ message: 'Base installment must be a number' })
    .positive('Base installment must be greater than 0'),  // DB: CHECK (base_installment > 0)

  // Commission
  commission_type: z.enum(['PERCENTAGE', 'FLAT_AMOUNT', 'OTHER'], {
    message: 'Select a valid commission type',
  }),
  commission_value: z
    .number({ message: 'Commission value must be a number' })
    .min(0, 'Commission value cannot be negative'),  // DB: CHECK (commission_value >= 0)
  commission_notes: z.string().max(500, 'Notes too long').optional().or(z.literal('')),

  // Notes
  notes: z.string().max(2000, 'Notes too long').optional().or(z.literal('')),

  // Status — locked to DB enum, defaults to ACTIVE for new chits
  status: z.enum(['ACTIVE', 'COMPLETED', 'EXITED', 'ARCHIVED']).default('ACTIVE'),
})

export type ChitFormValues = z.infer<typeof chitFormSchema>

// Normalise optional string fields — empty string → undefined → null for DB
export function normaliseChitFormValues(values: ChitFormValues) {
  return {
    ...values,
    group_label: values.group_label || null,
    company_id: values.company_id || null,
    start_date: values.start_date || null,
    commission_notes: values.commission_notes || null,
    notes: values.notes || null,
  }
}

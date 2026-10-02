'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { chitFormSchema, normaliseChitFormValues } from '@/lib/chits/schema'
// Phase 7F: clearCashFlowVerification has been removed. The chit UPDATE path
// inlines verified_at=null directly into the UPDATE statement when
// financial/completion-relevant fields change — atomically in one SQL statement.
// Trigger-based invalidation covers ledger_entries and auction_events inserts.

export type ActionState =
  | { status: 'idle' }
  | { status: 'success'; chitId: string }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string[]> }

// Fields that affect cash-flow calculations or completion status.
// A change to ANY of these must invalidate the verification.
// Non-financial cosmetic fields (name, notes, group_label, company_id,
// commission_notes, start_date) do NOT invalidate verification.
const VERIFICATION_INVALIDATING_FIELDS = new Set([
  'status',
  'face_value',
  'base_installment',
  'duration_months',
  'member_count',
  'commission_type',
  'commission_value',
])

function extractRawChitFormData(formData: FormData) {
  return {
    name: formData.get('name'),
    group_label: formData.get('group_label'),
    company_id: formData.get('company_id'),
    start_date: formData.get('start_date'),
    face_value: formData.get('face_value') ? Number(formData.get('face_value')) : undefined,
    duration_months: formData.get('duration_months')
      ? Number(formData.get('duration_months'))
      : undefined,
    member_count: formData.get('member_count') ? Number(formData.get('member_count')) : undefined,
    base_installment: formData.get('base_installment')
      ? Number(formData.get('base_installment'))
      : undefined,
    commission_type: formData.get('commission_type'),
    commission_value:
      formData.get('commission_value') !== null && formData.get('commission_value') !== ''
        ? Number(formData.get('commission_value'))
        : undefined,
    commission_notes: formData.get('commission_notes'),
    notes: formData.get('notes'),
    status: formData.get('status') || 'ACTIVE',
  }
}

export async function createChitAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  // 1. Authenticate — do NOT accept profile_id from the client
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { status: 'error', message: 'You must be signed in to create a chit.' }
  }

  // 2. Parse raw form values
  const raw = extractRawChitFormData(formData)

  // 3. Server-side Zod validation
  const parseResult = chitFormSchema.safeParse(raw)
  if (!parseResult.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const [key, msgs] of Object.entries(parseResult.error.flatten().fieldErrors)) {
      if (msgs) fieldErrors[key] = msgs
    }
    return {
      status: 'error',
      message: 'Please fix the validation errors below.',
      fieldErrors,
    }
  }

  // 4. Normalise and insert into Supabase
  const values = normaliseChitFormValues(parseResult.data)
  const insertPayload = {
    ...values,
    profile_id: user.id,   // Set from authenticated session — never from client
  } as any // Bypass TS 'never[]' error from Supabase typing

  const { data, error: dbError } = await (supabase
    .from('chits') as any)
    .insert(insertPayload)
    .select('id')
    .single()

  if (dbError) {
    // Surface DB constraint violations clearly
    if (dbError.code === '23514') {
      return { status: 'error', message: 'A database constraint was violated. Check your values.' }
    }
    return { status: 'error', message: `Database error: ${dbError.message}` }
  }

  // 5. Revalidate cache and redirect to the newly created chit
  revalidatePath('/chits')
  redirect(`/chits/${(data as any).id}`)
}

export async function updateChitAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  // 1. Authenticate — require signed-in user
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { status: 'error', message: 'You must be signed in to update a chit.' }
  }

  // 2. Validate chit ID
  const chitId = formData.get('id')?.toString() || formData.get('chit_id')?.toString()
  if (!chitId || chitId.trim() === '') {
    return { status: 'error', message: 'Chit ID is required.' }
  }

  // 3. Parse raw form values
  const raw = extractRawChitFormData(formData)

  // 4. Server-side Zod validation through existing chitFormSchema
  const parseResult = chitFormSchema.safeParse(raw)
  if (!parseResult.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const [key, msgs] of Object.entries(parseResult.error.flatten().fieldErrors)) {
      if (msgs) fieldErrors[key] = msgs
    }
    return {
      status: 'error',
      message: 'Please fix the validation errors below.',
      fieldErrors,
    }
  }

  // 5. Determine whether any financial/completion-relevant field is being changed.
  //    If so, inline verified_at=null and verified_by=null into the same UPDATE
  //    statement so invalidation is atomic — a single SQL statement cannot
  //    partially succeed.
  const values = normaliseChitFormValues(parseResult.data)
  const touchesFinancialField = Object.keys(values).some((k) =>
    VERIFICATION_INVALIDATING_FIELDS.has(k)
  )

  // Build the update payload. When financial fields are present, append the
  // verification clearance in the same object so it goes in the same UPDATE.
  const updatePayload: Record<string, unknown> = { ...values }
  if (touchesFinancialField) {
    updatePayload.verified_at = null
    updatePayload.verified_by = null
  }

  const { data, error: dbError } = await (supabase
    .from('chits') as any)
    .update(updatePayload)
    .eq('id', chitId)
    .eq('profile_id', user.id)
    .select('id')
    .maybeSingle()

  if (dbError) {
    if (dbError.code === '23514') {
      return { status: 'error', message: 'A database constraint was violated. Check your values.' }
    }
    return { status: 'error', message: `Database error: ${dbError.message}` }
  }

  if (!data) {
    return { status: 'error', message: 'Chit not found or you do not have permission to edit it.' }
  }

  // 6. Revalidate cache and redirect to detail page
  revalidatePath('/chits')
  revalidatePath(`/chits/${chitId}`)
  redirect(`/chits/${chitId}`)
}

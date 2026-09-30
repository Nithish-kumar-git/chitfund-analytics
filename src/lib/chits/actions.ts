'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { chitFormSchema, normaliseChitFormValues } from '@/lib/chits/schema'

export type ActionState =
  | { status: 'idle' }
  | { status: 'success'; chitId: string }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string[]> }

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
  const raw = {
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
    commission_value: formData.get('commission_value') !== null && formData.get('commission_value') !== ''
      ? Number(formData.get('commission_value'))
      : undefined,
    commission_notes: formData.get('commission_notes'),
    notes: formData.get('notes'),
    status: formData.get('status') || 'ACTIVE',
  }

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

  const { data, error: dbError } = await supabase
    .from('chits')
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

  // 5. Redirect to the newly created chit
  redirect(`/chits/${(data as any).id}`)
}

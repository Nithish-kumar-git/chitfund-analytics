'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type AuthActionState =
  | { error: string; success?: never }
  | { success: string; error?: never }
  | undefined

/**
 * Ensures the profiles row exists for the currently authenticated user.
 *
 * The database already has an `on_auth_user_created` trigger (SECURITY DEFINER)
 * that inserts the profile row on auth.users INSERT. This function is a
 * belt-and-suspenders idempotent upsert for the login path — it covers:
 *   - admin-created users (trigger still fires, but this is an extra safety net)
 *   - any race / retry scenario
 *
 * Uses ON CONFLICT (id) DO NOTHING so it is safe to call on every login.
 * The RLS `profiles_insert_own` policy enforces: auth.uid() = id — so only
 * the authenticated user can ever insert their own row. Client-supplied ids
 * are not accepted (profile id is always taken from auth.getUser()).
 */
async function ensureProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert({ id: userId } as any, { onConflict: 'id', ignoreDuplicates: true })

  if (error) {
    // Log but do not block login — the trigger already handles the normal path.
    // A failure here only matters if the trigger also failed, which is rare.
    console.error('[ensureProfile] upsert error:', error.message)
  }
}

export async function loginAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: error.message }
  }

  // Guarantee the profile row exists — idempotent, trigger is primary path.
  if (data.user) {
    await ensureProfile(supabase, data.user.id)
  }

  redirect('/dashboard')
}

export async function signupAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signUp({ email, password })

  if (error) {
    return { error: error.message }
  }

  // The `on_auth_user_created` trigger (SECURITY DEFINER) already creates the
  // profile row when auth.users is written. We do NOT duplicate that here.
  //
  // If email confirmation is DISABLED: session is returned immediately → redirect.
  // If email confirmation is ENABLED:  no session yet → show confirmation message.
  if (data.session) {
    redirect('/dashboard')
  }

  return { success: 'Check your email to confirm your account before signing in.' }
}

export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ReactNode } from 'react'
import { withAuthDeadline } from '@/lib/supabase/fetch'

export default async function LoginLayout({ children }: { children: ReactNode }) {
  const controller = new AbortController()
  const supabase = await createClient(controller.signal)
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'] = null
  try {
    const result = await withAuthDeadline(supabase.auth.getUser(), controller)
    user = result.data.user
  } catch {
    // Keep the sign-in page accessible while Auth is unavailable.
  }
  
  if (user) {
    redirect('/dashboard')
  }

  return children
}

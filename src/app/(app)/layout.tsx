import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar, MobileTopbar } from '@/components/layout/nav'
import { withAuthDeadline } from '@/lib/supabase/fetch'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const controller = new AbortController()
  const supabase = await createClient(controller.signal)
  let result: Awaited<ReturnType<typeof supabase.auth.getUser>>
  try {
    result = await withAuthDeadline(supabase.auth.getUser(), controller)
  } catch {
    return <main role="alert">We can’t verify your session right now. Please try again shortly.</main>
  }

  const { user } = result.data
  if (result.error?.name === 'AuthRetryableFetchError') {
    return <main role="alert">We can’t verify your session right now. Please try again shortly.</main>
  }

  // Unauthenticated users are sent to the login page
  if (result.error || !user) {
    redirect('/login')
  }

  return (
    <div className="flex h-full min-h-[100dvh] print:bg-white print:text-black">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <MobileTopbar />
        <main className="flex-1 px-5 py-6 md:px-8 md:py-8 max-w-5xl w-full mx-auto print:p-0 print:m-0 print:max-w-none">
          {children}
        </main>
      </div>
    </div>
  )
}

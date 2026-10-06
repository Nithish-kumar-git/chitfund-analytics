import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar, MobileTopbar } from '@/components/layout/nav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  // Unauthenticated users are sent to the root (login/landing)
  if (error || !user) {
    redirect('/')
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

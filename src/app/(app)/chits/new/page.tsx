import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AddChitForm } from '@/components/chits/add-chit-form'
import type { ChitCompany } from '@/types/database'

export default async function NewChitPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/')

  // Fetch companies for the dropdown (user's own, via RLS)
  const { data: companies } = await supabase
    .from('chit_companies')
    .select('id, name')
    .order('name', { ascending: true })

  return (
    <div>
      <header className="mb-8">
        <p className="text-xs font-mono uppercase tracking-widest text-[#059669] mb-2">
          Chits › New
        </p>
        <h1 className="text-2xl font-semibold text-[#E2E8F0] tracking-tight">Add Chit</h1>
        <p className="text-sm text-[#64748B] mt-1">
          Enter the details for a new chit fund scheme.
        </p>
      </header>

      <div className="max-w-2xl">
        <div className="bg-[#192134] border border-[rgba(255,255,255,0.06)] rounded-2xl p-6">
          <AddChitForm companies={(companies ?? []) as Pick<ChitCompany, 'id' | 'name'>[]} />
        </div>
      </div>
    </div>
  )
}

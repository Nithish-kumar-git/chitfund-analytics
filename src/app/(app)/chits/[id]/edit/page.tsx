import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { AddChitForm } from '@/components/chits/add-chit-form'
import type { Chit, ChitCompany } from '@/types/database'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditChitPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/')

  // RLS ensures only the owner can see this record
  const { data: chit, error } = await supabase
    .from('chits')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !chit) notFound()

  const typedChit = chit as Chit

  // Fetch companies for dropdown (user's own, via RLS)
  const { data: companies } = await supabase
    .from('chit_companies')
    .select('id, name')
    .order('name', { ascending: true })

  return (
    <div>
      {/* Back link */}
      <Link
        href={`/chits/${typedChit.id}`}
        className="inline-flex items-center gap-1.5 text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to Chit
      </Link>

      <header className="mb-8">
        <p className="text-xs font-mono uppercase tracking-widest text-[#059669] mb-2">
          Chits › Edit
        </p>
        <h1 className="text-2xl font-semibold text-[#E2E8F0] tracking-tight">Edit Chit</h1>
        <p className="text-sm text-[#64748B] mt-1">
          Update the configuration for {typedChit.name}.
        </p>
      </header>

      <div className="max-w-2xl">
        <div className="bg-[#192134] border border-[rgba(255,255,255,0.06)] rounded-2xl p-6">
          <AddChitForm
            companies={(companies ?? []) as Pick<ChitCompany, 'id' | 'name'>[]}
            initialData={typedChit}
          />
        </div>
      </div>
    </div>
  )
}

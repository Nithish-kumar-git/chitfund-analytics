import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { IngestClient } from './ingest-client'

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function IngestPage({ params }: PageProps) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/')

  // Verify chit exists and belongs to the authenticated user (RLS enforces ownership).
  const { data: chit, error } = await supabase
    .from('chits')
    .select('id')
    .eq('id', id)
    .single()

  if (error || !chit) notFound()

  // The id is now server-verified. Pass it as a plain prop — the client component
  // must NOT re-derive it from the URL.
  return <IngestClient chitId={id} />
}

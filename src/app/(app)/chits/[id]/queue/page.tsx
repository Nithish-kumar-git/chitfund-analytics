import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { QueueClient } from './queue-client'

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function QueuePage({ params }: PageProps) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/')

  // Verify chit ownership
  const { data: chit, error } = await supabase
    .from('chits')
    .select('id, name')
    .eq('id', id)
    .single()

  if (error || !chit) notFound()

  // Fetch pending queue messages
  const { data: messages } = await supabase
    .from('source_messages')
    .select('id, raw_text, parse_status, content_hash, received_at')
    .eq('chit_id', id)
    .in('parse_status', ['PENDING', 'PARSE_FAILED', 'NEEDS_REVIEW'])
    .order('received_at', { ascending: true })

  return <QueueClient chitId={id} initialMessages={messages || []} />
}

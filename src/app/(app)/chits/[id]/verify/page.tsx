import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { VerifyClient } from './verify-client'
import { calculateAuction } from '@/lib/calculations/calculation'

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function VerifyPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  // Fetch Chit Config
  const { data: chit, error: chitError } = await supabase
    .from('chits')
    .select('*')
    .eq('id', id)
    .single()

  if (chitError || !chit) notFound()
  const chitAny = chit as any

  // Fetch Auction Events
  const { data: events, error: eventsError } = await supabase
    .from('auction_events')
    .select(`
      *,
      ledger_entries (
        id,
        entry_type,
        amount,
        transaction_date,
        corrects_entry_id,
        superseded_by_id
      )
    `)
    .eq('chit_id', id)
    .order('round_number', { ascending: false })

  if (eventsError) throw new Error(eventsError.message)

  // Map to include calculated expectations
  const enrichedEvents = (events as any[]).map((event) => {
    // Determine actual payment
    // Valid installments: entry_type === 'INSTALLMENT_PAID' && no superseded_by_id
    const installmentEntries = event.ledger_entries.filter((entry: any) => 
      entry.entry_type === 'INSTALLMENT_PAID' && !entry.superseded_by_id
    )
    const actualPayment = installmentEntries.length > 0
      ? installmentEntries.reduce((sum: number, entry: any) => sum + Number(entry.amount), 0)
      : null

    const paymentDate = installmentEntries.length > 0 
      ? installmentEntries[0].transaction_date
      : null

    let calculatedData = null

    if (event.event_type === 'NORMAL' && event.thallu !== null && event.commission !== null) {
      const calcResult = calculateAuction({
        face_value: chitAny.face_value,
        base_installment: chitAny.base_installment,
        member_count: chitAny.member_count,
        thallu: event.thallu,
        commission: event.commission,
        event_type: 'NORMAL'
      })

      if (calcResult.kind === 'success') {
        calculatedData = {
          expected_payment: calcResult.non_winner_payment,
          member_thallu: calcResult.member_thallu,
          net_thallu: calcResult.net_thallu
        }
      }
    }

    // Determine if it needs verification
    // 1. FLAGGED_MISMATCH always needs verification
    // 2. INDUSTRY_DEFAULT for NORMAL rounds needs verification
    const needsVerification = 
      event.calculation_status === 'FLAGGED_MISMATCH' || 
      (event.calculation_status === 'INDUSTRY_DEFAULT' && event.event_type === 'NORMAL')

    return {
      ...event,
      actual_payment: actualPayment,
      payment_date: paymentDate,
      calculated_data: calculatedData,
      needs_verification: needsVerification,
      ledger_entries: event.ledger_entries
    }
  })

  return (
    <div className="container mx-auto max-w-5xl py-8">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Review Queue</h1>
          <p className="text-muted-foreground mt-1">
            Financial Verification for <span className="font-semibold text-foreground">{chitAny.name}</span>
          </p>
        </div>
      </div>

      <VerifyClient 
        chit={chit} 
        events={enrichedEvents} 
      />
    </div>
  )
}

import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import type { Chit, ChitCompany, AuctionEvent } from '@/types/database'
import { Card } from '@/components/ui/card'
import Link from 'next/link'
import { ArrowLeft, Calendar, Users, Layers, Percent, FileText, Pencil, Activity, BookOpen, Printer } from 'lucide-react'
import { computeChitSummary } from '@/lib/analytics/summary'
import { ChitSummaryCards } from '@/components/analytics/summary-cards'
import { RoiSummaryCard } from '@/components/analytics/roi-summary'
import { LedgerTable } from '@/components/ledger/ledger-table'
import { EventClassification } from '@/components/auction/event-classification'
import { ExportChitButton } from '@/components/export-chit-button'
import type { LedgerRow } from '@/components/ledger/ledger-table'
import { computeCompletedRoi, computeHasRoiBlockingRound } from '@/lib/financial/roi'
import type { RoiInput, EffectiveLedgerEntry } from '@/lib/financial/roi'
import { computeInstallmentSavings } from '@/lib/financial/savings'
import { InstallmentSavingsCard } from '@/components/analytics/installment-savings-card'
import { RecordCashFlowForm } from '@/components/ledger/record-cash-flow-form'
import { WinnerConfirmation } from '@/components/auction/winner-confirmation'

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-0 py-3 border-b border-[rgba(255,255,255,0.05)] last:border-0">
      <dt className="text-xs text-[#64748B] sm:w-44 shrink-0 font-mono uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-[#CBD5E1]">{value ?? <span className="text-[#334155] italic">—</span>}</dd>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACTIVE: 'bg-[#052e16] text-[#4ade80] border-[#14532d]',
    COMPLETED: 'bg-[#1e1b4b] text-[#818cf8] border-[#312e81]',
    EXITED: 'bg-[#1c1917] text-[#a8a29e] border-[#292524]',
    ARCHIVED: 'bg-[#1c1917] text-[#78716c] border-[#292524]',
  }
  return (
    <span
      className={[
        'inline-flex text-xs font-mono uppercase tracking-wider px-2.5 py-1 rounded-lg border',
        styles[status] ?? styles['ARCHIVED'],
      ].join(' ')}
    >
      {status}
    </span>
  )
}

function commissionDisplay(chit: Chit): string {
  const val = Number(chit.commission_value)
  if (chit.commission_type === 'PERCENTAGE') return `${val}%`
  if (chit.commission_type === 'FLAT_AMOUNT') return `₹${val.toLocaleString('en-IN')} flat`
  return `${val} (other)`
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ChitDetailPage({ params }: PageProps) {
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

  // Fetch company name if linked
  let companyName: string | null = null
  if (typedChit.company_id) {
    const { data: company } = await supabase
      .from('chit_companies')
      .select('name')
      .eq('id', typedChit.company_id)
      .single()
    companyName = (company as Pick<ChitCompany, 'name'> | null)?.name ?? null
  }

  // Fetch auction events
  const { data: auctionEvents } = await supabase
    .from('auction_events')
    .select('*')
    .eq('chit_id', id)
    .order('round_number', { ascending: false })

  const typedAuctionEvents = (auctionEvents || []) as AuctionEvent[]
  const chitSummary = computeChitSummary(typedAuctionEvents, typedChit.duration_months)

  // Fetch ledger entries (read-only — Phase 6D)
  // Explicit chit_id filter ensures cross-chit isolation.
  // RLS enforces profile_id ownership at the database level.
  // Outer-joined with auction_events to retrieve round_number safely.
  const { data: ledgerRaw } = await (supabase as any)
    .from('ledger_entries')
    .select('id, transaction_date, entry_type, amount, notes, created_at, corrects_entry_id, auction_event_id, auction_events(round_number)')
    .eq('chit_id', id)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })

  const correctedIds = new Set<string>()
  ;(ledgerRaw || []).forEach((row: any) => {
    if (row.entry_type === 'MANUAL_CORRECTION' && row.corrects_entry_id) {
      correctedIds.add(row.corrects_entry_id)
    }
  })

  const ledgerMetrics = {
    transactionCount: 0,
    installmentCount: 0,
    totalInstallmentAmount: 0,
    totalIncomingAmount: 0
  }

  const ledgerEntries: LedgerRow[] = (ledgerRaw || []).map((row: any) => {
    const isSuperseded = correctedIds.has(row.id)

    // Find effective type if this is a correction
    let effectiveType = row.entry_type
    if (row.entry_type === 'MANUAL_CORRECTION' && row.corrects_entry_id) {
      const original = (ledgerRaw || []).find((r: any) => r.id === row.corrects_entry_id)
      if (original) {
        effectiveType = original.entry_type
      }
    }

    if (!isSuperseded) {
      ledgerMetrics.transactionCount++
      if (effectiveType === 'INSTALLMENT_PAID') {
        ledgerMetrics.installmentCount++
        ledgerMetrics.totalInstallmentAmount += Math.abs(Number(row.amount))
      } else if (effectiveType === 'AUCTION_PAYOUT_RECEIVED') {
        ledgerMetrics.totalIncomingAmount += Math.abs(Number(row.amount))
      }
    }

    return {
      id: row.id,
      transaction_date: row.transaction_date,
      entry_type: row.entry_type,
      amount: Number(row.amount),
      notes: row.notes ?? null,
      created_at: row.created_at,
      round_number: row.auction_events?.round_number ?? null,
      corrects_entry_id: row.corrects_entry_id ?? null,
      is_superseded: isSuperseded,
      effective_entry_type: effectiveType,
      auction_event_id: row.auction_event_id,
    }
  })

  // Build map of auction_event_id -> ledger entry counts for RecordCashFlowForm
  const ledgerCountsByEvent = new Map<string, { installments: number; payouts: number }>()
  ledgerEntries
    .filter((e) => !e.is_superseded && e.auction_event_id)
    .forEach((entry) => {
      const eventId = entry.auction_event_id!
      if (!ledgerCountsByEvent.has(eventId)) {
        ledgerCountsByEvent.set(eventId, { installments: 0, payouts: 0 })
      }
      const counts = ledgerCountsByEvent.get(eventId)!
      if (entry.effective_entry_type === 'INSTALLMENT_PAID') {
        counts.installments++
      } else if (entry.effective_entry_type === 'AUCTION_PAYOUT_RECEIVED') {
        counts.payouts++
      }
    })

  const effectiveEntries: EffectiveLedgerEntry[] = ledgerEntries
    .filter((e) => !e.is_superseded)
    .map((e) => ({
      id: e.id,
      entry_type: e.entry_type,
      effective_entry_type: e.effective_entry_type,
      amount: e.amount,
      transaction_date: e.transaction_date,
    }))

  const hasRoiBlockingRound = computeHasRoiBlockingRound(typedAuctionEvents)

  const roiInput: RoiInput = {
    chit: { status: typedChit.status, duration_months: typedChit.duration_months },
    recordedRoundCount: typedAuctionEvents.length,
    effectiveEntries,
    hasRoiBlockingRound,
    // Phase 7F: Both fields must be populated (not null) for the chit to be verified.
    // verified_by being present ensures the verifier identity is known.
    isCashFlowVerified: typedChit.verified_at !== null && typedChit.verified_by !== null,
  }

  const roiOutcome = computeCompletedRoi(roiInput)

  const { metrics: installmentSavingsMetrics, roundSavingsByNumber } = computeInstallmentSavings(
    Number(typedChit.base_installment),
    typedAuctionEvents.map(event => {
      const actualPaid = effectiveEntries
        .filter(e =>
          (e.effective_entry_type === 'INSTALLMENT_PAID' || e.effective_entry_type === 'LATE_FEE') &&
          (ledgerRaw || []).find((l: any) => l.id === e.id)?.auction_event_id === event.id
        )
        .reduce((sum, e) => sum + Math.abs(Number(e.amount)), 0)
      return { roundNumber: event.round_number, actualPaid: actualPaid > 0 ? actualPaid : null }
    })
  )

  return (
    <div>
      {/* Back link */}
      <Link
        href="/chits"
        className="inline-flex items-center gap-1.5 text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to Chits
      </Link>

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-[#059669] mb-2">Chits › Detail</p>
          <h1 className="text-2xl font-semibold text-[#E2E8F0] tracking-tight">{typedChit.name}</h1>
          {typedChit.group_label && (
            <p className="text-sm text-[#475569] mt-0.5">{typedChit.group_label}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-2">
            <Link
              href={`/chits/${typedChit.id}/edit`}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#1e293b] px-3 py-1.5 text-xs font-medium text-[#CBD5E1] hover:bg-[#334155] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Edit Chit
            </Link>
            <StatusBadge status={typedChit.status} />
          </div>
          <div className="flex items-center gap-2">
            <ExportChitButton chitId={typedChit.id} />
            <Link
              href={`/chits/${typedChit.id}/print`}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#1e293b] px-3 py-1.5 text-xs font-medium text-[#CBD5E1] hover:bg-[#334155] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Printer className="h-3.5 w-3.5" aria-hidden="true" />
              Print Statement
            </Link>
            <Link
              href={`/chits/${typedChit.id}/queue`}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1e293b] border border-[rgba(255,255,255,0.1)] px-4 py-2 text-sm font-medium text-[#CBD5E1] hover:bg-[#334155] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Review Queue
            </Link>
            <Link
              href={`/chits/${typedChit.id}/ingest`}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-medium text-white hover:bg-[#2563EB] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Add WhatsApp Round
            </Link>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Financial Structure */}
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <Layers className="h-4 w-4 text-[#3B82F6]" aria-hidden="true" />
            <span className="text-xs font-mono uppercase tracking-widest text-[#475569]">Financial Structure</span>
          </div>
          <dl>
            <DetailRow
              label="Face Value"
              value={`₹${Number(typedChit.face_value).toLocaleString('en-IN')}`}
            />
            <DetailRow label="Duration" value={`${typedChit.duration_months} months`} />
            <DetailRow label="Members" value={`${typedChit.member_count}`} />
            <DetailRow
              label="Base Installment"
              value={`₹${Number(typedChit.base_installment).toLocaleString('en-IN')} / month`}
            />
          </dl>
        </Card>

        {/* Commission */}
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <Percent className="h-4 w-4 text-[#3B82F6]" aria-hidden="true" />
            <span className="text-xs font-mono uppercase tracking-widest text-[#475569]">Commission</span>
          </div>
          <dl>
            <DetailRow label="Type" value={typedChit.commission_type} />
            <DetailRow label="Value" value={commissionDisplay(typedChit)} />
            <DetailRow label="Notes" value={typedChit.commission_notes} />
          </dl>
        </Card>

        {/* Details */}
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="h-4 w-4 text-[#3B82F6]" aria-hidden="true" />
            <span className="text-xs font-mono uppercase tracking-widest text-[#475569]">Details</span>
          </div>
          <dl>
            <DetailRow
              label="Start Date"
              value={
                typedChit.start_date
                  ? new Date(typedChit.start_date).toLocaleDateString('en-IN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : null
              }
            />
            <DetailRow label="Group" value={typedChit.group_label} />
            <DetailRow label="Company" value={companyName} />
            <DetailRow
              label="Created"
              value={new Date(typedChit.created_at).toLocaleDateString('en-IN', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            />
          </dl>
        </Card>

        {/* Members */}
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-[#3B82F6]" aria-hidden="true" />
            <span className="text-xs font-mono uppercase tracking-widest text-[#475569]">Notes</span>
          </div>
          <dl>
            <DetailRow label="Notes" value={typedChit.notes} />
          </dl>
        </Card>
      </div>

      {/* Chit Progress & Auction Summary */}
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-4 w-4 text-[#3B82F6]" aria-hidden="true" />
          <span className="text-xs font-mono uppercase tracking-widest text-[#475569]">
            Progress & Summary
          </span>
        </div>
        <div className="flex flex-col gap-4">
          <ChitSummaryCards summary={chitSummary} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <InstallmentSavingsCard metrics={installmentSavingsMetrics} />
            <RoiSummaryCard
              outcome={roiOutcome}
              chitId={id}
              effectiveEntries={effectiveEntries}
            />
          </div>
        </div>
      </div>

      {/* Auction History */}
      <div className="mt-8 flex flex-col gap-4">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="h-4 w-4 text-[#3B82F6]" aria-hidden="true" />
          <span className="text-xs font-mono uppercase tracking-widest text-[#475569]">
            Auction History
          </span>
        </div>

        {typedAuctionEvents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[rgba(255,255,255,0.06)] px-5 py-8 text-center">
            <p className="text-xs text-[#334155]">
              No rounds recorded yet.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {typedAuctionEvents.map((round) => {
              const eventCounts = ledgerCountsByEvent.get(round.id) ?? { installments: 0, payouts: 0 }
              
              return (
                <Card key={round.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-3 pb-3 border-b border-[rgba(255,255,255,0.05)]">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-[#E2E8F0]">Round {round.round_number}</span>
                      <StatusBadge status={round.event_type} />
                    </div>
                    {round.calculation_status && round.calculation_status !== 'INDUSTRY_DEFAULT' && (
                      <span className="text-xs text-[#64748B] font-mono">{round.calculation_status}</span>
                    )}
                  </div>

                  {['UNKNOWN', 'FINAL', 'SPECIAL_NO_AUCTION'].includes(round.event_type) ? (
                    <p className="text-sm text-[#94A3B8]">
                      Normal auction calculations are not applicable for {round.event_type} events.
                    </p>
                  ) : (
                    <>
                      <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                          <dt className="text-xs text-[#64748B] font-mono uppercase tracking-wide">Thallu</dt>
                        <dd className="text-sm text-[#E2E8F0]">
                          {round.thallu != null ? `₹${Number(round.thallu).toLocaleString('en-IN')}` : <span className="text-[#334155] italic">—</span>}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-[#64748B] font-mono uppercase tracking-wide">Commission</dt>
                        <dd className="text-sm text-[#E2E8F0]">
                          {round.commission != null ? `₹${Number(round.commission).toLocaleString('en-IN')}` : <span className="text-[#334155] italic">—</span>}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-[#64748B] font-mono uppercase tracking-wide">Member Thallu</dt>
                        <dd className="text-sm text-[#E2E8F0]">
                          {round.member_thallu != null ? `₹${Number(round.member_thallu).toLocaleString('en-IN')}` : <span className="text-[#334155] italic">—</span>}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-[#64748B] font-mono uppercase tracking-wide">Installment Due</dt>
                        <dd className="text-sm text-[#4ade80] font-medium">
                          {round.non_winner_payment != null ? `₹${Number(round.non_winner_payment).toLocaleString('en-IN')}` : <span className="text-[#334155] italic">—</span>}
                        </dd>
                      </div>
                    </dl>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                      <div>
                        <dt className="text-xs text-[#64748B] font-mono uppercase tracking-wide">Base Installment</dt>
                        <dd className="text-sm text-[#E2E8F0]">
                          ₹{Number(typedChit.base_installment).toLocaleString('en-IN')}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-[#64748B] font-mono uppercase tracking-wide">Actual Paid</dt>
                        <dd className="text-sm text-[#4ade80] font-medium">
                          {roundSavingsByNumber[round.round_number]?.actualPaid != null
                            ? `₹${roundSavingsByNumber[round.round_number].actualPaid!.toLocaleString('en-IN')}`
                            : <span className="text-[#334155] italic">—</span>}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-[#64748B] font-mono uppercase tracking-wide">Saved This Round</dt>
                        <dd className="text-sm text-[#15803d] font-bold">
                          {roundSavingsByNumber[round.round_number]?.savedThisRound != null
                            ? `₹${roundSavingsByNumber[round.round_number].savedThisRound!.toLocaleString('en-IN')}`
                            : <span className="text-[#334155] italic">—</span>}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-[#64748B] font-mono uppercase tracking-wide">Cumulative Saved</dt>
                        <dd className="text-sm text-[#15803d] font-bold">
                          {roundSavingsByNumber[round.round_number]?.cumulativeSaved != null
                            ? `₹${roundSavingsByNumber[round.round_number].cumulativeSaved!.toLocaleString('en-IN')}`
                            : <span className="text-[#334155] italic">—</span>}
                        </dd>
                      </div>
                    </dl>
                    </>
                  )}

                  <EventClassification
                    chitId={id}
                    auctionEventId={round.id}
                    eventType={round.event_type}
                  />

                  {round.event_type !== 'UNKNOWN' && (
                    <>
                      <WinnerConfirmation
                        chitId={id}
                        auctionEventId={round.id}
                        roundNumber={round.round_number}
                        currentWonByUs={round.won_by_us}
                        eventType={round.event_type}
                      />

                      <RecordCashFlowForm
                        chitId={id}
                        auctionEventId={round.id}
                        roundNumber={round.round_number}
                        wonByUs={round.won_by_us}
                        expectedInstallment={round.non_winner_payment ? Number(round.non_winner_payment) : null}
                        expectedPayout={round.our_payout_amount ? Number(round.our_payout_amount) : null}
                        existingInstallments={eventCounts.installments}
                        existingPayouts={eventCounts.payouts}
                        eventType={round.event_type}
                      />
                    </>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Ledger — Phase 6D: read-only display of recorded ledger_entries */}
      <div className="mt-8 flex flex-col gap-4">
        <div className="flex items-center gap-2 mb-2">
          <BookOpen className="h-4 w-4 text-[#3B82F6]" aria-hidden="true" />
          <span className="text-xs font-mono uppercase tracking-widest text-[#475569]">
            Financial Ledger
          </span>
        </div>
        <LedgerTable entries={ledgerEntries} metrics={ledgerMetrics} chitId={id} />
      </div>
    </div>
  )
}

import { createClient } from '@/lib/supabase/server'
import type { Chit, AuctionEvent } from '@/types/database'
import { BookOpen, TrendingUp, CheckCircle2, DollarSign } from 'lucide-react'
import { Card } from '@/components/ui/card'
import Link from 'next/link'
import { computePortfolioSummary } from '@/lib/analytics/summary'
import { PortfolioSummaryCards } from '@/components/analytics/summary-cards'
import { computeCompletedRoi, computeActiveMetrics, type EffectiveLedgerEntry } from '@/lib/financial/roi'
import { ExportButton } from '@/components/export-button'

function getEffectiveEntries(entries: any[]): EffectiveLedgerEntry[] {
  const correctedIds = new Set<string>()
  entries.forEach(row => {
    if (row.entry_type === 'MANUAL_CORRECTION' && row.corrects_entry_id) {
      correctedIds.add(row.corrects_entry_id)
    }
  })
  
  return entries
    .filter(row => !correctedIds.has(row.id))
    .map(row => {
      let effectiveType = row.entry_type
      if (row.entry_type === 'MANUAL_CORRECTION' && row.corrects_entry_id) {
        const original = entries.find(r => r.id === row.corrects_entry_id)
        if (original) {
          effectiveType = original.entry_type
        }
      }
      return {
        id: row.id,
        entry_type: row.entry_type,
        effective_entry_type: effectiveType,
        amount: Number(row.amount),
        transaction_date: row.transaction_date,
      }
    })
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: chits } = await supabase
    .from('chits')
    .select('*')
    .order('created_at', { ascending: false })

  // Fetch all ledger entries and auction events for accurate metrics
  const { data: ledgerEntries } = await supabase
    .from('ledger_entries')
    .select('*')
  
  const { data: auctionEvents } = await supabase
    .from('auction_events')
    .select('*')

  const portfolioSummary = computePortfolioSummary((chits ?? []) as Chit[], ledgerEntries ?? [])

  const activeChits = ((chits ?? []) as Chit[]).filter(c => c.status === 'ACTIVE')
  const completedChits = ((chits ?? []) as Chit[]).filter(c => c.status === 'COMPLETED')

  return (
    <div>
      <header className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-[#059669] mb-2">Dashboard</p>
          <h1 className="text-2xl font-semibold text-[#E2E8F0] tracking-tight">Overview</h1>
          <p className="text-sm text-[#64748B] mt-1">
            Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}
          </p>
        </div>
        <div>
          <ExportButton />
        </div>
      </header>

      <PortfolioSummaryCards summary={portfolioSummary} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Active Chits */}
        <section aria-labelledby="active-heading">
          <div className="flex items-center justify-between mb-4">
            <h2 id="active-heading" className="text-sm font-mono uppercase tracking-wider text-[#475569]">
              Active Chits
            </h2>
          </div>

          {!activeChits || activeChits.length === 0 ? (
            <Card className="flex flex-col items-center justify-center py-12 text-center">
              <BookOpen className="h-8 w-8 text-[#334155] mb-3" aria-hidden="true" />
              <p className="text-sm text-[#64748B]">No active chits.</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {activeChits.map((c: any) => {
                const chitEffectiveEntries = getEffectiveEntries(((ledgerEntries as any[]) ?? []).filter(e => e.chit_id === c.id))
                const chitEvents = ((auctionEvents as any[]) ?? []).filter(e => e.chit_id === c.id)
                const metrics = computeActiveMetrics(chitEffectiveEntries)
                const isNetPositive = metrics.netActualCashFlow > 0
                const isNetZero = metrics.netActualCashFlow === 0

                return (
                  <Link key={c.id} href={`/chits/${c.id}`}>
                    <div className="flex flex-col gap-2 px-4 py-3 rounded-xl bg-[#192134] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] transition-colors duration-150">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <TrendingUp className="h-4 w-4 text-[#3B82F6]" aria-hidden="true" />
                          <div>
                            <p className="text-sm font-medium text-[#E2E8F0]">{c.name}</p>
                            <p className="text-xs text-[#64748B]">
                              ₹{Number(c.face_value).toLocaleString('en-IN')} face value
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-[#64748B] bg-[#0F172A] px-2 py-0.5 rounded border border-[#1E293B]">
                            {chitEvents.length} / {c.duration_months} RNDS
                          </span>
                        </div>
                      </div>
                      
                      <div className="mt-2 grid grid-cols-3 gap-2 p-2 rounded-lg bg-[#0F172A] border border-[rgba(255,255,255,0.02)]">
                        <div>
                          <p className="text-[10px] font-mono text-[#64748B] uppercase tracking-wider">Paid</p>
                          <p className="text-sm font-mono text-[#94A3B8]">
                            ₹{metrics.totalActualPaid.toLocaleString('en-IN')}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-mono text-[#64748B] uppercase tracking-wider">Received</p>
                          <p className="text-sm font-mono text-[#94A3B8]">
                            ₹{metrics.totalActualReceived.toLocaleString('en-IN')}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-mono text-[#64748B] uppercase tracking-wider">Net Actual Cash</p>
                          <p className={`text-sm font-mono font-medium ${isNetPositive ? 'text-[#4ade80]' : isNetZero ? 'text-[#94A3B8]' : 'text-[#f87171]'}`}>
                            {isNetPositive ? '+' : ''}₹{metrics.netActualCashFlow.toLocaleString('en-IN')}
                          </p>
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        {/* Completed Chits */}
        <section aria-labelledby="completed-heading">
          <div className="flex items-center justify-between mb-4">
            <h2 id="completed-heading" className="text-sm font-mono uppercase tracking-wider text-[#475569]">
              Completed Chits
            </h2>
          </div>

          {!completedChits || completedChits.length === 0 ? (
            <Card className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="h-8 w-8 text-[#334155] mb-3" aria-hidden="true" />
              <p className="text-sm text-[#64748B]">No completed chits yet.</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {completedChits.map((c: any) => {
                const chitEffectiveEntries = getEffectiveEntries(((ledgerEntries as any[]) ?? []).filter(e => e.chit_id === c.id))
                const chitEvents = ((auctionEvents as any[]) ?? []).filter(e => e.chit_id === c.id)
                const hasFlaggedMismatch = chitEvents.some(e => e.calculation_status === 'FLAGGED_MISMATCH')
                
                const roiInput = {
                  chit: { status: c.status, duration_months: c.duration_months },
                  recordedRoundCount: chitEvents.length,
                  effectiveEntries: chitEffectiveEntries,
                  hasFlaggedMismatch,
                  isCashFlowVerified: c.verified_at !== null
                }
                const roi = computeCompletedRoi(roiInput)
                const metrics = computeActiveMetrics(chitEffectiveEntries)

                const isNetPositive = metrics.netActualCashFlow > 0
                const isNetZero = metrics.netActualCashFlow === 0

                return (
                  <Link key={c.id} href={`/chits/${c.id}`}>
                    <div className="flex flex-col gap-2 px-4 py-3 rounded-xl bg-[#192134] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] transition-colors duration-150">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="h-4 w-4 text-[#818cf8]" aria-hidden="true" />
                          <div>
                            <p className="text-sm font-medium text-[#E2E8F0]">{c.name}</p>
                            <p className="text-xs text-[#64748B]">
                              ₹{Number(c.face_value).toLocaleString('en-IN')} face value
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!c.verified_at && (
                            <span className="text-[10px] font-mono text-amber-500 border border-amber-900/50 bg-amber-900/20 px-1.5 py-0.5 rounded">UNVERIFIED</span>
                          )}
                          <StatusBadge status={c.status} />
                        </div>
                      </div>

                      <div className="mt-2 grid grid-cols-4 gap-2 p-2 rounded-lg bg-[#0F172A] border border-[rgba(255,255,255,0.02)]">
                        <div>
                          <p className="text-[10px] font-mono text-[#64748B] uppercase tracking-wider">Paid</p>
                          <p className="text-sm font-mono text-[#94A3B8]">
                            ₹{metrics.totalActualPaid.toLocaleString('en-IN')}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-mono text-[#64748B] uppercase tracking-wider">Received</p>
                          <p className="text-sm font-mono text-[#94A3B8]">
                            ₹{metrics.totalActualReceived.toLocaleString('en-IN')}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-mono text-[#64748B] uppercase tracking-wider">Net Result</p>
                          <p className={`text-sm font-mono font-medium ${isNetPositive ? 'text-[#4ade80]' : isNetZero ? 'text-[#94A3B8]' : 'text-[#f87171]'}`}>
                            {isNetPositive ? '+' : ''}₹{metrics.netActualCashFlow.toLocaleString('en-IN')}
                          </p>
                        </div>
                        <div className="text-right border-l border-[rgba(255,255,255,0.05)] pl-2">
                          <p className="text-[10px] font-mono text-[#64748B] uppercase tracking-wider">ROI</p>
                          {roi.status === 'AVAILABLE' ? (
                            <p className="text-sm font-mono font-medium text-[#FCD34D]">
                              {roi.simpleRoiPercent.toFixed(2)}%
                            </p>
                          ) : (
                            <p className="text-xs font-mono text-[#64748B] mt-0.5">UNAVAILABLE</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      </div>
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
        'inline-flex text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md border',
        styles[status] ?? styles['ARCHIVED'],
      ].join(' ')}
    >
      {status}
    </span>
  )
}

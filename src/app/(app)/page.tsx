import { createClient } from '@/lib/supabase/server'
import { getCompletePortfolioState, type PortfolioState } from '@/lib/analytics/portfolio-state'
import { Card } from '@/components/ui/card'
import Link from 'next/link'
import { ExportButton } from '@/components/export-button'
import { BookOpen, TrendingUp, CheckCircle2, AlertTriangle, Layers, IndianRupee, PiggyBank, ArrowRight } from 'lucide-react'

function AttentionRequired({ state }: { state: PortfolioState }) {
  const flags = state.chits.flatMap(c => 
    c.qualityFlags.map(f => ({ chit: c.chit, flag: f }))
  )

  if (flags.length === 0) {
    return (
      <Card className="p-4 mb-8 border border-[#14532d]/30 bg-[#052e16]/10 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-[#4ade80]" />
        <p className="text-sm font-medium text-[#4ade80]">No outstanding data-quality issues</p>
      </Card>
    )
  }

  // Group by chit
  const grouped = flags.reduce((acc, { chit, flag }) => {
    if (!acc[chit.id]) acc[chit.id] = { chit, flags: [] }
    acc[chit.id].flags.push(flag)
    return acc
  }, {} as Record<string, { chit: any, flags: any[] }>)

  return (
    <div className="mb-8 flex flex-col gap-3">
      <h2 className="text-sm font-mono uppercase tracking-wider text-amber-500/80">Attention Required</h2>
      {Object.values(grouped).map(({ chit, flags }) => {
        const missingDates = flags.filter(f => f.kind === 'MISSING_AUCTION_DATE').length
        const mismatches = flags.filter(f => f.kind === 'FLAGGED_MISMATCH').length
        const unknowns = flags.filter(f => f.kind === 'UNKNOWN_EVENT').length
        const unverified = flags.some(f => f.kind === 'UNVERIFIED_COMPLETED')

        const summaries = []
        if (missingDates > 0) summaries.push(`${missingDates} auction date${missingDates > 1 ? 's' : ''} missing`)
        if (mismatches > 0) summaries.push(`${mismatches} financial mismatch${mismatches > 1 ? 'es' : ''}`)
        if (unknowns > 0) summaries.push(`${unknowns} unknown event${unknowns > 1 ? 's' : ''}`)
        if (unverified) summaries.push(`Cash-flow verification incomplete`)

        return (
          <Card key={chit.id} className="p-4 border border-amber-900/30 bg-[#1a1020] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-200">{chit.name}</p>
                <p className="text-xs text-amber-400/80">{summaries.join(' • ')}</p>
              </div>
            </div>
            <Link 
              href={`/chits/${chit.id}`}
              className="text-xs font-mono px-3 py-1.5 rounded-md bg-amber-900/30 text-amber-400 hover:bg-amber-900/50 transition-colors"
            >
              Review Chit
            </Link>
          </Card>
        )
      })}
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
    <span className={['inline-flex text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md border', styles[status] ?? styles['ARCHIVED']].join(' ')}>
      {status}
    </span>
  )
}

export default async function CommandDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: chits } = await supabase.from('chits').select('*').order('created_at', { ascending: false })
  const { data: ledgerEntries } = await supabase.from('ledger_entries').select('*')
  const { data: auctionEvents } = await supabase.from('auction_events').select('*')

  const state = getCompletePortfolioState(chits ?? [], auctionEvents ?? [], ledgerEntries ?? [])
  const { summary } = state

  const activeChits = state.chits.filter(c => c.chit.status === 'ACTIVE')
  const completedChits = state.chits.filter(c => c.chit.status === 'COMPLETED')

  return (
    <div>
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-[#059669] mb-2">Command Center</p>
          <h1 className="text-2xl font-semibold text-[#E2E8F0] tracking-tight">Financial Overview</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/chits" className="text-sm font-medium text-[#94A3B8] hover:text-[#E2E8F0]">View Chits</Link>
          <Link href="/chits/new" className="text-sm font-medium px-4 py-2 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white rounded-xl transition-colors">Add Chit</Link>
          <ExportButton />
        </div>
      </header>

      {/* PORTFOLIO OVERVIEW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="p-5 flex flex-col gap-2 border-[#1E293B] bg-[#0F172A]">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-[#64748B]">
            <Layers className="h-4 w-4" />
            Active Chits
          </div>
          <div className="text-2xl font-semibold text-[#E2E8F0]">
            {summary.activeChits} <span className="text-sm text-[#475569] font-normal">/ {summary.totalChits} total</span>
          </div>
        </Card>

        <Card className="p-5 flex flex-col gap-2 border-[#1E293B] bg-[#0F172A]">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-[#64748B]">
            <IndianRupee className="h-4 w-4" />
            Total Face Value
          </div>
          <div className="text-2xl font-semibold text-[#E2E8F0]">
            ₹{summary.totalFaceValue.toLocaleString('en-IN')}
          </div>
        </Card>

        <Card className="p-5 flex flex-col gap-2 border-[#1E293B] bg-[#0F172A]">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-[#64748B]">
            <TrendingUp className="h-4 w-4 text-[#3B82F6]" />
            Actual Paid
          </div>
          <div className="text-2xl font-semibold text-[#E2E8F0]">
            ₹{summary.totalActualPaid.toLocaleString('en-IN')}
          </div>
        </Card>

        <Card className="p-5 flex flex-col gap-2 border-[#14532d]/40 bg-[#052e16]/20">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-[#4ade80]">
            <PiggyBank className="h-4 w-4" />
            Installment Savings
          </div>
          <div className="text-2xl font-semibold text-[#4ade80]">
            ₹{summary.totalInstallmentSavings.toLocaleString('en-IN')}
          </div>
          <div className="text-[10px] text-[#4ade80]/60">Normal installments − actual paid</div>
        </Card>
      </div>

      <AttentionRequired state={state} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ACTIVE CHITS */}
        <section>
          <h2 className="text-sm font-mono uppercase tracking-wider text-[#475569] mb-4">Active Portfolio</h2>
          {activeChits.length === 0 ? (
            <Card className="p-8 text-center text-[#64748B] text-sm bg-[#0F172A]/50">No active chits.</Card>
          ) : (
            <div className="flex flex-col gap-3">
              {activeChits.map(data => {
                const c = data.chit
                const rRounds = data.rounds.length
                const netCash = data.activeMetrics.netActualCashFlow
                const savings = data.installmentSavings?.totalSaved || 0

                return (
                  <div key={c.id} className="flex flex-col gap-0 overflow-hidden rounded-xl bg-[#192134] border border-[rgba(255,255,255,0.06)]">
                    <div className="px-4 py-3 flex items-center justify-between border-b border-[rgba(255,255,255,0.03)]">
                      <div>
                        <p className="text-sm font-medium text-[#E2E8F0]">{c.name}</p>
                        <p className="text-xs text-[#64748B]">Face: ₹{Number(c.face_value).toLocaleString('en-IN')} | Base: ₹{Number(c.base_installment).toLocaleString('en-IN')}</p>
                      </div>
                      <span className="text-xs font-mono text-[#64748B] bg-[#0F172A] px-2 py-1 rounded border border-[#1E293B]">
                        {rRounds} / {c.duration_months} RNDS
                      </span>
                    </div>
                    <div className="p-3 grid grid-cols-3 gap-2 bg-[#0F172A]/30">
                      <div>
                        <p className="text-[10px] font-mono text-[#64748B] uppercase">Actual Paid</p>
                        <p className="text-sm font-mono text-[#94A3B8]">₹{data.activeMetrics.totalActualPaid.toLocaleString('en-IN')}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-mono text-[#64748B] uppercase">Inst. Savings</p>
                        <p className="text-sm font-mono text-[#4ade80]">₹{savings.toLocaleString('en-IN')}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-mono text-[#64748B] uppercase">Net Cash Flow</p>
                        <p className="text-sm font-mono text-[#94A3B8]">₹{netCash.toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                    <div className="px-3 py-2 bg-[#0F172A] flex justify-end gap-2 border-t border-[rgba(255,255,255,0.03)]">
                      <Link href={`/chits/${c.id}`} className="text-xs font-medium text-[#94A3B8] hover:text-[#E2E8F0] px-2 py-1">View Chit</Link>
                      <Link href={`/chits/${c.id}/print`} className="text-xs font-medium text-[#3B82F6] hover:text-[#60A5FA] px-2 py-1 flex items-center gap-1">Statement <ArrowRight className="h-3 w-3"/></Link>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* COMPLETED CHITS */}
        <section>
          <h2 className="text-sm font-mono uppercase tracking-wider text-[#475569] mb-4">Completed / Archives</h2>
          {completedChits.length === 0 ? (
            <Card className="p-8 text-center text-[#64748B] text-sm bg-[#0F172A]/50">No completed chits yet.</Card>
          ) : (
            <div className="flex flex-col gap-3">
              {completedChits.map(data => {
                const c = data.chit
                const netCash = data.activeMetrics.netActualCashFlow

                return (
                  <Link key={c.id} href={`/chits/${c.id}`} className="group block">
                    <div className="flex flex-col gap-2 px-4 py-3 rounded-xl bg-[#192134] border border-[rgba(255,255,255,0.06)] group-hover:border-[rgba(255,255,255,0.12)] transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-[#E2E8F0]">{c.name}</p>
                          <p className="text-xs text-[#64748B]">Face: ₹{Number(c.face_value).toLocaleString('en-IN')}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {!data.isCashFlowVerified && (
                            <span className="text-[10px] font-mono text-amber-500 border border-amber-900/50 bg-amber-900/20 px-1.5 py-0.5 rounded">UNVERIFIED</span>
                          )}
                          <StatusBadge status={c.status} />
                        </div>
                      </div>
                      <div className="mt-1 grid grid-cols-3 gap-2 p-2 rounded-lg bg-[#0F172A]">
                        <div>
                          <p className="text-[10px] font-mono text-[#64748B] uppercase">Paid</p>
                          <p className="text-xs font-mono text-[#94A3B8]">₹{data.activeMetrics.totalActualPaid.toLocaleString('en-IN')}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-mono text-[#64748B] uppercase">Received</p>
                          <p className="text-xs font-mono text-[#94A3B8]">₹{data.activeMetrics.totalActualReceived.toLocaleString('en-IN')}</p>
                        </div>
                        <div className="border-l border-[rgba(255,255,255,0.05)] pl-2">
                          <p className="text-[10px] font-mono text-[#64748B] uppercase">ROI</p>
                          {data.roiOutcome.status === 'AVAILABLE' ? (
                            <p className="text-xs font-mono font-medium text-[#FCD34D]">{data.roiOutcome.simpleRoiPercent.toFixed(2)}%</p>
                          ) : (
                            <p className="text-[10px] font-mono text-[#64748B] mt-0.5 truncate">{data.roiOutcome.status}</p>
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

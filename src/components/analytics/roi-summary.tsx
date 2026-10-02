import { Card } from '@/components/ui/card'
import { CheckCircle2, XCircle, TrendingUp, AlertCircle } from 'lucide-react'
import type { RoiOutcome, RoiUnavailableReason } from '@/lib/financial/roi'

function formatReason(reason: RoiUnavailableReason): string {
  switch (reason) {
    case 'CHIT_NOT_COMPLETED':
      return 'Chit is not yet marked as completed.'
    case 'ROUNDS_MISSING':
      return 'Not all expected rounds are recorded.'
    case 'FLAGGED_MISMATCH':
      return 'Some rounds have an unresolved flagged mismatch.'
    case 'NO_ENTRIES':
      return 'No actual cash-flow entries found.'
    case 'ZERO_TOTAL_PAID':
      return 'Total actual paid is zero; cannot compute ROI.'
    default:
      return reason
  }
}

export function RoiSummaryCard({ outcome }: { outcome: RoiOutcome }) {
  if (outcome.status === 'UNAVAILABLE') {
    // If it's just active, we might show a quieter message.
    // But the spec says: For an ineligible COMPLETED chit, show ROI unavailable + reason.
    // For ACTIVE: "Show an explicit 'ROI available after completion' state."
    const isActiveOnly = outcome.reasons.length === 1 && outcome.reasons[0] === 'CHIT_NOT_COMPLETED'
    
    if (isActiveOnly) {
      return (
        <Card className="p-5 border border-dashed border-[rgba(255,255,255,0.06)] bg-transparent">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-[#1e293b] p-2">
              <TrendingUp className="h-4 w-4 text-[#64748B]" />
            </div>
            <div>
              <p className="text-sm font-medium text-[#E2E8F0]">Final ROI</p>
              <p className="text-xs text-[#94A3B8]">Available after chit completion</p>
            </div>
          </div>
        </Card>
      )
    }

    return (
      <Card className="p-5 border border-dashed border-amber-900/30 bg-amber-900/10">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-amber-900/30 p-2 mt-0.5">
            <AlertCircle className="h-4 w-4 text-amber-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-amber-200 mb-1.5">ROI Unavailable</p>
            <ul className="list-disc list-inside text-xs text-amber-400/80 space-y-1">
              {outcome.reasons.map((reason) => (
                <li key={reason}>{formatReason(reason)}</li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    )
  }

  // Available
  return (
    <Card className="overflow-hidden">
      <div className="bg-[#1e1b4b]/30 p-4 border-b border-[#312e81]/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-[#818cf8]" />
          <h3 className="text-sm font-semibold text-[#e0e7ff]">Completed Chit ROI</h3>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#052e16] border border-[#14532d] text-xs font-mono text-[#4ade80]">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Verified
        </div>
      </div>
      
      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 bg-[#0f172a]">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-[#64748B] mb-1">Total Actual Paid</p>
          <p className="text-xl font-semibold text-[#E2E8F0]">
            ₹{outcome.totalActualPaid.toLocaleString('en-IN')}
          </p>
        </div>
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-[#64748B] mb-1">Total Actual Received</p>
          <p className="text-xl font-semibold text-[#E2E8F0]">
            ₹{outcome.totalActualReceived.toLocaleString('en-IN')}
          </p>
        </div>
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-[#64748B] mb-1">Net Actual Cash Flow</p>
          <p className={`text-xl font-semibold ${outcome.netActualCashFlow >= 0 ? 'text-[#4ade80]' : 'text-rose-400'}`}>
            {outcome.netActualCashFlow >= 0 ? '+' : '-'}₹{Math.abs(outcome.netActualCashFlow).toLocaleString('en-IN')}
          </p>
        </div>
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-[#64748B] mb-1">Simple ROI</p>
          <p className={`text-xl font-semibold ${outcome.simpleRoiPercent >= 0 ? 'text-[#4ade80]' : 'text-rose-400'}`}>
            {outcome.simpleRoiPercent >= 0 ? '+' : ''}{outcome.simpleRoiPercent.toFixed(2)}%
          </p>
        </div>
      </div>
    </Card>
  )
}

'use client'

/**
 * Phase 7E/7F — ROI Summary Card
 *
 * Server-computed ROI outcome is passed in as a prop. This component is a
 * client component so it can manage the verification dialog open/close state.
 *
 * Shows:
 *  - Active chit → quiet "available after completion" hint
 *  - DATA_COMPLETENESS_UNVERIFIED → "Review & Verify Cash Flows" CTA
 *  - Other UNAVAILABLE reasons → list of reasons (no verify CTA)
 *  - AVAILABLE → full ROI breakdown with "Verified" badge
 */

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { CheckCircle2, TrendingUp, AlertCircle, ShieldCheck } from 'lucide-react'
import { computeActiveMetrics, type RoiOutcome, type RoiUnavailableReason, type EffectiveLedgerEntry } from '@/lib/financial/roi'
import { VerificationDialog } from './verification-dialog'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatReason(reason: RoiUnavailableReason): string {
  switch (reason) {
    case 'CHIT_NOT_COMPLETED':
      return 'Chit is not yet marked as completed.'
    case 'ROUNDS_MISSING':
      return 'Not all expected rounds are recorded.'
    case 'FLAGGED_MISMATCH':
      return 'Some rounds have an unresolved flagged mismatch.'
    case 'UNVERIFIED_ROUNDS':
      return 'Some completed rounds are unverified.'
    case 'NO_ENTRIES':
      return 'No actual cash-flow entries found.'
    case 'ZERO_TOTAL_PAID':
      return 'Total actual paid is zero; cannot compute ROI.'
    case 'DATA_COMPLETENESS_UNVERIFIED':
      return 'Actual cash-flow completeness cannot be verified.'
    default:
      return reason
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface RoiSummaryCardProps {
  outcome: RoiOutcome
  chitId: string
  effectiveEntries: EffectiveLedgerEntry[]
}

export function RoiSummaryCard({ outcome, chitId, effectiveEntries }: RoiSummaryCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  // ── Active chit: quiet hint with active cash flow metrics ────────────────
  if (outcome.status === 'UNAVAILABLE') {
    const reasons = outcome.reasons
    const isActive = reasons.includes('CHIT_NOT_COMPLETED')

    if (isActive) {
      const activeMetrics = computeActiveMetrics(effectiveEntries)

      return (
        <Card className="overflow-hidden">
          <div className="bg-[#1e293b]/50 p-4 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-[#64748B]" />
              <h3 className="text-sm font-semibold text-[#e0e7ff]">Active Cash Flow</h3>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1e293b] border border-[rgba(255,255,255,0.06)] text-xs font-mono text-[#94A3B8]">
              Final ROI available after completion
            </div>
          </div>

          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 bg-[#0f172a]">
            <div>
              <p className="text-xs font-mono uppercase tracking-widest text-[#64748B] mb-1">Total Actual Paid</p>
              <p className="text-xl font-semibold text-[#E2E8F0]">
                ₹{activeMetrics.totalActualPaid.toLocaleString('en-IN')}
              </p>
            </div>
            <div>
              <p className="text-xs font-mono uppercase tracking-widest text-[#64748B] mb-1">Total Actual Received</p>
              <p className="text-xl font-semibold text-[#E2E8F0]">
                ₹{activeMetrics.totalActualReceived.toLocaleString('en-IN')}
              </p>
            </div>
            <div>
              <p className="text-xs font-mono uppercase tracking-widest text-[#64748B] mb-1">Net Actual Cash Flow</p>
              <p className={`text-xl font-semibold ${activeMetrics.netActualCashFlow >= 0 ? 'text-[#4ade80]' : 'text-rose-400'}`}>
                {activeMetrics.netActualCashFlow >= 0 ? '+' : '-'}₹{Math.abs(activeMetrics.netActualCashFlow).toLocaleString('en-IN')}
              </p>
            </div>
          </div>
        </Card>
      )
    }

    // ── DATA_COMPLETENESS_UNVERIFIED: show CTA if it's the only blocking reason ──
    const nonVerifyReasons = reasons.filter((r) => r !== 'DATA_COMPLETENESS_UNVERIFIED')
    const isOnlyBlockerVerification = reasons.includes('DATA_COMPLETENESS_UNVERIFIED') && nonVerifyReasons.length === 0

    return (
      <>
        <Card className="p-5 border border-dashed border-amber-900/30 bg-amber-900/10">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-amber-900/30 p-2 mt-0.5">
              <AlertCircle className="h-4 w-4 text-amber-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-200 mb-1.5">ROI Unavailable</p>
              <ul className="list-disc list-inside text-xs text-amber-400/80 space-y-1 mb-3">
                {reasons.map((reason) => (
                  <li key={reason}>{formatReason(reason)}</li>
                ))}
              </ul>

              {/* Only show the CTA when verification is the sole blocker */}
              {isOnlyBlockerVerification && (
                <button
                  id="open-verify-dialog-button"
                  type="button"
                  onClick={() => setDialogOpen(true)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1e1b4b] hover:bg-[#312e81] text-[#a5b4fc] hover:text-white border border-[#312e81]/60 hover:border-[#4f46e5] transition-all"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Review &amp; Verify Cash Flows
                </button>
              )}
            </div>
          </div>
        </Card>

        {dialogOpen && (
          <VerificationDialog
            chitId={chitId}
            effectiveEntries={effectiveEntries}
            onClose={() => setDialogOpen(false)}
          />
        )}
      </>
    )
  }

  // ── ROI Available ────────────────────────────────────────────────────────
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

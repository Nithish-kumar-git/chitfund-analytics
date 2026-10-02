'use client'

/**
 * Phase 7F — Cash-Flow Verification Dialog
 *
 * A client component that shows the user the exact effective ledger entries
 * they are about to confirm. Requires explicit checkbox + button interaction.
 * On success, refreshes the page so the ROI engine picks up the new
 * verified_at / verified_by state.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { verifyChitCashFlows } from '@/app/(app)/chits/[id]/verify-actions'
import type { EffectiveLedgerEntry } from '@/lib/financial/roi'
import type { LedgerEntryType } from '@/types/database'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENTRY_LABELS: Record<LedgerEntryType, string> = {
  INSTALLMENT_PAID:        'Installment Paid',
  AUCTION_PAYOUT_RECEIVED: 'Auction Payout Received',
  ADJUSTMENT:              'Adjustment',
  LATE_FEE:                'Late Fee',
  MATURITY_SETTLEMENT:     'Maturity Settlement',
  MANUAL_CORRECTION:       'Correction',
}

function isOutflow(type: LedgerEntryType): boolean {
  return type === 'INSTALLMENT_PAID' || type === 'LATE_FEE'
}

function isInflow(type: LedgerEntryType): boolean {
  return type === 'AUCTION_PAYOUT_RECEIVED' || type === 'MATURITY_SETTLEMENT'
}

function directionLabel(entry: EffectiveLedgerEntry): string {
  const t = entry.effective_entry_type
  if (isOutflow(t)) return 'Paid'
  if (isInflow(t)) return 'Received'
  if (t === 'ADJUSTMENT') return entry.amount >= 0 ? 'Adjustment (credit)' : 'Adjustment (debit)'
  return '—'
}

function totalOutflow(entries: EffectiveLedgerEntry[]): number {
  return entries.reduce((sum, e) => {
    const t = e.effective_entry_type
    if (isOutflow(t)) return sum + Math.abs(e.amount)
    if (t === 'ADJUSTMENT' && e.amount < 0) return sum + Math.abs(e.amount)
    return sum
  }, 0)
}

function totalInflow(entries: EffectiveLedgerEntry[]): number {
  return entries.reduce((sum, e) => {
    const t = e.effective_entry_type
    if (isInflow(t)) return sum + Math.abs(e.amount)
    if (t === 'ADJUSTMENT' && e.amount > 0) return sum + Math.abs(e.amount)
    return sum
  }, 0)
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

interface VerificationDialogProps {
  chitId: string
  effectiveEntries: EffectiveLedgerEntry[]
  onClose: () => void
}

export function VerificationDialog({
  chitId,
  effectiveEntries,
  onClose,
}: VerificationDialogProps) {
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const outflow = totalOutflow(effectiveEntries)
  const inflow = totalInflow(effectiveEntries)

  function handleVerify() {
    if (!confirmed) return
    setError(null)
    startTransition(async () => {
      const result = await verifyChitCashFlows({ chit_id: chitId })
      if (result.success) {
        onClose()
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && !isPending && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="verify-dialog-title"
    >
      <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-[#0f172a] border border-[rgba(255,255,255,0.08)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-[rgba(255,255,255,0.06)] shrink-0">
          <div className="rounded-full bg-[#1e1b4b] p-2">
            <ShieldCheck className="h-5 w-5 text-[#818cf8]" />
          </div>
          <div>
            <h2
              id="verify-dialog-title"
              className="text-sm font-semibold text-[#E2E8F0]"
            >
              Review &amp; Verify Cash Flows
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Confirm the actual cash flows recorded for this chit are complete.
            </p>
          </div>
        </div>

        {/* Effective ledger entries */}
        <div className="flex-1 overflow-y-auto p-5">
          {effectiveEntries.length === 0 ? (
            <p className="text-xs text-[#64748B] text-center py-6">
              No effective cash-flow entries found.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#64748B] font-mono uppercase tracking-widest border-b border-[rgba(255,255,255,0.05)]">
                  <th className="text-left pb-2 pr-3">Date</th>
                  <th className="text-left pb-2 pr-3">Type</th>
                  <th className="text-left pb-2 pr-3">Direction</th>
                  <th className="text-right pb-2">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
                {effectiveEntries.map((entry) => {
                  const isReceived = isInflow(entry.effective_entry_type)
                  const isPaidOut = isOutflow(entry.effective_entry_type)
                  return (
                    <tr key={entry.id} className="text-[#CBD5E1]">
                      <td className="py-2.5 pr-3 font-mono text-[#94A3B8]">
                        {entry.transaction_date}
                      </td>
                      <td className="py-2.5 pr-3">
                        {ENTRY_LABELS[entry.effective_entry_type] ?? entry.effective_entry_type}
                        {entry.entry_type === 'MANUAL_CORRECTION' && (
                          <span className="ml-1.5 text-[10px] text-amber-400/70 font-mono">(corrected)</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className={
                          isReceived
                            ? 'text-[#4ade80]'
                            : isPaidOut
                            ? 'text-rose-400'
                            : 'text-[#94A3B8]'
                        }>
                          {directionLabel(entry)}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-mono">
                        {isReceived ? '+' : isPaidOut ? '-' : ''}
                        ₹{Math.abs(entry.amount).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {/* Totals */}
          <div className="mt-4 pt-4 border-t border-[rgba(255,255,255,0.06)] grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-[#64748B] mb-1">
                Total Paid (outflows)
              </p>
              <p className="text-base font-semibold text-rose-400">
                -₹{outflow.toLocaleString('en-IN')}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-[#64748B] mb-1">
                Total Received (inflows)
              </p>
              <p className="text-base font-semibold text-[#4ade80]">
                +₹{inflow.toLocaleString('en-IN')}
              </p>
            </div>
          </div>
        </div>

        {/* Confirmation section */}
        <div className="shrink-0 p-5 border-t border-[rgba(255,255,255,0.06)] space-y-4">
          {/* Confirmation checkbox */}
          <label
            className="flex items-start gap-3 cursor-pointer group"
            htmlFor="verify-confirm-checkbox"
          >
            <input
              id="verify-confirm-checkbox"
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[#818cf8] cursor-pointer"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              disabled={isPending}
            />
            <span className="text-xs text-[#CBD5E1] leading-relaxed">
              I confirm that the actual payments made and payouts received recorded
              for this chit are{' '}
              <strong className="text-white">complete and accurate</strong>.
            </span>
          </label>

          {/* Error message */}
          {error && (
            <div className="flex items-start gap-2 rounded-md bg-rose-900/20 border border-rose-900/30 p-3">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-300">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors px-3 py-2 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              id="verify-confirm-button"
              type="button"
              onClick={handleVerify}
              disabled={!confirmed || isPending}
              className={[
                'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all',
                confirmed && !isPending
                  ? 'bg-[#4338ca] hover:bg-[#4f46e5] text-white cursor-pointer'
                  : 'bg-[#1e293b] text-[#475569] cursor-not-allowed',
              ].join(' ')}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Verifying…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Confirm &amp; Verify
                </>
              )}
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}

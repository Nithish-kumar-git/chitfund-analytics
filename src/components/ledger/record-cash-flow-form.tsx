'use client'

/**
 * Phase 8A — Record Cash Flow Form
 *
 * Client component for recording actual installments paid and payouts received.
 * Displays "Expected vs Actual" distinction and allows user to explicitly record
 * actual transactions against auction rounds.
 *
 * FINANCIAL PRINCIPLE:
 *   EXPECTED PAYMENT (from WhatsApp) ≠ ACTUAL PAYMENT (ledger entry)
 *   User must explicitly confirm and record each transaction.
 */

import { useState, useRef } from 'react'
import { recordInstallment, recordPayout } from '@/app/(app)/chits/[id]/record-actions'
import type { RecordResult } from '@/app/(app)/chits/[id]/record-actions'
import { DollarSign, TrendingDown, TrendingUp, Calendar, FileText, AlertCircle } from 'lucide-react'

// Phase 8A.1: Generate idempotency key for double-submit protection
function generateIdempotencyKey(): string {
  return crypto.randomUUID()
}

interface RecordCashFlowFormProps {
  chitId: string
  auctionEventId: string
  roundNumber: number
  wonByUs: boolean | null
  expectedInstallment: number | null // from non_winner_payment or calculation
  expectedPayout: number | null // from winner_payout or calculation
  existingInstallments: number // count of existing INSTALLMENT_PAID entries for this event
  existingPayouts: number // count of existing AUCTION_PAYOUT_RECEIVED entries for this event
  eventType: string
}

type FormMode = 'installment' | 'payout'

export function RecordCashFlowForm({
  chitId,
  auctionEventId,
  roundNumber,
  wonByUs,
  expectedInstallment,
  expectedPayout,
  existingInstallments,
  existingPayouts,
  eventType,
}: RecordCashFlowFormProps) {
  const [mode, setMode] = useState<FormMode | null>(null)
  const [amount, setAmount] = useState<string>('')
  const [transactionDate, setTransactionDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  )
  const [notes, setNotes] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  // Phase 8A.1: Idempotency key generated once per form instance
  const idempotencyKeyRef = useRef<string>(generateIdempotencyKey())

  const handleOpenForm = (formMode: FormMode) => {
    setMode(formMode)
    setError(null)
    setSuccess(false)
    // Generate new idempotency key for new form instance
    idempotencyKeyRef.current = generateIdempotencyKey()
    
    // Pre-fill amount with expected value if available
    if (formMode === 'installment' && expectedInstallment !== null) {
      setAmount(expectedInstallment.toString())
    } else if (formMode === 'payout' && expectedPayout !== null) {
      setAmount(expectedPayout.toString())
    } else {
      setAmount('')
    }
  }

  const handleCancel = () => {
    setMode(null)
    setAmount('')
    setNotes('')
    setError(null)
    setSuccess(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    
    // Phase 8A.1: Immediate guard to prevent double-submit
    if (loading) {
      return
    }
    
    setLoading(true)

    try {
      const amountNum = parseFloat(amount)
      if (isNaN(amountNum) || amountNum <= 0) {
        setError('Amount must be a positive number')
        setLoading(false)
        return
      }

      let result: RecordResult
      if (mode === 'installment') {
        result = await recordInstallment({
          chit_id: chitId,
          auction_event_id: auctionEventId,
          amount: amountNum,
          transaction_date: transactionDate,
          notes: notes || undefined,
          idempotency_key: idempotencyKeyRef.current,
        })
      } else {
        result = await recordPayout({
          chit_id: chitId,
          auction_event_id: auctionEventId,
          amount: amountNum,
          transaction_date: transactionDate,
          notes: notes || undefined,
          idempotency_key: idempotencyKeyRef.current,
        })
      }

      if (result.success) {
        setSuccess(true)
        // Reset form after short delay
        setTimeout(() => {
          handleCancel()
        }, 1500)
      } else {
        setError(result.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Don't show form UI for non-NORMAL events (calculations not applicable)
  const showRecordUI = ['NORMAL', 'SPECIAL_NO_AUCTION', 'UNKNOWN'].includes(eventType)

  if (!showRecordUI) {
    return null
  }

  const canRecordPayout = wonByUs === true

  return (
    <div className="mt-4 pt-4 border-t border-[rgba(255,255,255,0.05)]">
      {/* Expected vs Actual Summary */}
      <div className="mb-4">
        <p className="text-xs font-mono uppercase tracking-widest text-[#64748B] mb-2">
          Cash Flow Status
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Installment */}
          <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#0f172a] p-3">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
              <span className="text-xs font-medium text-[#CBD5E1]">Installment</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-[#64748B]">Expected:</span>
                <span className="text-[#94A3B8]">
                  {expectedInstallment !== null
                    ? `₹${expectedInstallment.toLocaleString('en-IN')}`
                    : '—'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[#64748B]">Recorded:</span>
                <span className={existingInstallments > 0 ? 'text-[#4ade80] font-medium' : 'text-[#334155]'}>
                  {existingInstallments > 0 ? `${existingInstallments} entry(s)` : 'None'}
                </span>
              </div>
            </div>
          </div>

          {/* Payout */}
          <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#0f172a] p-3">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-3.5 w-3.5 text-[#4ade80]" />
              <span className="text-xs font-medium text-[#CBD5E1]">Payout</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-[#64748B]">Expected:</span>
                <span className="text-[#94A3B8]">
                  {expectedPayout !== null
                    ? `₹${expectedPayout.toLocaleString('en-IN')}`
                    : wonByUs === false
                    ? 'Not won'
                    : '—'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[#64748B]">Recorded:</span>
                <span className={existingPayouts > 0 ? 'text-[#4ade80] font-medium' : 'text-[#334155]'}>
                  {existingPayouts > 0 ? `${existingPayouts} entry(s)` : 'None'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons or Form */}
      {mode === null ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleOpenForm('installment')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1e293b] hover:bg-[#334155] text-[#CBD5E1] hover:text-white border border-[rgba(255,255,255,0.1)] transition-colors"
          >
            <TrendingDown className="h-3.5 w-3.5" />
            Record Installment
          </button>
          <button
            type="button"
            onClick={() => handleOpenForm('payout')}
            disabled={!canRecordPayout}
            className={[
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
              canRecordPayout
                ? 'bg-[#052e16] hover:bg-[#14532d] text-[#4ade80] hover:text-white border-[#14532d]'
                : 'bg-[#1c1917] text-[#78716c] border-[#292524] cursor-not-allowed',
            ].join(' ')}
            title={
              !canRecordPayout
                ? wonByUs === false
                  ? 'Cannot record payout: round not won by us'
                  : 'Cannot record payout: winner status unknown'
                : undefined
            }
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Record Payout
            {!canRecordPayout && wonByUs === null && (
              <span className="text-[10px] opacity-60">(winner unknown)</span>
            )}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#0f172a] p-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[rgba(255,255,255,0.05)]">
            {mode === 'installment' ? (
              <>
                <TrendingDown className="h-4 w-4 text-rose-400" />
                <span className="text-sm font-medium text-[#E2E8F0]">
                  Record Installment Payment
                </span>
              </>
            ) : (
              <>
                <TrendingUp className="h-4 w-4 text-[#4ade80]" />
                <span className="text-sm font-medium text-[#E2E8F0]">
                  Record Payout Received
                </span>
              </>
            )}
          </div>

          {expectedInstallment !== null && mode === 'installment' && (
            <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-900/10 border border-amber-900/30">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-400/90">
                Expected amount pre-filled. Verify the <strong>actual</strong> amount paid before recording.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="amount" className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
              Amount (₹) <span className="text-rose-400">*</span>
            </label>
            <input
              type="number"
              id="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              step="0.01"
              min="0"
              required
              className="w-full px-3 py-2 rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#1e293b] text-[#E2E8F0] text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent"
              placeholder="Enter actual amount"
            />
          </div>

          <div>
            <label htmlFor="transaction_date" className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
              <Calendar className="h-3 w-3 inline mr-1" />
              Transaction Date <span className="text-rose-400">*</span>
            </label>
            <input
              type="date"
              id="transaction_date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#1e293b] text-[#E2E8F0] text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="notes" className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
              <FileText className="h-3 w-3 inline mr-1" />
              Notes (optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#1e293b] text-[#E2E8F0] text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent resize-none"
              placeholder="Add any notes about this transaction..."
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-900/20 border border-rose-900/30">
              <AlertCircle className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
              <p className="text-xs text-rose-300">{error}</p>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-[#052e16] border border-[#14532d]">
              <DollarSign className="h-4 w-4 text-[#4ade80]" />
              <p className="text-xs text-[#4ade80] font-medium">
                {mode === 'installment' ? 'Installment' : 'Payout'} recorded successfully!
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={loading || success}
              className={[
                'flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                loading || success
                  ? 'bg-[#1e293b] text-[#64748B] cursor-not-allowed'
                  : 'bg-[#3B82F6] hover:bg-[#2563EB] text-white',
              ].join(' ')}
            >
              {loading ? 'Recording...' : success ? 'Recorded!' : 'Record Transaction'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={loading || success}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-[#1e293b] hover:bg-[#334155] text-[#CBD5E1] border border-[rgba(255,255,255,0.1)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

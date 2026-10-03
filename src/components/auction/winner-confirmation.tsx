'use client'

/**
 * Phase 8A.1 — Winner Status Confirmation UI
 *
 * Separated from cash flow recording to maintain domain semantics:
 * winner status is an auction-event fact, not a cash-flow detail.
 */

import { useState } from 'react'
import { confirmWinnerStatus } from '@/app/(app)/chits/[id]/winner-actions'
import type { ConfirmWinnerResult } from '@/app/(app)/chits/[id]/winner-actions'
import { Trophy, Users, AlertCircle, CheckCircle2 } from 'lucide-react'

interface WinnerConfirmationProps {
  chitId: string
  auctionEventId: string
  roundNumber: number
  currentWonByUs: boolean | null
}

export function WinnerConfirmation({
  chitId,
  auctionEventId,
  roundNumber,
  currentWonByUs,
}: WinnerConfirmationProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showChangeConfirmation, setShowChangeConfirmation] = useState(false)
  const [pendingValue, setPendingValue] = useState<boolean | null>(null)

  const handleConfirm = async (wonByUs: boolean) => {
    // If changing existing value, require confirmation
    if (currentWonByUs !== null) {
      setPendingValue(wonByUs)
      setShowChangeConfirmation(true)
      return
    }

    await executeConfirmation(wonByUs)
  }

  const executeConfirmation = async (wonByUs: boolean) => {
    setError(null)
    setLoading(true)
    setShowChangeConfirmation(false)

    try {
      const result: ConfirmWinnerResult = await confirmWinnerStatus({
        chit_id: chitId,
        auction_event_id: auctionEventId,
        won_by_us: wonByUs,
      })

      if (!result.success) {
        setError(result.error)
      }
      // On success, page revalidates and component re-renders with new value
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
      setPendingValue(null)
    }
  }

  const handleCancelChange = () => {
    setShowChangeConfirmation(false)
    setPendingValue(null)
    setError(null)
  }

  return (
    <div className="mt-4 pt-4 border-t border-[rgba(255,255,255,0.05)]">
      <p className="text-xs font-mono uppercase tracking-widest text-[#64748B] mb-2">
        Winner
      </p>

      {currentWonByUs === null ? (
        // NULL: Winner unknown, prompt for confirmation
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-amber-900/10 border border-amber-900/30 p-3">
            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
            <p className="text-xs text-amber-400/90">
              Winner status unknown. Please confirm who won Round {roundNumber}.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleConfirm(true)}
              disabled={loading}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#052e16] hover:bg-[#14532d] text-[#4ade80] hover:text-white border border-[#14532d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trophy className="h-4 w-4" />
              We Won
            </button>
            <button
              type="button"
              onClick={() => handleConfirm(false)}
              disabled={loading}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#1e293b] hover:bg-[#334155] text-[#CBD5E1] hover:text-white border border-[rgba(255,255,255,0.1)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Users className="h-4 w-4" />
              Someone Else Won
            </button>
          </div>
        </div>
      ) : showChangeConfirmation ? (
        // Confirmation dialog for changing existing value
        <div className="space-y-3 rounded-lg border border-rose-900/30 bg-rose-900/10 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-rose-300 font-medium mb-1">Change Winner Status?</p>
              <p className="text-xs text-rose-400/90 mb-3">
                Current: <strong>{currentWonByUs ? 'We Won' : 'Someone Else Won'}</strong>
                <br />
                New: <strong>{pendingValue ? 'We Won' : 'Someone Else Won'}</strong>
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => executeConfirmation(pendingValue!)}
                  disabled={loading}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white transition-colors disabled:opacity-50"
                >
                  {loading ? 'Confirming...' : 'Yes, Change It'}
                </button>
                <button
                  type="button"
                  onClick={handleCancelChange}
                  disabled={loading}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1e293b] hover:bg-[#334155] text-[#CBD5E1] border border-[rgba(255,255,255,0.1)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        // TRUE or FALSE: Winner confirmed, show status with option to change
        <div className="space-y-2">
          <div
            className={[
              'flex items-center justify-between gap-3 rounded-lg border p-3',
              currentWonByUs
                ? 'bg-[#052e16] border-[#14532d]'
                : 'bg-[#1e293b] border-[rgba(255,255,255,0.1)]',
            ].join(' ')}
          >
            <div className="flex items-center gap-2">
              {currentWonByUs ? (
                <>
                  <Trophy className="h-4 w-4 text-[#4ade80]" />
                  <span className="text-sm font-medium text-[#4ade80]">We Won</span>
                </>
              ) : (
                <>
                  <Users className="h-4 w-4 text-[#94A3B8]" />
                  <span className="text-sm font-medium text-[#94A3B8]">Someone Else Won</span>
                </>
              )}
              <CheckCircle2 className="h-3.5 w-3.5 text-[#64748B]" />
            </div>
            <button
              type="button"
              onClick={() => handleConfirm(!currentWonByUs)}
              disabled={loading}
              className="text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors disabled:opacity-50"
            >
              Change
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-2 flex items-start gap-2 p-3 rounded-lg bg-rose-900/20 border border-rose-900/30">
          <AlertCircle className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
          <p className="text-xs text-rose-300">{error}</p>
        </div>
      )}
    </div>
  )
}

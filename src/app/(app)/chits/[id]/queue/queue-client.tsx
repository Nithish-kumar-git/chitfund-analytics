'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, AlertTriangle, CheckCircle, Info, Inbox } from 'lucide-react'
import { processIngestionText } from '../ingest/actions'
import { confirmFromQueue, dismissFromQueue } from './actions'
import type { IngestionResult } from '@/lib/ingestion/types'

type QueueMessage = {
  id: string
  raw_text: string
  parse_status: string
  content_hash: string
  received_at: string | null
}

export function QueueClient({ chitId, initialMessages }: { chitId: string, initialMessages: QueueMessage[] }) {
  const router = useRouter()
  const [messages, setMessages] = useState<QueueMessage[]>(initialMessages)

  // Sync state if props change (revalidation)
  useEffect(() => {
    setMessages(initialMessages)
  }, [initialMessages])

  return (
    <div className="max-w-3xl">
      <Link
        href={`/chits/${chitId}`}
        className="inline-flex items-center gap-1.5 text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to Chit
      </Link>

      <header className="mb-8">
        <p className="text-xs font-mono uppercase tracking-widest text-[#059669] mb-2">Ingestion</p>
        <h1 className="text-2xl font-semibold text-[#E2E8F0] tracking-tight">Review Queue</h1>
        <p className="text-sm text-[#94A3B8] mt-1">Review and confirm pending WhatsApp messages</p>
      </header>

      {messages.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12 text-center border-dashed border-[#334155]">
          <Inbox className="h-10 w-10 text-[#334155] mb-4" />
          <p className="text-[#94A3B8]">Queue is empty. All caught up!</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {messages.map((msg) => (
            <QueueItem key={msg.id} chitId={chitId} message={msg} />
          ))}
        </div>
      )}
    </div>
  )
}

function QueueItem({ chitId, message }: { chitId: string, message: QueueMessage }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<IngestionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [roundNumber, setRoundNumber] = useState<string>('')
  
  // Auto-analyze on mount
  useEffect(() => {
    startTransition(async () => {
      const res = await processIngestionText(chitId, message.raw_text)
      if (res.success && res.result) {
        setResult(res.result)
        if (res.result.status !== 'PARSE_FAILED' && res.result.status !== 'DUPLICATE') {
          const detectedRound = res.result.parse_result?.metadata?.round_number
          if (detectedRound) {
            setRoundNumber(detectedRound.toString())
          }
        }
      } else {
        setError(res.error || 'Failed to process message')
      }
    })
  }, [chitId, message.raw_text])

  const handleConfirm = () => {
    if (!result) return
    setError(null)
    startTransition(async () => {
      const parsedRound = parseInt(roundNumber, 10)
      const res = await confirmFromQueue(
        message.id,
        chitId,
        !isNaN(parsedRound) ? parsedRound : undefined
      )
      if (!res.success) {
        setError(res.error || 'Failed to confirm')
      }
    })
  }

  const handleDismiss = () => {
    setError(null)
    startTransition(async () => {
      const res = await dismissFromQueue(message.id, chitId)
      if (!res.success) {
        setError(res.error || 'Failed to dismiss')
      }
    })
  }

  const renderMismatch = (label: string, stated?: number, calculated?: number) => {
    if (stated === calculated) {
      return (
        <div className="flex flex-col gap-1">
          <span className="text-[#E2E8F0] font-mono">Stated: ₹{stated ?? 'Not detected'}</span>
          <span className="text-[#E2E8F0] font-mono">Calculated: ₹{calculated ?? 'Not calculated'}</span>
        </div>
      )
    }
    return (
      <div className="flex flex-col gap-1">
        <span className="text-red-400 font-mono">Stated: ₹{stated ?? 'Not detected'}</span>
        <span className="text-green-400 font-mono">Calculated: ₹{calculated ?? 'Not calculated'}</span>
      </div>
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="bg-[#1E293B] border-b border-[#334155] p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {!result && <Info className="h-5 w-5 text-gray-500" />}
          {result?.status === 'READY_FOR_CONFIRMATION' && <CheckCircle className="h-5 w-5 text-green-500" />}
          {result?.status === 'NEEDS_REVIEW' && <AlertTriangle className="h-5 w-5 text-yellow-500" />}
          {result?.status === 'PARSE_FAILED' && <AlertTriangle className="h-5 w-5 text-red-500" />}
          {result?.status === 'DUPLICATE' && <Info className="h-5 w-5 text-blue-500" />}

          <h3 className="font-medium text-[#E2E8F0]">
            {!result && 'Analyzing...'}
            {result?.status === 'READY_FOR_CONFIRMATION' && 'Ready for Confirmation'}
            {result?.status === 'NEEDS_REVIEW' && 'Needs Review'}
            {result?.status === 'PARSE_FAILED' && 'Parse Failed'}
            {result?.status === 'DUPLICATE' && 'Duplicate Detected'}
          </h3>
        </div>
        {message.received_at && (
          <span className="text-xs text-[#64748B] font-mono">
            {new Date(message.received_at).toLocaleDateString()}
          </span>
        )}
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Side: Raw Text */}
        <div className="space-y-2">
          <p className="text-xs font-mono uppercase text-[#64748B]">Raw Message</p>
          <div className="bg-[#0F172A] p-3 rounded-lg border border-[#334155] text-sm font-mono text-[#CBD5E1] whitespace-pre-wrap max-h-60 overflow-y-auto">
            {message.raw_text}
          </div>
        </div>

        {/* Right Side: Analysis */}
        <div className="space-y-4">
          {error && (
            <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {result?.warnings && result.warnings.length > 0 && (
            <div className="p-3 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 text-sm">
              <ul className="list-disc list-inside">
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {result && result.status !== 'PARSE_FAILED' && result.status !== 'DUPLICATE' && result.parse_result && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <span className="text-xs text-[#64748B] uppercase">Event Type</span>
                  <p className="text-sm font-mono text-[#E2E8F0]">{result.parse_result.event_type}</p>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-[#64748B] uppercase block mb-1">Round Number</label>
                  <Input 
                    type="number" 
                    value={roundNumber} 
                    onChange={(e) => setRoundNumber(e.target.value)} 
                    className="h-8 text-sm"
                    disabled={isPending}
                  />
                </div>
              </div>

              {['UNKNOWN', 'FINAL', 'SPECIAL_NO_AUCTION'].includes(result.parse_result.event_type) && (
                <div className="text-yellow-400/80 text-xs py-1">
                  Normal auction calculations are not applicable for {result.parse_result.event_type} events.
                </div>
              )}

              <div className="space-y-2 text-sm border-t border-[#334155] pt-3">
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Thallu</span>
                  <span className="text-[#E2E8F0] font-mono">₹{result.parse_result.fields?.thallu ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Commission</span>
                  <span className="text-[#E2E8F0] font-mono">₹{result.parse_result.fields?.commission ?? '—'}</span>
                </div>
                <div className="flex justify-between items-start pt-2 border-t border-[#334155]/50">
                  <span className="text-[#64748B]">Member Thallu</span>
                  <div className="text-right">
                    {renderMismatch(
                      'Member Thallu',
                      result.parse_result.fields?.stated_member_thallu,
                      result.cross_check_result?.kind === 'mismatch' || result.cross_check_result?.kind === 'match'
                        ? result.cross_check_result.calculated_member_thallu
                        : undefined
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-start pt-2 border-t border-[#334155]/50">
                  <span className="text-[#64748B]">Installment Due</span>
                  <div className="text-right">
                    {renderMismatch(
                      'Installment Due',
                      result.parse_result.fields?.stated_payment,
                      result.cross_check_result?.kind === 'mismatch' || result.cross_check_result?.kind === 'match'
                        ? result.cross_check_result.calculated_non_winner_payment
                        : undefined
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 border-t border-[#334155] bg-[#0F172A] flex justify-end gap-3">
        <Button
          variant="secondary"
          onClick={handleDismiss}
          disabled={isPending}
          className="w-full sm:w-auto"
        >
          {isPending ? 'Processing...' : 'Dismiss'}
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={isPending || !result || result.status === 'PARSE_FAILED' || result.status === 'DUPLICATE' || !roundNumber}
          className="w-full sm:w-auto"
        >
          {isPending ? 'Confirming...' : 'Confirm & Save'}
        </Button>
      </div>
    </Card>
  )
}

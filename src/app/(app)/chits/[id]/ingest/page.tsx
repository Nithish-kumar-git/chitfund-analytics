'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, AlertTriangle, CheckCircle, Info } from 'lucide-react'
import { processIngestionText, confirmIngestion } from './actions'
import type { IngestionResult } from '@/lib/ingestion/types'

export default function IngestPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [rawText, setRawText] = useState('')
  const [roundNumber, setRoundNumber] = useState('')
  const [isPending, startTransition] = useTransition()
  
  const [result, setResult] = useState<IngestionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const handleAnalyze = () => {
    setError(null)
    startTransition(async () => {
      const res = await processIngestionText(params.id, rawText, roundNumber)
      if (!res.success) {
        setError(res.error || 'Failed to process')
      } else if (res.result) {
        setResult(res.result)
        // Auto-fill round number if detected and we didn't have one
        if (res.result.status !== 'PARSE_FAILED' && res.result.status !== 'DUPLICATE') {
          const detectedRound = res.result.parse_result?.metadata?.round_number
          if (detectedRound && !roundNumber) {
            setRoundNumber(detectedRound.toString())
          }
        }
      }
    })
  }

  const handleConfirm = () => {
    if (!result) return
    setError(null)
    startTransition(async () => {
      const parsedRound = parseInt(roundNumber, 10)
      const res = await confirmIngestion(
        params.id, 
        rawText,
        !isNaN(parsedRound) ? parsedRound : undefined
      )
      if (!res.success) {
        setError(res.error || 'Failed to confirm')
      } else {
        router.push(`/chits/${params.id}`)
      }
    })
  }

  const renderMismatch = (label: string, stated?: number, calculated?: number) => {
    if (stated === calculated) {
      return <span className="text-[#E2E8F0] font-mono">₹{stated ?? 'Not detected'}</span>
    }
    return (
      <div className="flex flex-col gap-1">
        <span className="text-red-400 font-mono">Stated: ₹{stated ?? 'Not detected'}</span>
        <span className="text-green-400 font-mono">Calculated: ₹{calculated ?? 'Not calculated'}</span>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <Link
        href={`/chits/${params.id}`}
        className="inline-flex items-center gap-1.5 text-xs text-[#64748B] hover:text-[#94A3B8] transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to Chit
      </Link>

      <header className="mb-8">
        <p className="text-xs font-mono uppercase tracking-widest text-[#059669] mb-2">Ingestion</p>
        <h1 className="text-2xl font-semibold text-[#E2E8F0] tracking-tight">Add WhatsApp Round</h1>
      </header>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <Card className="mb-6">
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="whatsapp-text">WhatsApp Message</Label>
            <Textarea 
              id="whatsapp-text" 
              placeholder="Paste WhatsApp message here..."
              className="h-48 font-mono text-sm"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="round-number">Round Number (Optional if in message)</Label>
            <Input 
              id="round-number" 
              type="number"
              placeholder="e.g. 5"
              value={roundNumber}
              onChange={(e) => setRoundNumber(e.target.value)}
              disabled={isPending}
            />
          </div>

          <Button 
            onClick={handleAnalyze} 
            disabled={!rawText.trim() || isPending}
            className="w-full sm:w-auto self-end"
          >
            {isPending ? 'Analyzing...' : 'Analyze Message'}
          </Button>
        </div>
      </Card>

      {result && (
        <Card className="mb-6 overflow-hidden">
          <div className="bg-[#1E293B] border-b border-[#334155] p-4 flex items-center gap-3">
            {result.status === 'READY_FOR_CONFIRMATION' && <CheckCircle className="h-5 w-5 text-green-500" />}
            {result.status === 'NEEDS_REVIEW' && <AlertTriangle className="h-5 w-5 text-yellow-500" />}
            {result.status === 'PARSE_FAILED' && <AlertTriangle className="h-5 w-5 text-red-500" />}
            {result.status === 'DUPLICATE' && <Info className="h-5 w-5 text-blue-500" />}
            
            <h3 className="font-medium text-[#E2E8F0]">
              {result.status === 'READY_FOR_CONFIRMATION' && 'Ready for Confirmation'}
              {result.status === 'NEEDS_REVIEW' && 'Needs Review'}
              {result.status === 'PARSE_FAILED' && 'Parse Failed'}
              {result.status === 'DUPLICATE' && 'Duplicate Detected'}
            </h3>
          </div>

          <div className="p-4 space-y-4">
            {result.warnings.length > 0 && (
              <div className="p-3 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 text-sm">
                <ul className="list-disc list-inside">
                  {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}

            {result.status !== 'PARSE_FAILED' && result.status !== 'DUPLICATE' && result.parse_result && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="space-y-1 border-b sm:border-b-0 sm:border-r border-[#334155] pb-4 sm:pb-0 sm:pr-4">
                  <p className="text-[#94A3B8] font-mono text-xs uppercase mb-2">Parsed Data</p>
                  <div className="flex justify-between py-1">
                    <span className="text-[#64748B]">Event Type</span>
                    <span className="text-[#E2E8F0] font-mono">{result.parse_result.event_type}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-[#64748B]">Round Number</span>
                    <span className="text-[#E2E8F0] font-mono">{result.parse_result.metadata?.round_number ?? 'Not detected'}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-[#94A3B8] font-mono text-xs uppercase mb-2">Financials</p>
                  
                  {['UNKNOWN', 'FINAL', 'SPECIAL_NO_AUCTION'].includes(result.parse_result.event_type) && (
                    <div className="text-yellow-400/80 text-xs py-2">
                      Normal auction calculations are not applicable for {result.parse_result.event_type} events.
                    </div>
                  )}

                  <div className="flex justify-between py-1 items-start">
                    <span className="text-[#64748B]">Thallu</span>
                    <div className="text-right">
                      {renderMismatch(
                        'Thallu', 
                        result.parse_result.fields?.thallu
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between py-1 items-start">
                    <span className="text-[#64748B]">Commission</span>
                    <div className="text-right">
                      {renderMismatch(
                        'Commission',
                        result.parse_result.fields?.commission
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between py-1 items-start">
                    <span className="text-[#64748B]">Member Thallu</span>
                    <div className="text-right">
                      {renderMismatch(
                        'Member Thallu',
                        result.parse_result.fields?.stated_member_thallu,
                        result.cross_check_result?.kind === 'mismatch' ? result.cross_check_result.calculated_member_thallu : undefined
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between py-1 items-start">
                    <span className="text-[#64748B]">Installment Due</span>
                    <div className="text-right">
                      {renderMismatch(
                        'Installment Due',
                        result.parse_result.fields?.stated_payment,
                        result.cross_check_result?.kind === 'mismatch' ? result.cross_check_result.calculated_non_winner_payment : undefined
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-[#334155] bg-[#0F172A] flex justify-end">
            <Button
              onClick={handleConfirm}
              disabled={isPending || result.status === 'PARSE_FAILED' || result.status === 'DUPLICATE' || !roundNumber}
              className="w-full sm:w-auto"
            >
              {isPending ? 'Confirming...' : 'Confirm & Save'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}

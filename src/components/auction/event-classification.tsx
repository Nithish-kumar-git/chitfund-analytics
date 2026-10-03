'use client'

import { useState } from 'react'
import { Check, X, Loader2, AlertCircle } from 'lucide-react'
import { classifyAuctionEvent } from '@/app/(app)/chits/[id]/winner-actions'
import { Button } from '@/components/ui/button'

interface EventClassificationProps {
  chitId: string
  auctionEventId: string
  eventType: 'UNKNOWN' | 'NORMAL' | 'FINAL' | 'SPECIAL_NO_AUCTION'
}

export function EventClassification({ chitId, auctionEventId, eventType }: EventClassificationProps) {
  const [isClassifying, setIsClassifying] = useState(false)
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (eventType !== 'UNKNOWN') return null

  const handleClassify = async (newType: string) => {
    setSelectedType(newType)
  }

  const confirmClassification = async () => {
    if (!selectedType || selectedType === 'UNKNOWN') {
      setSelectedType(null)
      return
    }
    
    setIsClassifying(true)
    setError(null)
    
    try {
      const res = await classifyAuctionEvent({
        chit_id: chitId,
        auction_event_id: auctionEventId,
        new_event_type: selectedType as any
      })
      
      if (!res.success) {
        setError(res.error)
      } else {
        setSelectedType(null)
      }
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setIsClassifying(false)
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(15,23,42,0.6)] p-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 h-full w-1 bg-yellow-500" />
      
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-[#E2E8F0] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-yellow-500" />
          Event Classification Needed
        </h4>
        <p className="text-xs text-[#94A3B8] mt-1">
          This historical round could not be automatically classified. Please verify the source message and manually classify it.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded bg-[rgba(239,68,68,0.1)] p-3 text-xs text-red-500 border border-[rgba(239,68,68,0.2)]">
          {error}
        </div>
      )}

      {selectedType ? (
        <div className="flex flex-col gap-3">
          <div className="p-3 bg-[rgba(0,0,0,0.2)] rounded text-xs text-[#E2E8F0] border border-[rgba(255,255,255,0.05)]">
            Are you sure you want to classify this round as <span className="font-bold text-white">{selectedType}</span>?
            <br />
            This action will override the calculation status and cannot be automatically undone.
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-yellow-600 hover:bg-yellow-700 text-white"
              onClick={confirmClassification}
              disabled={isClassifying}
            >
              {isClassifying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              Confirm Classification
            </Button>
            <Button
              size="sm"
              className="bg-transparent border border-[rgba(255,255,255,0.2)] text-[#94A3B8] hover:text-white"
              onClick={() => setSelectedType(null)}
              disabled={isClassifying}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="bg-transparent border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" onClick={() => handleClassify('NORMAL')}>
            Normal Auction
          </Button>
          <Button size="sm" className="bg-transparent border border-purple-500/30 text-purple-400 hover:bg-purple-500/10" onClick={() => handleClassify('SPECIAL_NO_AUCTION')}>
            Thai Chittu / Sangam
          </Button>
          <Button size="sm" className="bg-transparent border border-blue-500/30 text-blue-400 hover:bg-blue-500/10" onClick={() => handleClassify('FINAL')}>
            Final Round
          </Button>
        </div>
      )}
    </div>
  )
}

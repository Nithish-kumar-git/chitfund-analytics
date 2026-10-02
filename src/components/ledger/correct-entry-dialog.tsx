'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Pencil } from 'lucide-react'
import { correctLedgerEntry } from '@/app/(app)/chits/[id]/ledger-actions'

interface CorrectEntryDialogProps {
  chitId: string
  entryId: string
  currentAmount: number
  entryType: string
}

export function CorrectEntryDialog({ chitId, entryId, currentAmount, entryType }: CorrectEntryDialogProps) {
  const [open, setOpen] = useState(false)
  const [newAmount, setNewAmount] = useState(currentAmount.toString())
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    
    const amountNum = parseFloat(newAmount)
    if (isNaN(amountNum) || amountNum < 0) {
      setError('Please enter a valid positive amount')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await correctLedgerEntry({
        chit_id: chitId,
        original_entry_id: entryId,
        new_amount: amountNum,
        notes: notes.trim() ? notes.trim() : undefined
      })

      if (!res.success) {
        setError(res.error || 'Failed to correct entry')
      } else {
        setOpen(false)
        router.refresh()
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" className="h-6 px-2 text-[#94A3B8] hover:text-white" onClick={() => setOpen(true)} data-testid={`correct-entry-${entryId}`}>
        <Pencil className="h-3 w-3 mr-1" />
        <span className="text-xs">Correct</span>
      </Button>
    )
  }

  return (
    <div className="w-full mt-3 p-4 bg-[#0f172a] rounded-lg border border-[rgba(255,255,255,0.1)]">
      <h4 className="text-sm font-semibold text-[#E2E8F0] mb-1">Correct {entryType}</h4>
      <p className="text-xs text-[#94A3B8] mb-4">
        This creates a MANUAL_CORRECTION and supersedes the original entry.
      </p>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <div>
          <Label htmlFor={`amount-${entryId}`} className="text-xs text-[#E2E8F0] mb-1 block">Corrected Amount (₹)</Label>
          <Input
            id={`amount-${entryId}`}
            type="number"
            step="0.01"
            min="0"
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
            className="bg-[#1e293b] border-[rgba(255,255,255,0.1)] text-[#E2E8F0] h-8 text-sm"
          />
        </div>
        <div>
          <Label htmlFor={`notes-${entryId}`} className="text-xs text-[#E2E8F0] mb-1 block">Correction Notes (optional)</Label>
          <Input
            id={`notes-${entryId}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Reason for correction..."
            className="bg-[#1e293b] border-[rgba(255,255,255,0.1)] text-[#E2E8F0] h-8 text-sm"
          />
        </div>
        {error && <p className="text-xs font-medium text-red-500" data-testid="correction-error">{error}</p>}
        <div className="flex justify-end gap-2 mt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={isSubmitting}
            className="h-8 text-xs text-[#E2E8F0] hover:bg-[#1e293b]"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={isSubmitting}
            className="h-8 text-xs bg-[#3B82F6] text-white hover:bg-[#2563EB]"
            data-testid="submit-correction"
          >
            {isSubmitting ? 'Saving...' : 'Save Correction'}
          </Button>
        </div>
      </form>
    </div>
  )
}

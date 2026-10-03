'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ExportChitButton({ chitId }: { chitId: string }) {
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleExport = async () => {
    if (isExporting) return
    setIsExporting(true)
    setError(null)

    try {
      const res = await fetch(`/api/chits/${chitId}/export`, {
        method: 'GET',
      })

      if (!res.ok) {
        throw new Error('Failed to generate export')
      }

      // Trigger download
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.style.display = 'none'
      a.href = url
      // Grab filename from header if available, otherwise fallback
      const disposition = res.headers.get('content-disposition')
      let filename = `chit-statement-${new Date().toISOString().split('T')[0]}.xlsx`
      if (disposition && disposition.indexOf('filename=') !== -1) {
        const matches = /filename="([^"]+)"/.exec(disposition)
        if (matches != null && matches[1]) filename = matches[1]
      }
      
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      a.remove()
    } catch (err) {
      console.error(err)
      setError('Export failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {error && <span className="text-xs text-red-500">{error}</span>}
      <Button 
        onClick={handleExport} 
        disabled={isExporting}
        size="sm"
        className="bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] text-[#94A3B8] hover:text-[#E2E8F0] hover:bg-[rgba(255,255,255,0.1)]"
      >
        {isExporting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Exporting...
          </>
        ) : (
          <>
            <Download className="mr-2 h-4 w-4" />
            Export Statement
          </>
        )}
      </Button>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { generateAuditAction } from '@/app/(app)/actions/generate-audit'

export function AuditButton() {
  const [loading, setLoading] = useState(false)
  
  const handleCopy = async () => {
    setLoading(true)
    try {
      const text = await generateAuditAction()
      await navigator.clipboard.writeText(text)
      alert('Audit report copied to clipboard. Ready to paste into Claude.')
    } catch (e: any) {
      alert('Failed to generate audit: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleCopy}
      disabled={loading}
      className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50 bg-slate-900 text-slate-50 shadow hover:bg-slate-900/90 h-9 px-4 py-2"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mr-2"
      >
        <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
      </svg>
      {loading ? 'Generating...' : 'Generate Financial Audit'}
    </button>
  )
}

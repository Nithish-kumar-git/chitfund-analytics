'use client'

/**
 * PrintButton — client component.
 * Renders a single button that calls window.print().
 * Must be a client component for browser API access.
 * Hidden in print mode via @media print in the parent page.
 */
export function PrintButton() {
  return (
    <button
      id="print-statement-button"
      type="button"
      onClick={() => window.print()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.5rem 1.1rem',
        borderRadius: '6px',
        background: '#1d4ed8',
        color: 'white',
        fontSize: '0.8rem',
        fontWeight: 600,
        border: 'none',
        cursor: 'pointer',
      }}
    >
      Print / Save as PDF
    </button>
  )
}
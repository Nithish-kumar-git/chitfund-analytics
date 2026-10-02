import { Card } from '@/components/ui/card'
import type { LedgerEntry, LedgerEntryType } from '@/types/database'
import { CorrectEntryDialog } from './correct-entry-dialog'

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

export interface LedgerRow {
  id: string
  transaction_date: string   // DATE string 'YYYY-MM-DD'
  entry_type: LedgerEntryType
  amount: number
  notes: string | null
  created_at: string
  // Optional join — present when auction_event_id resolves
  round_number?: number | null
  corrects_entry_id: string | null
  is_superseded: boolean
  effective_entry_type: LedgerEntryType
}

export interface LedgerMetrics {
  transactionCount: number
  installmentCount: number
  totalInstallmentAmount: number
  totalIncomingAmount: number
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

const ENTRY_TYPE_LABELS: Record<LedgerEntryType, string> = {
  INSTALLMENT_PAID:         'Installment Paid',
  AUCTION_PAYOUT_RECEIVED:  'Auction Payout Received',
  ADJUSTMENT:               'Adjustment',
  LATE_FEE:                 'Late Fee',
  MATURITY_SETTLEMENT:      'Maturity Settlement',
  MANUAL_CORRECTION:        'Manual Correction',
}

function entryTypeLabel(type: string): string {
  return ENTRY_TYPE_LABELS[type as LedgerEntryType] ?? type
}

function formatDate(dateStr: string): string {
  // dateStr is a DATE string 'YYYY-MM-DD'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatAmount(amount: number): string {
  return `₹${Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const ENTRY_TYPE_BADGE_STYLES: Partial<Record<LedgerEntryType, string>> = {
  INSTALLMENT_PAID:         'bg-[#0c2340] text-[#60a5fa] border-[#1e3a5f]',
  AUCTION_PAYOUT_RECEIVED:  'bg-[#052e16] text-[#4ade80] border-[#14532d]',
  ADJUSTMENT:               'bg-[#1c1917] text-[#a8a29e] border-[#292524]',
  LATE_FEE:                 'bg-[#2d0f0f] text-[#f87171] border-[#7f1d1d]',
  MATURITY_SETTLEMENT:      'bg-[#1e1b4b] text-[#818cf8] border-[#312e81]',
  MANUAL_CORRECTION:        'bg-[#1c1917] text-[#fbbf24] border-[#451a03]',
}

function EntryTypeBadge({ type }: { type: string }) {
  const styles = ENTRY_TYPE_BADGE_STYLES[type as LedgerEntryType]
    ?? 'bg-[#1c1917] text-[#a8a29e] border-[#292524]'
  return (
    <span
      className={[
        'inline-flex text-xs font-mono uppercase tracking-wide px-2 py-0.5 rounded border whitespace-nowrap',
        styles,
      ].join(' ')}
    >
      {entryTypeLabel(type)}
    </span>
  )
}

// -------------------------------------------------------------------------
// Public component
// -------------------------------------------------------------------------

interface LedgerTableProps {
  entries: LedgerRow[]
  metrics: LedgerMetrics
  chitId: string
}

export function LedgerTable({ entries, metrics, chitId }: LedgerTableProps) {
  if (entries.length === 0) {
    return (
      <div
        data-testid="ledger-empty-state"
        className="rounded-xl border border-dashed border-[rgba(255,255,255,0.06)] px-5 py-8 text-center"
      >
        <p className="text-xs text-[#334155]">No ledger entries recorded yet.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6" data-testid="ledger-table">
      {/* Safe Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-[#1e293b]/50">
          <dt className="text-xs text-[#64748B] font-mono uppercase tracking-wide mb-1">Effective Transactions</dt>
          <dd className="text-xl font-semibold text-[#E2E8F0]">{metrics.transactionCount}</dd>
        </Card>
        <Card className="p-4 bg-[#1e293b]/50">
          <dt className="text-xs text-[#64748B] font-mono uppercase tracking-wide mb-1">Installments Recorded</dt>
          <dd className="text-xl font-semibold text-[#E2E8F0]">{metrics.installmentCount}</dd>
        </Card>
        <Card className="p-4 bg-[#1e293b]/50">
          <dt className="text-xs text-[#64748B] font-mono uppercase tracking-wide mb-1">Total Installments Out</dt>
          <dd className="text-xl font-semibold text-[#E2E8F0]">{formatAmount(metrics.totalInstallmentAmount)}</dd>
        </Card>
        <Card className="p-4 bg-[#1e293b]/50">
          <dt className="text-xs text-[#64748B] font-mono uppercase tracking-wide mb-1">Total Incoming</dt>
          <dd className="text-xl font-semibold text-[#4ade80]">{formatAmount(metrics.totalIncomingAmount)}</dd>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        {entries.map((entry) => (
          <Card key={entry.id} className={`p-4 ${entry.is_superseded ? 'opacity-50 grayscale' : ''}`}>
          {/* Header row: date + badge */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-3 border-b border-[rgba(255,255,255,0.05)]">
            <div className="flex items-center gap-3">
              <span
                data-testid={`ledger-entry-type-${entry.id}`}
                className="sr-only"
              >
                {entryTypeLabel(entry.entry_type)}
              </span>
              <EntryTypeBadge type={entry.entry_type} />
              {entry.round_number != null && (
                <span
                  data-testid={`ledger-round-${entry.id}`}
                  className="text-xs text-[#64748B] font-mono"
                >
                  Round {entry.round_number}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span
                data-testid={`ledger-date-${entry.id}`}
                className="text-xs text-[#64748B] font-mono"
              >
                {formatDate(entry.transaction_date)}
              </span>
              {entry.is_superseded ? (
                <span className="text-xs font-semibold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                  SUPERSEDED
                </span>
              ) : (
                entry.entry_type !== 'MANUAL_CORRECTION' && (
                  <CorrectEntryDialog
                    chitId={chitId}
                    entryId={entry.id}
                    currentAmount={entry.amount}
                    entryType={entryTypeLabel(entry.entry_type)}
                  />
                )
              )}
            </div>
          </div>

          {/* Amount + Notes row */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <dt className="text-xs text-[#64748B] font-mono uppercase tracking-wide mb-1">
                Recorded Amount
              </dt>
              <dd
                data-testid={`ledger-amount-${entry.id}`}
                className="text-sm font-medium text-[#E2E8F0]"
              >
                {formatAmount(entry.amount)}
              </dd>
            </div>

            {entry.notes && (
              <div className="max-w-sm text-right">
                <dt className="text-xs text-[#64748B] font-mono uppercase tracking-wide mb-1">
                  Notes
                </dt>
                <dd
                  data-testid={`ledger-notes-${entry.id}`}
                  className="text-xs text-[#94A3B8]"
                >
                  {entry.notes}
                </dd>
              </div>
            )}
          </div>
        </Card>
        ))}
      </div>
    </div>
  )
}

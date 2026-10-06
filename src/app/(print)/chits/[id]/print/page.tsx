import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import type { Chit, ChitCompany, AuctionEvent, LedgerEntryType } from '@/types/database'
import { buildStatementData } from '@/lib/statement/build-statement-data'
import type {
  StatementLedgerRow,
  StatementRound,
  StatementCashFlowRow,
  DataQualityFlag,
  WinnerDisplay,
} from '@/lib/statement/build-statement-data'
import type { RoiOutcome } from '@/lib/financial/roi'
import { PrintButton } from './print-button'

// ---------------------------------------------------------------------------
// Format helpers (server-side only, no client bundle impact)
// ---------------------------------------------------------------------------

function fmt(amount: number | null | undefined): string {
  if (amount == null) return '\u2014'
  return `\u20B9${Math.abs(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '\u2014'
  const d = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr)
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtDateLong(dateStr: string | null | undefined): string {
  if (!dateStr) return '\u2014'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })
}

const ENTRY_TYPE_LABELS: Record<LedgerEntryType, string> = {
  INSTALLMENT_PAID: 'Installment Paid',
  AUCTION_PAYOUT_RECEIVED: 'Auction Payout Received',
  ADJUSTMENT: 'Adjustment',
  LATE_FEE: 'Late Fee',
  MATURITY_SETTLEMENT: 'Maturity Settlement',
  MANUAL_CORRECTION: 'Manual Correction',
}

function entryLabel(type: LedgerEntryType): string {
  return ENTRY_TYPE_LABELS[type] ?? type
}

function winnerLabel(w: WinnerDisplay): string {
  switch (w) {
    case 'WE_WON': return 'We Won'
    case 'SOMEONE_ELSE_WON': return 'Someone Else Won'
    case 'NOT_APPLICABLE': return 'N/A (Thai Chittu / Sangam)'
    case 'UNKNOWN': return 'Unknown'
  }
}

function roiDisplay(outcome: RoiOutcome): string {
  if (outcome.status === 'AVAILABLE') {
    const sign = outcome.simpleRoiPercent >= 0 ? '+' : ''
    return `${sign}${outcome.simpleRoiPercent.toFixed(2)}%`
  }
  return 'N/A'
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="stmt-heading">{children}</h2>
}

function RoundBadge({ type }: { type: AuctionEvent['event_type'] }) {
  const cls =
    type === 'NORMAL' ? 'rtype-normal'
    : type === 'SPECIAL_NO_AUCTION' ? 'rtype-special'
    : type === 'FINAL' ? 'rtype-final'
    : 'rtype-unknown'
  return <span className={`rtype ${cls}`}>{type}</span>
}

// ---------------------------------------------------------------------------
// Page (Server Component)
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PrintStatementPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/')

  // Chit (RLS enforces ownership)
  const { data: chit, error: chitError } = await supabase
    .from('chits')
    .select('*')
    .eq('id', id)
    .single()
  if (chitError || !chit) notFound()
  const typedChit = chit as Chit

  // Company name
  let companyName: string | null = null
  if (typedChit.company_id) {
    const { data: company } = await supabase
      .from('chit_companies')
      .select('name')
      .eq('id', typedChit.company_id)
      .single()
    companyName = (company as Pick<ChitCompany, 'name'> | null)?.name ?? null
  }

  // Auction events (ascending for the statement)
  const { data: auctionEventsRaw } = await supabase
    .from('auction_events')
    .select('*')
    .eq('chit_id', id)
    .order('round_number', { ascending: true })
  const typedAuctionEvents = (auctionEventsRaw ?? []) as AuctionEvent[]

  // Ledger entries (mirrors main page query exactly)
  const { data: ledgerRaw } = await (supabase as any)
    .from('ledger_entries')
    .select(
      'id, transaction_date, entry_type, amount, notes, created_at, corrects_entry_id, auction_event_id, auction_events(round_number)'
    )
    .eq('chit_id', id)
    .order('transaction_date', { ascending: true })
    .order('created_at', { ascending: true })

  // Resolve superseded status (mirrors main page logic exactly)
  const correctedIds = new Set<string>()
  ;(ledgerRaw ?? []).forEach((row: any) => {
    if (row.entry_type === 'MANUAL_CORRECTION' && row.corrects_entry_id) {
      correctedIds.add(row.corrects_entry_id)
    }
  })

  const ledgerRows: StatementLedgerRow[] = (ledgerRaw ?? []).map((row: any) => {
    const isSuperseded = correctedIds.has(row.id)
    let effectiveType = row.entry_type
    if (row.entry_type === 'MANUAL_CORRECTION' && row.corrects_entry_id) {
      const original = (ledgerRaw ?? []).find((r: any) => r.id === row.corrects_entry_id)
      if (original) effectiveType = original.entry_type
    }
    return {
      id: row.id,
      transaction_date: row.transaction_date,
      entry_type: row.entry_type,
      amount: Number(row.amount),
      notes: row.notes ?? null,
      created_at: row.created_at,
      round_number: row.auction_events?.round_number ?? null,
      auction_event_id: row.auction_event_id,
      corrects_entry_id: row.corrects_entry_id ?? null,
      is_superseded: isSuperseded,
      effective_entry_type: effectiveType,
    }
  })

  // Build statement data via the pure function (no financial logic duplicated here)
  const statement = buildStatementData({
    chit: typedChit,
    companyName,
    auctionEvents: typedAuctionEvents,
    ledgerRows,
  })

  const { rounds, cashFlow, roiOutcome, activeMetrics, isCashFlowVerified, qualityFlags, generatedAt, installmentSavings } = statement
  const genDate = fmtDate(generatedAt.split('T')[0])

  return (
    <>
      <style>{`
        /* Reset for this page */
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #f1f5f9; }

        /* Controls bar — screen only */
        .print-controls {
          position: sticky; top: 0; z-index: 50;
          background: #0f172a;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          padding: 0.7rem 1.5rem;
          display: flex; align-items: center; justify-content: space-between; gap: 1rem;
        }
        .print-controls a {
          color: #94a3b8; font-size: 0.75rem; text-decoration: none;
          font-family: system-ui, sans-serif;
        }
        .print-controls a:hover { color: #e2e8f0; }

        /* Statement shell */
        .stmt {
          max-width: 880px; margin: 0 auto;
          padding: 2rem 1.5rem 4rem;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          font-size: 0.82rem;
          color: #1e293b;
          background: #ffffff;
          line-height: 1.5;
        }

        /* Header */
        .stmt-hdr { border-bottom: 2px solid #1e293b; padding-bottom: 1rem; margin-bottom: 1.5rem; }
        .stmt-hdr h1 { font-size: 1.45rem; font-weight: 700; color: #0f172a; margin-bottom: 0.2rem; }
        .stmt-hdr .group { font-size: 0.85rem; color: #475569; margin-bottom: 0.15rem; }
        .stmt-hdr .meta { font-size: 0.7rem; color: #64748b; }

        /* Section headings */
        .stmt-heading {
          font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.1em;
          color: #64748b; font-weight: 600;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 0.3rem; margin: 1.5rem 0 0.75rem;
        }

        /* Summary grid */
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(155px, 1fr)); gap: 0.65rem; margin-bottom: 0.75rem; }
        .scard { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.55rem 0.7rem; }
        .scard dt { font-size: 0.58rem; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 0.15rem; }
        .scard dd { font-size: 0.88rem; font-weight: 600; color: #0f172a; }
        .scard.pos dd { color: #15803d; }
        .scard.neg dd { color: #dc2626; }

        /* Tables */
        table { width: 100%; border-collapse: collapse; }
        th {
          background: #f1f5f9; text-align: left;
          padding: 0.4rem 0.45rem;
          font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.07em;
          color: #475569; border-bottom: 1px solid #cbd5e1;
        }
        td { padding: 0.38rem 0.45rem; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
        tr:last-child td { border-bottom: none; }
        tr.superseded td { color: #94a3b8; text-decoration: line-through; background: #fafafa; }

        /* Round type badges */
        .rtype {
          display: inline-block; font-size: 0.58rem; font-weight: 600;
          padding: 0.12rem 0.38rem; border-radius: 3px;
          text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap;
        }
        .rtype-normal { background: #dbeafe; color: #1d4ed8; }
        .rtype-special { background: #fef9c3; color: #854d0e; }
        .rtype-final { background: #ede9fe; color: #6d28d9; }
        .rtype-unknown { background: #fee2e2; color: #991b1b; }

        /* Calc status tag */
        .cstatus { font-size: 0.58rem; color: #b45309; margin-left: 0.3rem; }

        /* ROI unavailable notice */
        .roi-na { font-size: 0.7rem; color: #64748b; font-style: italic; margin-bottom: 0.5rem; }

        /* Data quality */
        .qlist { list-style: none; display: flex; flex-direction: column; gap: 0.25rem; }
        .qitem {
          font-size: 0.7rem; padding: 0.28rem 0.55rem; border-radius: 4px;
        }
        .qitem.warn { background: #fef3c7; color: #92400e; }
        .qitem.err { background: #fee2e2; color: #991b1b; }
        .qitem .rtag { font-weight: 700; margin-right: 0.3rem; }

        /* Footer */
        .stmt-footer {
          margin-top: 2.5rem; padding-top: 0.7rem; border-top: 1px solid #e2e8f0;
          font-size: 0.62rem; color: #94a3b8;
          display: flex; justify-content: space-between; flex-wrap: wrap; gap: 0.3rem;
        }

        /* Print rules */
        @media print {
          @page { size: A4; margin: 16mm 14mm; }
          html, body { background: white !important; }
          .print-controls { display: none !important; }
          .stmt { max-width: 100%; padding: 0; margin: 0; }
          .scard { break-inside: avoid; }
          .qitem { break-inside: avoid; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
          table { font-size: 0.7rem; }
          th { font-size: 0.56rem; }
        }
      `}</style>

      {/* Screen-only controls bar */}
      <div className="print-controls">
        <a href={`/chits/${id}`}>&larr; Back to Chit</a>
        <PrintButton />
      </div>

      <div className="stmt">

        {/* HEADER */}
        <header className="stmt-hdr">
          <h1>{typedChit.name}</h1>
          {typedChit.group_label && <div className="group">{typedChit.group_label}</div>}
          <div className="meta">
            Status: <strong>{typedChit.status}</strong>
            {companyName && <> &nbsp;&middot;&nbsp; Company: <strong>{companyName}</strong></>}
            &nbsp;&middot;&nbsp; Generated: {genDate}
          </div>
        </header>

        {/* CHIT CONFIGURATION */}
        <SectionHeading>Chit Configuration</SectionHeading>
        <div className="summary-grid">
          <dl className="scard"><dt>Face Value</dt><dd>{fmt(typedChit.face_value)}</dd></dl>
          <dl className="scard"><dt>Members</dt><dd>{typedChit.member_count}</dd></dl>
          <dl className="scard"><dt>Duration</dt><dd>{typedChit.duration_months} months</dd></dl>
          <dl className="scard"><dt>Base Installment</dt><dd>{fmt(typedChit.base_installment)}</dd></dl>
          {typedChit.start_date && (
            <dl className="scard"><dt>Start Date</dt><dd>{fmtDateLong(typedChit.start_date)}</dd></dl>
          )}
          <dl className="scard">
            <dt>Commission</dt>
            <dd>
              {typedChit.commission_type === 'PERCENTAGE'
                ? `${typedChit.commission_value}%`
                : typedChit.commission_type === 'FLAT_AMOUNT'
                ? fmt(typedChit.commission_value)
                : `${typedChit.commission_value}`}
            </dd>
          </dl>
        </div>

        {/* FINANCIAL SUMMARY */}
        <SectionHeading>Financial Summary</SectionHeading>
        <div className="summary-grid">
          <dl className="scard">
            <dt>Rounds Recorded</dt>
            <dd>{rounds.length} / {typedChit.duration_months}</dd>
          </dl>
          <dl className="scard">
            <dt>Actual Paid (Out)</dt>
            <dd>{fmt(activeMetrics.totalActualPaid)}</dd>
          </dl>
          <dl className="scard">
            <dt>Actual Received (In)</dt>
            <dd>{fmt(activeMetrics.totalActualReceived)}</dd>
          </dl>
          <dl className={`scard ${activeMetrics.netActualCashFlow >= 0 ? 'pos' : 'neg'}`}>
            <dt>Net Actual Cash Flow</dt>
            <dd>{activeMetrics.netActualCashFlow >= 0 ? '+' : ''}{fmt(activeMetrics.netActualCashFlow)}</dd>
          </dl>
          <dl className="scard">
            <dt>Simple ROI</dt>
            <dd>{roiDisplay(roiOutcome)}</dd>
          </dl>
          <dl className="scard">
            <dt>Verification</dt>
            <dd>{isCashFlowVerified ? '\u2713 Verified' : 'Unverified'}</dd>
          </dl>
        </div>

        {roiOutcome.status === 'UNAVAILABLE' && (
          <p className="roi-na">
            ROI unavailable: {roiOutcome.reasons.map((r) => r.replace(/_/g, ' ').toLowerCase()).join('; ')}.
          </p>
        )}

        {/* INSTALLMENT SAVINGS */}
        {installmentSavings && (
          <>
            <SectionHeading>Installment Savings</SectionHeading>
            <p style={{ fontSize: '0.62rem', color: '#64748b', marginBottom: '0.5rem' }}>
              Amount saved compared with the normal installment.
            </p>
            <div className="summary-grid">
              <dl className="scard">
                <dt>Normal Installments So Far</dt>
                <dd>{fmt(installmentSavings.totalNormalInstallments)}</dd>
              </dl>
              <dl className="scard">
                <dt>Actual Installments Paid</dt>
                <dd>{fmt(installmentSavings.totalActualPaid)}</dd>
              </dl>
              <dl className="scard pos">
                <dt>Total Installment Savings</dt>
                <dd>{fmt(installmentSavings.totalSaved)}</dd>
              </dl>
            </div>
          </>
        )}

        {/* ROUND STATEMENT */}
        <SectionHeading>Round Statement</SectionHeading>
        <p style={{ fontSize: '0.62rem', color: '#64748b', marginBottom: '0.5rem' }}>
          &ldquo;Installment Due&rdquo; is the expected amount (non_winner_payment).
          &ldquo;Actual Paid&rdquo; is sourced from effective ledger entries only.
        </p>
        {rounds.length === 0 ? (
          <p className="roi-na">No rounds recorded.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Type</th>
                <th>Payment Date</th>
                <th>Thallu</th>
                <th>Commission</th>
                <th>Dividend</th>
                <th>Installment Due</th>
                <th>Actual Paid</th>
                <th>Saved</th>
                <th>Payout</th>
                <th>Winner</th>
                <th>Calc</th>
              </tr>
            </thead>
            <tbody>
              {rounds.map((round: StatementRound) => {
                const isNormal = round.eventType === 'NORMAL'
                return (
                  <tr key={round.roundNumber}>
                    <td style={{ fontWeight: 600 }}>{round.roundNumber}</td>
                    <td><RoundBadge type={round.eventType} /></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {fmtDate(round.paymentDate)}
                      {round.auctionDate && (
                        <div style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '0.1rem' }}>
                          Auction: {fmtDate(round.auctionDate)}
                        </div>
                      )}
                    </td>
                    <td>{isNormal ? fmt(round.thallu) : '\u2014'}</td>
                    <td>{isNormal ? fmt(round.commission) : '\u2014'}</td>
                    <td>{isNormal ? fmt(round.memberThallu) : '\u2014'}</td>
                    <td>{isNormal ? fmt(round.expectedInstallment) : '\u2014'}</td>
                    <td style={{ color: round.actualPaid != null ? '#15803d' : '#94a3b8' }}>
                      {round.actualPaid != null ? fmt(round.actualPaid) : '\u2014'}
                    </td>
                    <td style={{ color: round.savedThisRound != null ? '#15803d' : '#94a3b8' }}>
                      {round.savedThisRound != null ? fmt(round.savedThisRound) : '\u2014'}
                    </td>
                    <td style={{ color: round.actualPayout != null ? '#1d4ed8' : '#94a3b8' }}>
                      {round.actualPayout != null ? fmt(round.actualPayout) : '\u2014'}
                    </td>
                    <td style={{ fontSize: '0.68rem' }}>{winnerLabel(round.winner)}</td>
                    <td>
                      {round.calculationStatus !== 'INDUSTRY_DEFAULT' && (
                        <span className="cstatus">{round.calculationStatus.replace(/_/g, ' ')}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {/* CASH FLOW LEDGER */}
        <SectionHeading>Cash Flow Ledger (Effective Entries)</SectionHeading>
        {cashFlow.filter((r) => !r.isSuperseded).length === 0 ? (
          <p className="roi-na">No effective ledger entries recorded.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Entry Type</th>
                <th>Round</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {cashFlow
                .filter((r: StatementCashFlowRow) => !r.isSuperseded)
                .map((row: StatementCashFlowRow) => (
                  <tr key={row.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(row.date)}</td>
                    <td>
                      {entryLabel(row.effectiveEntryType)}
                      {row.entryType === 'MANUAL_CORRECTION' && (
                        <span style={{ fontSize: '0.6rem', color: '#b45309', marginLeft: '0.25rem' }}>
                          (correction)
                        </span>
                      )}
                    </td>
                    <td>{row.roundNumber != null ? `Round ${row.roundNumber}` : '\u2014'}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(row.amount)}</td>
                    <td style={{ color: '#64748b', fontSize: '0.7rem' }}>{row.notes ?? ''}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}

        {/* DATA QUALITY */}
        {qualityFlags.length > 0 && (
          <>
            <SectionHeading>Data Quality &amp; Verification</SectionHeading>
            <ul className="qlist">
              {qualityFlags.map((flag: DataQualityFlag, i: number) => {
                const isErr = flag.kind === 'FLAGGED_MISMATCH' || flag.kind === 'UNVERIFIED_COMPLETED'
                return (
                  <li key={i} className={`qitem ${isErr ? 'err' : 'warn'}`}>
                    {'round' in flag && <span className="rtag">Round {flag.round}:</span>}
                    {flag.message}
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {/* FOOTER */}
        <footer className="stmt-footer">
          <span>Chit Fund Analytics &mdash; Personal Statement</span>
          <span>
            Generated {genDate}
            &nbsp;&middot;&nbsp;
            Effective ledger data only. Expected amounts are not treated as actual payments.
          </span>
        </footer>

      </div>
    </>
  )
}
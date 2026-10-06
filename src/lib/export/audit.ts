import { type PortfolioState } from '@/lib/analytics/portfolio-state'
import { type StatementRound, type StatementCashFlowRow } from '@/lib/statement/build-statement-data'

function fmt(n: number | null | undefined): string {
  if (n == null) return 'N/A'
  return `Rs. ${n.toLocaleString('en-IN')}`
}

function formatDate(d: string | null | undefined): string {
  if (!d) return 'N/A'
  return new Date(d).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function generateFinancialAudit(state: PortfolioState): string {
  const { summary, chits } = state
  let out = ''

  // 1. REPORT METADATA
  out += '==================================================\n'
  out += '1. REPORT METADATA\n'
  out += '==================================================\n'
  out += `Generated Timestamp: ${new Date().toISOString()}\n`
  out += `Number of Active Chits: ${summary.activeChits}\n`
  out += `Number of Completed Chits: ${summary.completedChits}\n`
  out += `Report Scope: Full Portfolio Snapshot\n`
  out += `Verification Status: ${summary.unverifiedChits > 0 ? `${summary.unverifiedChits} Completed Chits Unverified` : 'All Completed Chits Verified'}\n`
  out += `Data-Quality Status: ${summary.totalQualityFlags > 0 ? `${summary.totalQualityFlags} Flags Present` : 'Clean'}\n\n`

  // 2. PORTFOLIO SUMMARY
  out += '==================================================\n'
  out += '2. PORTFOLIO SUMMARY\n'
  out += '==================================================\n'
  out += `Total Face Value: ${fmt(summary.totalFaceValue)}\n`
  out += `Active Chit Count: ${summary.activeChits}\n`
  out += `Completed Chit Count: ${summary.completedChits}\n`
  out += `Actual Paid: ${fmt(summary.totalActualPaid)}\n`
  out += `Actual Received: ${fmt(summary.totalActualReceived)}\n`
  out += `Net Actual Cash Flow: ${fmt(summary.netActualCashFlow)} (NOTE: DO NOT LABEL AS PROFIT)\n`
  out += `Installment Savings: ${fmt(summary.totalInstallmentSavings)}\n`
  out += `Quality Flags: ${summary.totalQualityFlags}\n`
  out += `ROI Availability/Blocking Status: Determined per chit.\n\n`

  // 3. EACH CHIT
  out += '==================================================\n'
  out += '3. CHIT DETAILS\n'
  out += '==================================================\n'
  for (const data of chits) {
    const c = data.chit
    out += `\n--- CHIT: ${c.name} ---\n`
    out += `Group: ${c.group_label || 'N/A'}\n`
    out += `Status: ${c.status}\n`
    out += `Face Value: ${fmt(Number(c.face_value))}\n`
    out += `Members: ${c.member_count}\n`
    out += `Duration: ${c.duration_months} Months\n`
    out += `Base Installment: ${fmt(Number(c.base_installment))}\n`
    out += `Commission: ${c.commission_value} ${c.commission_type}\n`
    out += `Rounds Recorded / Total Rounds: ${data.rounds.length} / ${c.duration_months}\n`
    out += `Actual Paid: ${fmt(data.activeMetrics.totalActualPaid)}\n`
    out += `Actual Received: ${fmt(data.activeMetrics.totalActualReceived)}\n`
    out += `Net Actual Cash Flow: ${fmt(data.activeMetrics.netActualCashFlow)} (DO NOT LABEL AS PROFIT)\n`
    out += `Installment Savings: ${fmt(data.installmentSavings?.totalSaved || 0)}\n`
    out += `ROI Status: ${data.roiOutcome.status} ${data.roiOutcome.status === 'AVAILABLE' ? `(${data.roiOutcome.simpleRoiPercent.toFixed(2)}%)` : ''}\n`
    out += `Verification Status: ${data.isCashFlowVerified ? 'Verified' : 'Pending'}\n`
    out += `Data-Quality Status: ${data.qualityFlags.length > 0 ? `${data.qualityFlags.length} Flags` : 'Clean'}\n`
  }
  out += '\n'

  // 4. EVERY ROUND
  out += '==================================================\n'
  out += '4. ROUND DETAILS (PER CHIT)\n'
  out += '==================================================\n'
  for (const data of chits) {
    out += `\n--- ${data.chit.name} Rounds ---\n`
    if (data.rounds.length === 0) {
      out += 'No rounds recorded.\n'
      continue
    }
    for (const r of data.rounds) {
      out += `Round ${r.roundNumber}:\n`
      out += `  Event Type: ${r.eventType}\n`
      out += `  Auction Date: ${formatDate(r.auctionDate)}\n`
      out += `  Payment/Transaction Date: ${formatDate(r.paymentDate)}\n`
      out += `  Thallu: ${fmt(r.thallu)}\n`
      out += `  Commission: ${fmt(r.commission)}\n`
      out += `  Member Dividend/Thallu: ${fmt(r.memberThallu)}\n`
      out += `  EXPECTED INSTALLMENT (Due): ${fmt(r.expectedInstallment)}\n`
      out += `  ACTUAL PAID: ${fmt(r.actualPaid)}\n`
      out += `  ACTUAL PAYOUT: ${fmt(r.actualPayout)}\n`
      out += `  Winner Status: ${r.winner}\n`
      out += `  Calculation Status: ${r.calculationStatus}\n`
      out += `  Notes: ${r.notes || 'None'}\n`
      const rFlags = data.qualityFlags.filter(f => ('round' in f) && f.round === r.roundNumber)
      if (rFlags.length > 0) {
        out += `  Data-Quality Flags:\n`
        for (const f of rFlags) {
          out += `    - [${f.kind}] ${f.message}\n`
        }
      }
    }
  }
  out += '\n'

  // 5. CASH-FLOW LEDGER
  out += '==================================================\n'
  out += '5. CASH-FLOW LEDGER\n'
  out += '==================================================\n'
  for (const data of chits) {
    out += `\n--- ${data.chit.name} Ledger ---\n`
    if (data.cashFlow.length === 0) {
      out += 'No entries.\n'
      continue
    }
    out += `Note: Only entries where IsSuperseded=false are effective for financial calculations.\n`
    for (const row of data.cashFlow) {
      out += `Date: ${formatDate(row.date)} | EntryType: ${row.effectiveEntryType} | Round: ${row.roundNumber ?? 'N/A'} | Amount: ${fmt(row.amount)} | IsSuperseded: ${row.isSuperseded} | Notes: ${row.notes || 'None'}\n`
    }
  }
  out += '\n'

  // 6. INSTALLMENT SAVINGS
  out += '==================================================\n'
  out += '6. INSTALLMENT SAVINGS\n'
  out += '==================================================\n'
  out += 'IMPORTANT: Installment savings are NOT profit and NOT ROI. They represent the discount received on normal installments.\n\n'
  for (const data of chits) {
    out += `--- ${data.chit.name} ---\n`
    const savings = data.installmentSavings
    if (!savings) {
      out += `No savings available.\n\n`
      continue
    }
    out += `Normal/Base Installment: ${fmt(Number(data.chit.base_installment))}\n`
    out += `Cumulative Normal Installments: ${fmt(savings.totalNormalInstallments)}\n`
    out += `Cumulative Actual Paid: ${fmt(savings.totalActualPaid)}\n`
    out += `Cumulative Savings: ${fmt(savings.totalSaved)}\n`
    out += `Round-by-round:\n`
    for (const r of data.rounds) {
      if (r.savedThisRound != null) {
        out += `  Round ${r.roundNumber}: Saved ${fmt(r.savedThisRound)}\n`
      }
    }
    out += '\n'
  }

  // 7. DATA QUALITY
  out += '==================================================\n'
  out += '7. DATA QUALITY ISSUES\n'
  out += '==================================================\n'
  const allFlags = chits.flatMap(c => c.qualityFlags.map(f => ({ chitName: c.chit.name, flag: f })))
  
  const categories = {
    'Missing Auction Dates': allFlags.filter(f => f.flag.kind === 'MISSING_AUCTION_DATE'),
    'Missing Cash-Flow Entries': allFlags.filter(f => f.flag.kind === 'MISSING_CASH_FLOW'),
    'Financial Mismatches': allFlags.filter(f => f.flag.kind === 'FLAGGED_MISMATCH'),
    'Unknown Events': allFlags.filter(f => f.flag.kind === 'UNKNOWN_EVENT'),
    'Missing Winner Information': allFlags.filter(f => f.flag.kind === 'MISSING_WINNER'),
    'Verification Pending': allFlags.filter(f => f.flag.kind === 'UNVERIFIED_COMPLETED'),
    'Other': allFlags.filter(f => !['MISSING_AUCTION_DATE', 'MISSING_CASH_FLOW', 'FLAGGED_MISMATCH', 'UNKNOWN_EVENT', 'MISSING_WINNER', 'UNVERIFIED_COMPLETED'].includes(f.flag.kind))
  }

  let hasAnyQualityIssues = false
  for (const [catName, flags] of Object.entries(categories)) {
    if (flags.length > 0) {
      hasAnyQualityIssues = true
      out += `\n[${catName}]\n`
      for (const f of flags) {
        const roundText = 'round' in f.flag ? ` (Round ${f.flag.round})` : ''
        out += `- ${f.chitName}${roundText}: ${f.flag.message}\n`
      }
    }
  }
  if (!hasAnyQualityIssues) {
    out += 'No data quality issues found across the portfolio.\n'
  }
  out += '\n'

  // 8. ROI
  out += '==================================================\n'
  out += '8. ROI\n'
  out += '==================================================\n'
  for (const data of chits) {
    out += `- ${data.chit.name}: ROI is ${data.roiOutcome.status}.\n`
    if (data.roiOutcome.status === 'UNAVAILABLE') {
      out += `  Reasons blocked: ${data.roiOutcome.reasons.join(', ')}\n`
    }
  }
  out += '\n'

  // 9. UNKNOWN / UNRESOLVED
  out += '==================================================\n'
  out += '9. UNKNOWN / UNRESOLVED\n'
  out += '==================================================\n'
  const unresolvedFlags = allFlags.filter(f => 
    ['UNKNOWN_EVENT', 'MISSING_WINNER', 'MISSING_AUCTION_DATE', 'FLAGGED_MISMATCH', 'UNVERIFIED_COMPLETED'].includes(f.flag.kind)
  )
  if (unresolvedFlags.length === 0) {
    out += 'No explicit unknown/unresolved items.\n'
  } else {
    for (const f of unresolvedFlags) {
      const roundText = 'round' in f.flag ? ` (Round ${f.flag.round})` : ''
      out += `- ${f.chitName}${roundText}: [${f.flag.kind}] ${f.flag.message}\n`
    }
  }
  out += '\n'

  // 10. CLAUDE ANALYSIS CONTEXT
  out += '==================================================\n'
  out += '10. CLAUDE ANALYSIS CONTEXT\n'
  out += '==================================================\n'
  out += `Analyze this financial dataset without inventing missing values. Treat the CHIT FUND application data as the source of truth. Distinguish expected installments from actual payments. Distinguish auction dates from transaction/payment dates. Do not assume missing values. Clearly identify uncertainties and data-quality issues before making financial recommendations.\n`

  return out
}

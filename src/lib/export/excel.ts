import * as XLSX from 'xlsx'
import type { Chit, AuctionEvent, LedgerEntry } from '@/types/database'
import { computeActiveMetrics, computeCompletedRoi, type EffectiveLedgerEntry } from '@/lib/financial/roi'
import { computeInstallmentSavings } from '@/lib/financial/savings'

/**
 * Filters out superseded correction entries from the ledger.
 */
export function getEffectiveEntries(entries: LedgerEntry[]): EffectiveLedgerEntry[] {
  const correctedIds = new Set<string>()
  entries.forEach(row => {
    if (row.entry_type === 'MANUAL_CORRECTION' && row.corrects_entry_id) {
      correctedIds.add(row.corrects_entry_id)
    }
  })
  
  return entries
    .filter(row => !correctedIds.has(row.id))
    .map(row => {
      let effectiveType = row.entry_type
      if (row.entry_type === 'MANUAL_CORRECTION' && row.corrects_entry_id) {
        const original = entries.find(r => r.id === row.corrects_entry_id)
        if (original) {
          effectiveType = original.entry_type
        }
      }
      return {
        id: row.id,
        entry_type: row.entry_type,
        effective_entry_type: effectiveType,
        amount: Number(row.amount),
        transaction_date: row.transaction_date,
      }
    })
}

export function generateExportWorkbook(
  chits: Chit[],
  auctionEvents: AuctionEvent[],
  ledgerEntries: LedgerEntry[]
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()

  // Pre-calculate savings per chit so we can use them in both summary and history sheets
  const chitSavingsMap = new Map()
  for (const chit of chits) {
    const chitEvents = auctionEvents.filter(e => e.chit_id === chit.id)
    const chitLedger = ledgerEntries.filter(e => e.chit_id === chit.id)
    const effectiveEntries = getEffectiveEntries(chitLedger)

    const { metrics, roundSavingsByNumber } = computeInstallmentSavings(
      Number(chit.base_installment),
      chitEvents.map(event => {
        const roundEntries = effectiveEntries.filter(e =>
          chitLedger.find(l => l.id === e.id)?.auction_event_id === event.id
        )
        const actualInstallment = roundEntries
          .filter(e => e.effective_entry_type === 'INSTALLMENT_PAID' || e.effective_entry_type === 'LATE_FEE')
          .reduce((sum, e) => sum + e.amount, 0)
        return { roundNumber: event.round_number, actualPaid: actualInstallment > 0 ? actualInstallment : null }
      })
    )
    chitSavingsMap.set(chit.id, { metrics, roundSavingsByNumber })
  }

  // ─────────────────────────────────────────────────────────────
  // SHEET 1: Chit Summary
  // ─────────────────────────────────────────────────────────────
  const summaryData = chits.map(chit => {
    const chitEvents = auctionEvents.filter(e => e.chit_id === chit.id)
    const chitLedger = ledgerEntries.filter(e => e.chit_id === chit.id)
    const effectiveEntries = getEffectiveEntries(chitLedger)
    const hasFlaggedMismatch = chitEvents.some(e => e.calculation_status === 'FLAGGED_MISMATCH')
    
    // Always calculate basic metrics
    const metrics = computeActiveMetrics(effectiveEntries)

    let roiDisplay = 'N/A'
    if (chit.status === 'COMPLETED') {
      const roi = computeCompletedRoi({
        chit: { status: chit.status, duration_months: chit.duration_months },
        recordedRoundCount: chitEvents.length,
        effectiveEntries,
        hasFlaggedMismatch,
        isCashFlowVerified: chit.verified_at !== null
      })
      if (roi.status === 'AVAILABLE') {
        roiDisplay = `${roi.simpleRoiPercent.toFixed(2)}%`
      } else {
        roiDisplay = 'Unavailable'
      }
    }

    return {
      'Chit Name': chit.name,
      'Group': chit.group_label || '',
      'Face Value': chit.face_value,
      'Members': chit.member_count,
      'Duration': chit.duration_months,
      'Base Installment': chit.base_installment,
      'Status': chit.status,
      'Recorded Rounds': chitEvents.length,
      'Total Rounds': chit.duration_months,
      'Verification Status': chit.verified_at ? 'Verified' : 'Unverified',
      'Total Actual Paid': metrics.totalActualPaid,
      'Total Actual Received': metrics.totalActualReceived,
      'Net Actual Cash Flow': metrics.netActualCashFlow,
      'Total Normal Installments': chitSavingsMap.get(chit.id)?.metrics?.totalNormalInstallments || '',
      'Total Installment Savings': chitSavingsMap.get(chit.id)?.metrics?.totalSaved || '',
      'ROI': roiDisplay
    }
  })
  const wsSummary = XLSX.utils.json_to_sheet(summaryData)
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Chit Summary')

  // ─────────────────────────────────────────────────────────────
  // SHEET 2: Round / Auction History
  // ─────────────────────────────────────────────────────────────
  const historyData = auctionEvents
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) // sort chronologically or by round? 
    // Actually better to sort by chit name then round_number
    .sort((a, b) => {
      const chitA = chits.find(c => c.id === a.chit_id)
      const chitB = chits.find(c => c.id === b.chit_id)
      if (chitA?.name && chitB?.name && chitA.name !== chitB.name) {
        return chitA.name.localeCompare(chitB.name)
      }
      return a.round_number - b.round_number
    })
    .map(event => {
      const chit = chits.find(c => c.id === event.chit_id)
      const chitLedger = ledgerEntries.filter(e => e.chit_id === event.chit_id)
      const effectiveEntries = getEffectiveEntries(chitLedger)
      
      // Determine winner status string
      let winnerStatus = 'Unknown'
      if (event.event_type === 'SPECIAL_NO_AUCTION') {
        winnerStatus = 'Not Applicable'
      } else if (event.won_by_us === true) {
        winnerStatus = 'We Won'
      } else if (event.won_by_us === false) {
        winnerStatus = 'Someone Else Won'
      }

      // Actual recorded amounts for this round
      // The user records installments and payouts which MAY optionally link to auction_event_id.
      // But we can just sum up effective entries tied to this event.
      const roundEntries = effectiveEntries.filter(e => 
        chitLedger.find(l => l.id === e.id)?.auction_event_id === event.id
      )
      
      const actualInstallment = roundEntries
        .filter(e => e.effective_entry_type === 'INSTALLMENT_PAID' || e.effective_entry_type === 'LATE_FEE')
        .reduce((sum, e) => sum + e.amount, 0)
        
      const actualPayout = roundEntries
        .filter(e => e.effective_entry_type === 'AUCTION_PAYOUT_RECEIVED' || e.effective_entry_type === 'MATURITY_SETTLEMENT')
        .reduce((sum, e) => sum + e.amount, 0)

      return {
        'Chit': chit?.name || 'Unknown',
        'Group': chit?.group_label || '',
        'Round Number': event.round_number,
        'Event Type': event.event_type,
        'Auction Date': event.auction_date || '',
        'Thallu': event.thallu ?? '',
        'Commission': event.commission ?? '',
        'Net Thallu': event.net_thallu ?? '',
        'Dividend / Member Thallu': event.member_thallu ?? '',
        'Expected Installment': event.non_winner_payment ?? '',
        'Winner Status': winnerStatus,
        'Actual Installment Recorded': actualInstallment > 0 ? actualInstallment : '',
        'Saved This Round': chitSavingsMap.get(chit?.id)?.roundSavingsByNumber?.[event.round_number]?.savedThisRound ?? '',
        'Cumulative Normal': chitSavingsMap.get(chit?.id)?.roundSavingsByNumber?.[event.round_number]?.cumulativeNormal ?? '',
        'Cumulative Paid': chitSavingsMap.get(chit?.id)?.roundSavingsByNumber?.[event.round_number]?.cumulativePaid ?? '',
        'Cumulative Saved': chitSavingsMap.get(chit?.id)?.roundSavingsByNumber?.[event.round_number]?.cumulativeSaved ?? '',
        'Actual Payout Recorded': actualPayout > 0 ? actualPayout : '',
        'Calculation Status': event.calculation_status,
        'Source / Notes': event.notes || ''
      }
    })
  const wsHistory = XLSX.utils.json_to_sheet(historyData)
  XLSX.utils.book_append_sheet(wb, wsHistory, 'Round History')

  // ─────────────────────────────────────────────────────────────
  // SHEET 3: Cash Flow Ledger
  // ─────────────────────────────────────────────────────────────
  const correctedIds = new Set<string>()
  ledgerEntries.forEach(row => {
    if (row.entry_type === 'MANUAL_CORRECTION' && row.corrects_entry_id) {
      correctedIds.add(row.corrects_entry_id)
    }
  })

  const ledgerData = ledgerEntries
    .sort((a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime())
    .map(entry => {
      const chit = chits.find(c => c.id === entry.chit_id)
      const event = auctionEvents.find(e => e.id === entry.auction_event_id)
      
      const isSuperseded = correctedIds.has(entry.id)
      
      // Effective type mapping
      let effectiveType = entry.entry_type
      if (entry.entry_type === 'MANUAL_CORRECTION' && entry.corrects_entry_id) {
        const original = ledgerEntries.find(r => r.id === entry.corrects_entry_id)
        if (original) {
          effectiveType = original.entry_type
        }
      }

      // Direction
      let direction = ''
      if (effectiveType === 'INSTALLMENT_PAID' || effectiveType === 'LATE_FEE') {
        direction = 'OUTFLOW'
      } else if (effectiveType === 'AUCTION_PAYOUT_RECEIVED' || effectiveType === 'MATURITY_SETTLEMENT') {
        direction = 'INFLOW'
      } else if (effectiveType === 'ADJUSTMENT') {
        direction = Number(entry.amount) > 0 ? 'INFLOW' : 'OUTFLOW'
      }

      return {
        'Date': entry.transaction_date,
        'Chit': chit?.name || 'Unknown',
        'Group': chit?.group_label || '',
        'Round': event?.round_number ?? '',
        'Entry Type': entry.entry_type,
        'Amount': Math.abs(Number(entry.amount)),
        'Direction': direction,
        'Effective/Superseded Status': isSuperseded ? 'SUPERSEDED' : 'EFFECTIVE',
        'Correction Reference': entry.corrects_entry_id || '',
        'Notes': entry.notes || ''
      }
    })
  const wsLedger = XLSX.utils.json_to_sheet(ledgerData)
  XLSX.utils.book_append_sheet(wb, wsLedger, 'Cash Flow Ledger')

  // ─────────────────────────────────────────────────────────────
  // SHEET 4: Data Quality
  // ─────────────────────────────────────────────────────────────
  const qualityData: any[] = []

  // Check unverified completed chits
  chits.forEach(chit => {
    if (chit.status === 'COMPLETED' && !chit.verified_at) {
      qualityData.push({
        'Chit': chit.name,
        'Issue Type': 'UNVERIFIED_COMPLETED_CHIT',
        'Description': 'Chit is marked COMPLETED but cash flows have not been verified by the user.',
        'Round': ''
      })
    }
  })

  // Check auction events
  auctionEvents.forEach(event => {
    const chit = chits.find(c => c.id === event.chit_id)
    const chitName = chit?.name || 'Unknown'
    
    if (event.event_type === 'UNKNOWN') {
      qualityData.push({
        'Chit': chitName,
        'Issue Type': 'UNKNOWN_EVENT',
        'Description': 'Auction event type could not be determined.',
        'Round': event.round_number
      })
    }
    if (event.calculation_status === 'FLAGGED_MISMATCH') {
      qualityData.push({
        'Chit': chitName,
        'Issue Type': 'FLAGGED_MISMATCH',
        'Description': 'Calculated financial fields mismatch parsed source text.',
        'Round': event.round_number
      })
    }
    if (!event.auction_date) {
      qualityData.push({
        'Chit': chitName,
        'Issue Type': 'MISSING_AUCTION_DATE',
        'Description': 'The auction date is missing.',
        'Round': event.round_number
      })
    }
    if (event.event_type === 'NORMAL' && event.won_by_us === null) {
      qualityData.push({
        'Chit': chitName,
        'Issue Type': 'MISSING_WINNER_STATUS',
        'Description': 'Winner status is unknown for a NORMAL round.',
        'Round': event.round_number
      })
    }
    
    // Check missing actuals if it is a past round
    const roundEntries = ledgerEntries.filter(e => e.auction_event_id === event.id && !correctedIds.has(e.id))
    if (roundEntries.length === 0) {
      qualityData.push({
        'Chit': chitName,
        'Issue Type': 'MISSING_CASH_FLOW',
        'Description': 'No effective ledger entries recorded for this round.',
        'Round': event.round_number
      })
    }
  })

  const wsQuality = XLSX.utils.json_to_sheet(qualityData)
  XLSX.utils.book_append_sheet(wb, wsQuality, 'Data Quality')

  // ─────────────────────────────────────────────────────────────
  // SHEET 5: Report Info
  // ─────────────────────────────────────────────────────────────
  const infoData = [
    { 'Information': 'Generated Date', 'Value': new Date().toISOString().split('T')[0] },
    { 'Information': 'Disclaimer 1', 'Value': 'Actual financial data only.' },
    { 'Information': 'Disclaimer 2', 'Value': 'Expected amounts are not treated as actual payments.' },
    { 'Information': 'ROI Notice', 'Value': 'ROI is unavailable when the chit is incomplete, unverified, or flagged for mismatch.' }
  ]
  const wsInfo = XLSX.utils.json_to_sheet(infoData)
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Report Info')

  return wb
}

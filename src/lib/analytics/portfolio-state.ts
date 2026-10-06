import type { Chit, AuctionEvent } from '@/types/database'
import { buildStatementData, type StatementData, type StatementLedgerRow } from '@/lib/statement/build-statement-data'

export interface PortfolioState {
  chits: StatementData[]
  summary: {
    totalChits: number
    activeChits: number
    completedChits: number
    totalFaceValue: number
    totalActualPaid: number
    totalActualReceived: number
    netActualCashFlow: number
    totalInstallmentSavings: number
    unverifiedChits: number
    totalQualityFlags: number
  }
}

export function getCompletePortfolioState(
  chits: Chit[],
  auctionEvents: AuctionEvent[],
  ledgerEntries: any[]
): PortfolioState {
  const statementDataList: StatementData[] = chits.map(chit => {
    const chitEvents = auctionEvents.filter(e => e.chit_id === chit.id)
    const chitLedger = ledgerEntries.filter(e => e.chit_id === chit.id)
    
    // Resolve ledger rows
    const correctedIds = new Set<string>()
    chitLedger.forEach(r => {
      if (r.entry_type === 'MANUAL_CORRECTION' && r.corrects_entry_id) {
        correctedIds.add(r.corrects_entry_id)
      }
    })

    const resolvedLedger: StatementLedgerRow[] = chitLedger.map(r => {
      let effectiveType = r.entry_type
      if (r.entry_type === 'MANUAL_CORRECTION' && r.corrects_entry_id) {
        const original = chitLedger.find(x => x.id === r.corrects_entry_id)
        if (original) effectiveType = original.entry_type
      }
      return {
        id: r.id,
        transaction_date: r.transaction_date,
        entry_type: r.entry_type,
        amount: Number(r.amount),
        notes: r.notes,
        created_at: r.created_at,
        round_number: r.round_number,
        auction_event_id: r.auction_event_id,
        corrects_entry_id: r.corrects_entry_id,
        is_superseded: correctedIds.has(r.id),
        effective_entry_type: effectiveType,
      }
    })

    return buildStatementData({
      chit,
      companyName: null,
      auctionEvents: chitEvents,
      ledgerRows: resolvedLedger,
    })
  })

  // Aggregate summary
  let totalFaceValue = 0
  let totalActualPaid = 0
  let totalActualReceived = 0
  let netActualCashFlow = 0
  let totalInstallmentSavings = 0
  let unverifiedChits = 0
  let totalQualityFlags = 0

  statementDataList.forEach(data => {
    totalFaceValue += Number(data.chit.face_value || 0)
    totalActualPaid += data.activeMetrics.totalActualPaid
    totalActualReceived += data.activeMetrics.totalActualReceived
    netActualCashFlow += data.activeMetrics.netActualCashFlow

    if (data.chit.status === 'ACTIVE' && data.installmentSavings) {
      totalInstallmentSavings += data.installmentSavings.totalSaved
    }

    if (data.chit.status === 'COMPLETED' && !data.isCashFlowVerified) {
      unverifiedChits++
    }

    totalQualityFlags += data.qualityFlags.length
  })

  return {
    chits: statementDataList,
    summary: {
      totalChits: chits.length,
      activeChits: chits.filter(c => c.status === 'ACTIVE').length,
      completedChits: chits.filter(c => c.status === 'COMPLETED').length,
      totalFaceValue,
      totalActualPaid,
      totalActualReceived,
      netActualCashFlow,
      totalInstallmentSavings,
      unverifiedChits,
      totalQualityFlags,
    }
  }
}

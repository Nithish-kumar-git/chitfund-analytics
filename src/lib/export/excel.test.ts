import { describe, it, expect } from 'vitest'
import { generateExportWorkbook, getEffectiveEntries } from './excel'
import type { Chit, AuctionEvent, LedgerEntry } from '@/types/database'
import * as XLSX from 'xlsx'

describe('Excel Export Builder', () => {
  const baseChit: Chit = {
    id: 'chit-1',
    profile_id: 'prof-1',
    name: 'Test Chit',
    face_value: 300000,
    duration_months: 30,
    member_count: 30,
    base_installment: 10000,
    group_label: null,
    company_id: null,
    start_date: null,
    status: 'ACTIVE',
    commission_type: 'PERCENTAGE',
    commission_value: 5,
    commission_notes: null,
    notes: null,
    verified_at: null,
    verified_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01'
  }

  const baseEvent: AuctionEvent = {
    id: 'evt-1',
    profile_id: 'prof-1',
    chit_id: 'chit-1',
    round_number: 1,
    event_type: 'NORMAL',
    thallu: 10000,
    commission: 15000,
    net_thallu: -5000,
    member_thallu: 0,
    non_winner_payment: 10000,
    won_by_us: false,
    our_payout_amount: null,
    auction_date: '2026-01-01',
    calculation_status: 'VERIFIED_FORMULA',
    source_message_id: null,
    notes: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01'
  }

  const baseLedger: LedgerEntry = {
    id: 'ld-1',
    profile_id: 'prof-1',
    chit_id: 'chit-1',
    auction_event_id: 'evt-1',
    entry_type: 'INSTALLMENT_PAID',
    amount: 10000,
    transaction_date: '2026-01-02',
    corrects_entry_id: null,
    notes: null,
    idempotency_key: null,
    created_at: '2026-01-02',
  }

  it('empty inputs do not crash', () => {
    const wb = generateExportWorkbook([], [], [])
    expect(wb.SheetNames.length).toBe(5)
  })

  it('active chit ROI is unavailable', () => {
    const wb = generateExportWorkbook([baseChit], [], [])
    const sheet = wb.Sheets['Chit Summary']
    const json = XLSX.utils.sheet_to_json<any>(sheet)
    expect(json[0]['Status']).toBe('ACTIVE')
    expect(json[0]['ROI']).toBe('N/A')
  })

  it('completed eligible ROI is exported', () => {
    const completedChit = { ...baseChit, status: 'COMPLETED' as const, verified_at: '2026-02-01', duration_months: 1 }
    const wb = generateExportWorkbook([completedChit], [baseEvent], [baseLedger, { ...baseLedger, id: 'ld-2', entry_type: 'AUCTION_PAYOUT_RECEIVED', amount: 300000 }])
    const sheet = wb.Sheets['Chit Summary']
    const json = XLSX.utils.sheet_to_json<any>(sheet)
    expect(json[0]['Status']).toBe('COMPLETED')
    // 2900% ROI since paid 10000 and received 300000
    expect(json[0]['ROI']).toMatch(/2900\.00%/)
  })

  it('superseded corrections are not double counted', () => {
    const correctionLedger = { ...baseLedger, id: 'ld-corr', entry_type: 'MANUAL_CORRECTION' as const, amount: 5000, corrects_entry_id: 'ld-1' }
    const wb = generateExportWorkbook([baseChit], [baseEvent], [baseLedger, correctionLedger])
    
    // Check summary actual paid should be 5000 not 15000
    const summarySheet = wb.Sheets['Chit Summary']
    const summaryJson = XLSX.utils.sheet_to_json<any>(summarySheet)
    expect(summaryJson[0]['Total Actual Paid']).toBe(5000)

    // Check ledger sheet marks original as superseded
    const ledgerSheet = wb.Sheets['Cash Flow Ledger']
    const ledgerJson = XLSX.utils.sheet_to_json<any>(ledgerSheet)
    const orig = ledgerJson.find((r: any) => r['Amount'] === 10000)
    const corr = ledgerJson.find((r: any) => r['Amount'] === 5000)
    expect(orig['Effective/Superseded Status']).toBe('SUPERSEDED')
    expect(corr['Effective/Superseded Status']).toBe('EFFECTIVE')
  })

  it('SPECIAL_NO_AUCTION winner handling and expected/actual distinction', () => {
    const specialEvent = { ...baseEvent, event_type: 'SPECIAL_NO_AUCTION' as const, non_winner_payment: 12000, won_by_us: null }
    // Add ledger entry for 11000 actual
    const specialLedger = { ...baseLedger, auction_event_id: 'evt-1', amount: 11000 }
    
    const wb = generateExportWorkbook([baseChit], [specialEvent], [specialLedger])
    const historySheet = wb.Sheets['Round History']
    const historyJson = XLSX.utils.sheet_to_json<any>(historySheet)

    expect(historyJson[0]['Event Type']).toBe('SPECIAL_NO_AUCTION')
    expect(historyJson[0]['Winner Status']).toBe('Not Applicable')
    expect(historyJson[0]['Expected Installment']).toBe(12000)
    expect(historyJson[0]['Actual Installment Recorded']).toBe(11000)
  })

  it('UNKNOWN events remain UNKNOWN and appear in Data Quality', () => {
    const unknownEvent = { ...baseEvent, event_type: 'UNKNOWN' as const, won_by_us: null, calculation_status: 'INDUSTRY_DEFAULT' as const }
    const wb = generateExportWorkbook([baseChit], [unknownEvent], [])
    
    const historySheet = wb.Sheets['Round History']
    const historyJson = XLSX.utils.sheet_to_json<any>(historySheet)
    expect(historyJson[0]['Event Type']).toBe('UNKNOWN')

    const dqSheet = wb.Sheets['Data Quality']
    const dqJson = XLSX.utils.sheet_to_json<any>(dqSheet)
    expect(dqJson.some((r: any) => r['Issue Type'] === 'UNKNOWN_EVENT')).toBe(true)
  })

  it('FLAGGED_MISMATCH appears in Data Quality', () => {
    const mismatchEvent = { ...baseEvent, calculation_status: 'FLAGGED_MISMATCH' as const }
    const wb = generateExportWorkbook([baseChit], [mismatchEvent], [baseLedger])
    
    const dqSheet = wb.Sheets['Data Quality']
    const dqJson = XLSX.utils.sheet_to_json<any>(dqSheet)
    expect(dqJson.some((r: any) => r['Issue Type'] === 'FLAGGED_MISMATCH')).toBe(true)
  })
})

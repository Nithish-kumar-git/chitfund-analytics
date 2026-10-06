import { describe, it, expect } from 'vitest'
import { getCompletePortfolioState } from './portfolio-state'
import type { Chit, AuctionEvent } from '@/types/database'

describe('Portfolio State Builder', () => {
  it('aggregates portfolio correctly', () => {
    const chits: Chit[] = [
      {
        id: 'c1',
        name: '3L C Group',
        status: 'ACTIVE',
        face_value: 300000,
        base_installment: 15000,
        duration_months: 20,
        member_count: 20,
        created_at: '',
        company_id: null,
        group_label: null,
        start_date: null,
        commission_type: 'PERCENTAGE',
        commission_value: 5,
        commission_notes: null,
        notes: null,
        verified_at: null,
        verified_by: null,
        profile_id: 'u1'
      } as Chit,
      {
        id: 'c2',
        name: 'Completed Chit',
        status: 'COMPLETED',
        face_value: 100000,
        base_installment: 10000,
        duration_months: 10,
        member_count: 10,
        created_at: '',
        company_id: null,
        group_label: null,
        start_date: null,
        commission_type: 'PERCENTAGE',
        commission_value: 5,
        commission_notes: null,
        notes: null,
        verified_at: null,
        verified_by: null,
        profile_id: 'u1'
      } as Chit
    ]

    const events: AuctionEvent[] = [
      {
        id: 'e1',
        chit_id: 'c1',
        round_number: 1,
        event_type: 'NORMAL',
        auction_date: '2024-01-01',
        thallu: null,
        commission: null,
        member_thallu: null,
        non_winner_payment: 15000,
        won_by_us: false,
        calculation_status: 'FLAGGED_MISMATCH',
        notes: null,
        created_at: '',
      } as AuctionEvent
    ]

    const ledger = [
      {
        id: 'l1',
        chit_id: 'c1',
        auction_event_id: 'e1',
        transaction_date: '2024-01-02',
        entry_type: 'INSTALLMENT_PAID',
        amount: 14000,
        notes: null,
        created_at: '',
        round_number: 1,
        corrects_entry_id: null,
      }
    ]

    const state = getCompletePortfolioState(chits, events, ledger)

    expect(state.summary.totalChits).toBe(2)
    expect(state.summary.activeChits).toBe(1)
    expect(state.summary.completedChits).toBe(1)
    expect(state.summary.totalFaceValue).toBe(400000)
    expect(state.summary.totalActualPaid).toBe(14000)
    expect(state.summary.totalActualReceived).toBe(0)
    expect(state.summary.netActualCashFlow).toBe(-14000)
    
    // 3L C Group: R1 base 15000, paid 14000 -> saved 1000
    expect(state.summary.totalInstallmentSavings).toBe(1000)
    expect(state.summary.unverifiedChits).toBe(1) // c2 is COMPLETED without verified_at
    
    // Quality flags: c1 has FLAGGED_MISMATCH and MISSING_WINNER (won_by_us is false, but wait, won_by_us false is SOMEONE_ELSE_WON, not missing. Wait, if it's missing it would be null).
    expect(state.summary.totalQualityFlags).toBeGreaterThan(0)
  })
})

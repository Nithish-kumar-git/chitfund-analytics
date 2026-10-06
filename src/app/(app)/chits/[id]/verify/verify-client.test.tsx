/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { VerifyClient } from './verify-client'
import '@testing-library/jest-dom/vitest'

// Mock server actions
vi.mock('../verify-actions', () => ({
  confirmFormula: vi.fn().mockResolvedValue({ success: true }),
  confirmSource: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('../ledger-actions', () => ({
  correctLedgerEntry: vi.fn().mockResolvedValue({ success: true }),
}))

import { confirmFormula, confirmSource } from '../verify-actions'
import { correctLedgerEntry } from '../ledger-actions'

const MOCK_CHIT = {
  id: 'chit-1',
  name: 'Test Chit',
  face_value: 100000,
  base_installment: 5000,
  member_count: 20
}

const NORMAL_EVENT = {
  id: 'event-1',
  round_number: 1,
  event_type: 'NORMAL',
  calculation_status: 'INDUSTRY_DEFAULT',
  auction_date: '2026-01-01',
  thallu: 10000,
  commission: 5000,
  won_by_us: false,
  actual_payment: 4750,
  payment_date: '2026-01-02',
  needs_verification: true,
  calculated_data: {
    expected_payment: 4750,
    member_thallu: 250,
    net_thallu: 5000
  },
  ledger_entries: [
    { id: 'ledger-1', entry_type: 'INSTALLMENT_PAID', amount: 4750 }
  ]
}

const MISMATCH_EVENT = {
  id: 'event-2',
  round_number: 2,
  event_type: 'NORMAL',
  calculation_status: 'FLAGGED_MISMATCH',
  auction_date: '2026-02-01',
  thallu: 12000,
  commission: 5000,
  won_by_us: false,
  actual_payment: 5000, // Expected: 5000 - ((12000-5000)/20) = 5000 - 350 = 4650
  payment_date: '2026-02-02',
  needs_verification: true,
  calculated_data: {
    expected_payment: 4650,
    member_thallu: 350,
    net_thallu: 7000
  },
  ledger_entries: [
    { id: 'ledger-2', entry_type: 'INSTALLMENT_PAID', amount: 5000 }
  ]
}

const MISSING_DATE_EVENT = {
  id: 'event-3',
  round_number: 3,
  event_type: 'NORMAL',
  calculation_status: 'INDUSTRY_DEFAULT',
  auction_date: null,
  thallu: 10000,
  commission: 5000,
  won_by_us: false,
  actual_payment: 4750,
  payment_date: '2026-03-02',
  needs_verification: true,
  calculated_data: {
    expected_payment: 4750,
    member_thallu: 250,
    net_thallu: 5000
  },
  ledger_entries: [
    { id: 'ledger-3', entry_type: 'INSTALLMENT_PAID', amount: 4750 }
  ]
}

const SPECIAL_EVENT = {
  id: 'event-4',
  round_number: 4,
  event_type: 'SPECIAL_NO_AUCTION',
  calculation_status: 'INDUSTRY_DEFAULT',
  auction_date: null,
  thallu: null,
  commission: null,
  won_by_us: null,
  actual_payment: 5000,
  payment_date: '2026-04-02',
  needs_verification: false, // Does not need verification
  calculated_data: null,
  ledger_entries: [
    { id: 'ledger-4', entry_type: 'INSTALLMENT_PAID', amount: 5000 }
  ]
}

describe('VerifyClient Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders progress correctly', () => {
    render(<VerifyClient chit={MOCK_CHIT} events={[NORMAL_EVENT, MISMATCH_EVENT]} />)
    expect(screen.getByText('Verification Progress')).toBeInTheDocument()
    expect(screen.getByText('0 / 2 applicable NORMAL rounds explicitly verified')).toBeInTheDocument()
  })

  it('displays FLAGGED_MISMATCH clearly with rules', () => {
    render(<VerifyClient chit={MOCK_CHIT} events={[MISMATCH_EVENT]} />)
    expect(screen.getByText('FLAGGED MISMATCH')).toBeInTheDocument()
    expect(screen.getByText('Formula Mismatch Detected')).toBeInTheDocument()
    expect(screen.getByText(/Based on standard formula: Base Installment \(5000\)/)).toBeInTheDocument()
    expect(screen.getByText('Expected: 4650.00')).toBeInTheDocument()
    expect(screen.getByText('vs')).toBeInTheDocument()
    expect(screen.getByText('Actual: 5000')).toBeInTheDocument()
    expect(screen.getByText('Difference: 350.00')).toBeInTheDocument()
  })

  it('missing auction date is not replaced by payment date', () => {
    render(<VerifyClient chit={MOCK_CHIT} events={[MISSING_DATE_EVENT]} />)
    expect(screen.getByText('Auction Date: Missing')).toBeInTheDocument()
    expect(screen.getByText(/Payment: 2026-03-02/)).toBeInTheDocument()
  })

  it('SPECIAL_NO_AUCTION is not treated as mismatch', () => {
    render(<VerifyClient chit={MOCK_CHIT} events={[SPECIAL_EVENT]} />)
    expect(screen.getByText('No Auction')).toBeInTheDocument()
    expect(screen.getByText('No auction formula required. This round does not block financial verification.')).toBeInTheDocument()
    expect(screen.queryByText('Confirm Formula')).not.toBeInTheDocument()
  })

  it('Confirm Formula opens dialog and calls server action', async () => {
    render(<VerifyClient chit={MOCK_CHIT} events={[NORMAL_EVENT]} />)
    
    // Open Dialog
    fireEvent.click(screen.getByText('Confirm Formula'))
    expect(screen.getByText('The formula/result has been reviewed and explicitly accepted.')).toBeInTheDocument()
    
    // Confirm
    fireEvent.click(screen.getByText('Yes, Confirm Formula'))
    await waitFor(() => {
      expect(confirmFormula).toHaveBeenCalledWith({
        chit_id: 'chit-1',
        auction_event_id: 'event-1'
      })
    })
  })

  it('Confirm Source opens dialog and calls server action', async () => {
    render(<VerifyClient chit={MOCK_CHIT} events={[MISMATCH_EVENT]} />)
    
    // Open Dialog
    fireEvent.click(screen.getByText('Confirm Source'))
    expect(screen.getByText(/Confirming source means you accept the recorded source value/)).toBeInTheDocument()
    
    // Confirm
    fireEvent.click(screen.getByText('Yes, Confirm Source'))
    await waitFor(() => {
      expect(confirmSource).toHaveBeenCalledWith({
        chit_id: 'chit-1',
        auction_event_id: 'event-2'
      })
    })
  })

  it('Manual Override opens dialog and calls correctLedgerEntry', async () => {
    render(<VerifyClient chit={MOCK_CHIT} events={[MISMATCH_EVENT]} />)
    
    // Open Dialog
    fireEvent.click(screen.getByText('Manual Override'))
    expect(screen.getByText('This creates a new correction entry while preserving the original financial record.')).toBeInTheDocument()
    
    // Fill input
    const amountInput = screen.getByPlaceholderText('e.g. 15000')
    fireEvent.change(amountInput, { target: { value: '4650' } })

    const noteInput = screen.getByPlaceholderText('Reason for correction')
    fireEvent.change(noteInput, { target: { value: 'Typo' } })
    
    // Confirm
    fireEvent.click(screen.getByText('Apply Correction'))
    await waitFor(() => {
      expect(correctLedgerEntry).toHaveBeenCalledWith({
        chit_id: 'chit-1',
        original_entry_id: 'ledger-2',
        new_amount: 4650,
        notes: 'Typo'
      })
    })
  })

  it('Leave Unresolved merely closes the dialogs or takes no action', () => {
    render(<VerifyClient chit={MOCK_CHIT} events={[NORMAL_EVENT]} />)
    const btn = screen.getByText('Leave Unresolved')
    fireEvent.click(btn)
    expect(confirmFormula).not.toHaveBeenCalled()
    expect(confirmSource).not.toHaveBeenCalled()
  })

  it('Filters work correctly', () => {
    render(<VerifyClient chit={MOCK_CHIT} events={[NORMAL_EVENT, MISMATCH_EVENT, SPECIAL_EVENT]} />)
    
    expect(screen.getAllByText(/Round \d/).length).toBe(3)
    
    // Mismatch Filter
    fireEvent.click(screen.getByRole('button', { name: /Mismatch/ }))
    expect(screen.getAllByText(/Round \d/).length).toBe(1)
    expect(screen.getByText('Round 2')).toBeInTheDocument()

    // Special Filter
    fireEvent.click(screen.getByRole('button', { name: /Special/ }))
    expect(screen.getAllByText(/Round \d/).length).toBe(1)
    expect(screen.getByText('Round 4')).toBeInTheDocument()

    // Needs Verification Filter
    fireEvent.click(screen.getByRole('button', { name: /Needs Verification/ }))
    expect(screen.getAllByText(/Round \d/).length).toBe(2)
  })

  it('Displays error message when server action fails', async () => {
    vi.mocked(confirmFormula).mockResolvedValueOnce({ success: false, error: 'Database error' })
    render(<VerifyClient chit={MOCK_CHIT} events={[NORMAL_EVENT]} />)
    
    fireEvent.click(screen.getByText('Confirm Formula'))
    fireEvent.click(screen.getByText('Yes, Confirm Formula'))
    
    await waitFor(() => {
      expect(screen.getByText('Database error')).toBeInTheDocument()
    })
  })
})

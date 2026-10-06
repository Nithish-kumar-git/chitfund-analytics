import { describe, it, expect } from 'vitest'
import { computeInstallmentSavings } from './savings'

describe('computeInstallmentSavings', () => {
  it('handles standard rounds with savings', () => {
    const baseInstallment = 12000
    const rounds = [
      { roundNumber: 1, actualPaid: 11500 },
      { roundNumber: 2, actualPaid: 11000 },
    ]

    const { metrics, roundSavingsByNumber } = computeInstallmentSavings(baseInstallment, rounds)

    expect(metrics).toBeDefined()
    expect(metrics?.totalNormalInstallments).toBe(24000)
    expect(metrics?.totalActualPaid).toBe(22500)
    expect(metrics?.totalSaved).toBe(1500)

    expect(roundSavingsByNumber[1].savedThisRound).toBe(500)
    expect(roundSavingsByNumber[1].cumulativeSaved).toBe(500)

    expect(roundSavingsByNumber[2].savedThisRound).toBe(1000)
    expect(roundSavingsByNumber[2].cumulativeSaved).toBe(1500)
  })

  it('handles the 3L C Group real data case', () => {
    const baseInstallment = 15000
    const actualPayments = [
      11380, 15000, 12450, 12580, 12600, 12880,
      13050, 13200, 13350, 13500, 13650, 13800, 13950
    ]
    const rounds = actualPayments.map((payment, index) => ({
      roundNumber: index + 1,
      actualPaid: payment
    }))

    const { metrics, roundSavingsByNumber } = computeInstallmentSavings(baseInstallment, rounds)

    expect(metrics?.totalNormalInstallments).toBe(195000) // 13 * 15000
    expect(metrics?.totalActualPaid).toBe(171390)
    expect(metrics?.totalSaved).toBe(23610)

    // Verify each round's savings
    const expectedSavings = [
      3620, 0, 2550, 2420, 2400, 2120,
      1950, 1800, 1650, 1500, 1350, 1200, 1050
    ]

    let cumulativeSaved = 0
    expectedSavings.forEach((expected, index) => {
      const roundNum = index + 1
      cumulativeSaved += expected
      expect(roundSavingsByNumber[roundNum].savedThisRound).toBe(expected)
      expect(roundSavingsByNumber[roundNum].cumulativeSaved).toBe(cumulativeSaved)
    })
  })

  it('handles SPECIAL_NO_AUCTION where actual matches base (0 savings)', () => {
    const baseInstallment = 12000
    const rounds = [
      { roundNumber: 1, actualPaid: 12000 }, // No auction, full base paid
    ]

    const { metrics, roundSavingsByNumber } = computeInstallmentSavings(baseInstallment, rounds)

    expect(metrics?.totalNormalInstallments).toBe(12000)
    expect(metrics?.totalActualPaid).toBe(12000)
    expect(metrics?.totalSaved).toBe(0)
    expect(roundSavingsByNumber[1].savedThisRound).toBe(0)
  })

  it('ignores missing payments', () => {
    const baseInstallment = 12000
    const rounds = [
      { roundNumber: 1, actualPaid: 11000 },
      { roundNumber: 2, actualPaid: null }, // Missing
      { roundNumber: 3, actualPaid: 11500 },
    ]

    const { metrics, roundSavingsByNumber } = computeInstallmentSavings(baseInstallment, rounds)

    expect(metrics?.totalNormalInstallments).toBe(24000) // Only 2 rounds counted
    expect(metrics?.totalActualPaid).toBe(22500)
    expect(metrics?.totalSaved).toBe(1500)

    expect(roundSavingsByNumber[2].savedThisRound).toBeNull()
    expect(roundSavingsByNumber[2].cumulativeSaved).toBeNull()
    expect(roundSavingsByNumber[3].cumulativeSaved).toBe(1500)
  })
})
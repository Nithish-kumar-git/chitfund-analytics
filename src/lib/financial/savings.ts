export interface InstallmentSavingsMetrics {
  totalNormalInstallments: number
  totalActualPaid: number
  totalSaved: number
}

export interface RoundSavings {
  actualPaid: number | null
  savedThisRound: number | null
  cumulativeNormal: number | null
  cumulativePaid: number | null
  cumulativeSaved: number | null
}

export function computeInstallmentSavings(
  baseInstallment: number,
  rounds: { roundNumber: number, actualPaid: number | null }[]
): {
  metrics: InstallmentSavingsMetrics | null
  roundSavingsByNumber: Record<number, RoundSavings>
} {
  let runningNormal = 0
  let runningPaid = 0
  let runningSaved = 0

  const sortedRounds = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber)
  const roundSavingsByNumber: Record<number, RoundSavings> = {}

  for (const round of sortedRounds) {
    if (round.actualPaid != null && round.actualPaid > 0) {
      const savedThisRound = baseInstallment - round.actualPaid
      runningNormal += baseInstallment
      runningPaid += round.actualPaid
      runningSaved += savedThisRound

      roundSavingsByNumber[round.roundNumber] = {
        actualPaid: round.actualPaid,
        savedThisRound,
        cumulativeNormal: runningNormal,
        cumulativePaid: runningPaid,
        cumulativeSaved: runningSaved,
      }
    } else {
      roundSavingsByNumber[round.roundNumber] = {
        actualPaid: null,
        savedThisRound: null,
        cumulativeNormal: null,
        cumulativePaid: null,
        cumulativeSaved: null,
      }
    }
  }

  const metrics = runningPaid > 0 ? {
    totalNormalInstallments: runningNormal,
    totalActualPaid: runningPaid,
    totalSaved: runningSaved
  } : null

  return { metrics, roundSavingsByNumber }
}
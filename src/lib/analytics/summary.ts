import { AuctionEvent, Chit } from '@/types/database';

export interface ChitSummary {
  roundsRecorded: number;
  totalRounds: number;
  normalRoundsCompleted: number;
  avgThallu: number | null;
  maxThallu: number | null;
  minThallu: number | null;
  totalNonWinnerPayment: number;
}

export function computeChitSummary(events: AuctionEvent[], durationMonths: number = 0): ChitSummary {
  let normalRoundsCount = 0;
  let thalluCount = 0;
  let sumThallu = 0;
  let maxThallu: number | null = null;
  let minThallu: number | null = null;
  let totalPayment = 0;

  for (const event of events) {
    if (event.event_type === 'NORMAL') {
      normalRoundsCount++;
      if (event.thallu != null) {
        thalluCount++;
        sumThallu += event.thallu;
        if (maxThallu === null || event.thallu > maxThallu) {
          maxThallu = event.thallu;
        }
        if (minThallu === null || event.thallu < minThallu) {
          minThallu = event.thallu;
        }
      }
    }
    
    // We sum non_winner_payment from all valid rounds (mostly NORMAL)
    if (event.event_type !== 'UNKNOWN' && event.non_winner_payment != null) {
      totalPayment += event.non_winner_payment;
    }
  }

  const avgThallu = thalluCount > 0 ? sumThallu / thalluCount : null;

  return {
    roundsRecorded: events.length,
    totalRounds: durationMonths,
    normalRoundsCompleted: normalRoundsCount,
    avgThallu,
    maxThallu,
    minThallu,
    totalNonWinnerPayment: totalPayment,
  };
}

export interface PortfolioSummary {
  totalChits: number;
  activeChits: number;
  totalFaceValue: number;
}

export function computePortfolioSummary(chits: Chit[]): PortfolioSummary {
  const activeChits = chits.filter(c => c.status === 'ACTIVE').length;
  let totalFaceValue = 0;

  for (const chit of chits) {
    if (chit.face_value != null) {
      totalFaceValue += Number(chit.face_value);
    }
  }

  return {
    totalChits: chits.length,
    activeChits,
    totalFaceValue,
  };
}

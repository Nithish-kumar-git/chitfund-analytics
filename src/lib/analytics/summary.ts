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
  totalPaid: number;
  totalReceived: number;
  unverifiedChits: number;
}

export function computePortfolioSummary(
  chits: Chit[],
  ledgerEntries: any[]
): PortfolioSummary {
  const activeChits = chits.filter((c) => c.status === 'ACTIVE').length;
  let totalFaceValue = 0;
  let unverifiedChits = 0;

  for (const chit of chits) {
    if (chit.face_value != null) {
      totalFaceValue += Number(chit.face_value);
    }
    // A chit requires verification if it's completed but unverified
    if (chit.status === 'COMPLETED' && !chit.verified_at) {
      unverifiedChits++;
    }
  }

  // Calculate effective total paid/received
  const correctedIds = new Set<string>();
  ledgerEntries.forEach((row) => {
    if (row.entry_type === 'MANUAL_CORRECTION' && row.corrects_entry_id) {
      correctedIds.add(row.corrects_entry_id);
    }
  });

  let totalPaid = 0;
  let totalReceived = 0;

  ledgerEntries.forEach((row) => {
    if (correctedIds.has(row.id)) return; // superseded

    // For manual correction, its effective type is the corrected row's type
    let effectiveType = row.entry_type;
    if (row.entry_type === 'MANUAL_CORRECTION' && row.corrects_entry_id) {
      const original = ledgerEntries.find((e) => e.id === row.corrects_entry_id);
      if (original) {
        effectiveType = original.entry_type;
      }
    }

    const amt = Math.abs(Number(row.amount));

    if (effectiveType === 'INSTALLMENT_PAID' || effectiveType === 'LATE_FEE') {
      totalPaid += amt;
    } else if (
      effectiveType === 'AUCTION_PAYOUT_RECEIVED' ||
      effectiveType === 'MATURITY_SETTLEMENT'
    ) {
      totalReceived += amt;
    } else if (effectiveType === 'ADJUSTMENT') {
      const numAmt = Number(row.amount);
      if (numAmt < 0) totalPaid += Math.abs(numAmt);
      if (numAmt > 0) totalReceived += numAmt;
    }
  });

  return {
    totalChits: chits.length,
    activeChits,
    totalFaceValue,
    totalPaid,
    totalReceived,
    unverifiedChits,
  };
}

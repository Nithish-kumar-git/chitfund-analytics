import { describe, it, expect } from 'vitest';
import { computeChitSummary, computePortfolioSummary } from './summary';
import { AuctionEvent, Chit } from '@/types/database';

describe('Analytics Summary', () => {
  describe('computeChitSummary', () => {
    it('returns empty stats for no events', () => {
      const summary = computeChitSummary([], 25);
      expect(summary).toEqual({
        roundsRecorded: 0,
        totalRounds: 25,
        normalRoundsCompleted: 0,
        avgThallu: null,
        maxThallu: null,
        minThallu: null,
        totalNonWinnerPayment: 0,
      });
    });

    it('calculates stats for NORMAL rounds correctly and uses durationMonths for totalRounds', () => {
      const events: Partial<AuctionEvent>[] = [
        { event_type: 'NORMAL', thallu: 1000, non_winner_payment: 2000 },
        { event_type: 'NORMAL', thallu: 3000, non_winner_payment: 2000 },
        { event_type: 'SPECIAL_NO_AUCTION', thallu: 5000, non_winner_payment: 2500 }, // excluded from thallu stats
        { event_type: 'NORMAL', thallu: 500, non_winner_payment: 2000 },
      ];

      const summary = computeChitSummary(events as AuctionEvent[], 25);

      expect(summary.roundsRecorded).toBe(4);
      expect(summary.totalRounds).toBe(25);
      expect(summary.normalRoundsCompleted).toBe(3);
      expect(summary.avgThallu).toBe((1000 + 3000 + 500) / 3);
      expect(summary.maxThallu).toBe(3000);
      expect(summary.minThallu).toBe(500);
      expect(summary.totalNonWinnerPayment).toBe(2000 + 2000 + 2500 + 2000);
    });

    it('handles rounds with null thallu or payments gracefully', () => {
      const events: Partial<AuctionEvent>[] = [
        { event_type: 'NORMAL', thallu: null, non_winner_payment: null },
        { event_type: 'NORMAL', thallu: 1000, non_winner_payment: 2000 },
      ];

      const summary = computeChitSummary(events as AuctionEvent[], 20);

      expect(summary.roundsRecorded).toBe(2);
      expect(summary.totalRounds).toBe(20);
      expect(summary.normalRoundsCompleted).toBe(2);
      expect(summary.avgThallu).toBe(1000);
      expect(summary.maxThallu).toBe(1000);
      expect(summary.minThallu).toBe(1000);
      expect(summary.totalNonWinnerPayment).toBe(2000);
    });
  });

  describe('computePortfolioSummary', () => {
    it('aggregates correctly across chits and ledger entries', () => {
      const chits: Partial<Chit>[] = [
        { status: 'ACTIVE', face_value: 100000, verified_at: null },
        { status: 'COMPLETED', face_value: 200000, verified_at: null }, // unverified
        { status: 'COMPLETED', face_value: 300000, verified_at: '2026-01-01T00:00:00Z' }, // verified
      ];

      const ledgerEntries = [
        { id: '1', entry_type: 'INSTALLMENT_PAID', amount: 10000 },
        { id: '2', entry_type: 'AUCTION_PAYOUT_RECEIVED', amount: 95000 },
        { id: '3', entry_type: 'INSTALLMENT_PAID', amount: 5000 },
        { id: '4', entry_type: 'MANUAL_CORRECTION', amount: 4500, corrects_entry_id: '3' }, // 5000 superseded, 4500 effective
      ];

      const summary = computePortfolioSummary(chits as Chit[], ledgerEntries);

      expect(summary.totalChits).toBe(3);
      expect(summary.activeChits).toBe(1);
      expect(summary.totalFaceValue).toBe(600000);
      expect(summary.unverifiedChits).toBe(1);
      expect(summary.totalPaid).toBe(10000 + 4500);
      expect(summary.totalReceived).toBe(95000);
    });
  });
});

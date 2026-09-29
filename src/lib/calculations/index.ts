/**
 * Chit Fund Analytics — Calculation Engine Public API
 *
 * Re-exports everything consumers need from one location.
 * Import from '@/lib/calculations' not from sub-files directly.
 */

export { calculateAuction, roundForDisplay } from './calculation'
export type {
  ChitEventType,
  NormalAuctionInput,
  AuctionCalculationResult,
  CalculationSuccess,
  CalculationNotApplicable,
  CalculationError,
  ValidationError,
} from './types'

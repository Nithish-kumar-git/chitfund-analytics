import { DataQualityFlag } from '@/lib/statement/build-statement-data'

export type FlagSeverity = 'CRITICAL' | 'VERIFICATION' | 'METADATA'

export function classifyQualityFlag(flag: DataQualityFlag): FlagSeverity {
  switch (flag.kind) {
    case 'FLAGGED_MISMATCH':
    case 'UNKNOWN_EVENT':
    case 'MISSING_WINNER':
    case 'MISSING_CASH_FLOW':
      return 'CRITICAL'
    case 'UNVERIFIED_COMPLETED':
      return 'VERIFICATION'
    case 'MISSING_AUCTION_DATE':
      return 'METADATA'
  }
}
